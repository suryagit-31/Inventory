from __future__ import annotations

from datetime import datetime
from html import escape
from typing import Iterable
from urllib.parse import quote

import msal
import requests

from app.config import settings
from app.models.sample_issue import SampleIssue

_GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"


def _build_subject(issue: SampleIssue) -> str:
    return f"Sample Issued: {issue.doc_number} | Project {issue.project_id}"


def _format_issue_datetime(issue: SampleIssue) -> str:
    issued_at = issue.created_at or issue.date_of_issue
    if not issued_at:
        return ""
    if isinstance(issued_at, datetime):
        # 12-hour clock with AM/PM, no seconds (portable on Windows).
        date_part = issued_at.strftime("%B %d, %Y")
        hour12 = issued_at.strftime("%I").lstrip("0") or "12"
        minute = issued_at.strftime("%M")
        am_pm = issued_at.strftime("%p")
        return f"{date_part} at {hour12}:{minute} {am_pm}"
    return str(issued_at)


def _build_line_items_table(issue: SampleIssue) -> str:
    rows: list[str] = []
    for line in issue.line_items:
        rows.append(
            "<tr>"
            f"<td>{escape(line.item_name or '')}</td>"
            f"<td>{escape((line.work_id or '').strip())}</td>"
            f"<td>{float(line.qty_issue or 0.0):.2f}</td>"
            f"<td>{escape(line.description or '-')}</td>"
            "</tr>"
        )

    if not rows:
        rows.append("<tr><td colspan='4'>No line items</td></tr>")

    return (
        "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse: collapse;'>"
        "<thead><tr>"
        "<th>Item Name</th><th>Work ID</th><th>Qty Issued</th><th>Description</th>"
        "</tr></thead>"
        f"<tbody>{''.join(rows)}</tbody>"
        "</table>"
    )


def _build_html_body(issue: SampleIssue) -> str:
    return (
        "<html><body>"
        "<p>A new sample issue has been submitted with status <b>Issued</b>.</p>"
        "<p>"
        f"<b>Document Number:</b> {escape(issue.doc_number or '')}<br/>"
        f"<b>Project ID:</b> {escape(issue.project_id or '')}<br/>"
        f"<b>Customer:</b> {escape(issue.customer_name or '')}<br/>"
        f"<b>Business Unit:</b> {escape(issue.business_unit or '')}<br/>"
        f"<b>Store:</b> {escape(issue.location_stored or '')}<br/>"
        f"<b>Issue Date & Time:</b> {escape(_format_issue_datetime(issue))}"
        "</p>"
        "<p><b>Issued Line Items</b></p>"
        f"{_build_line_items_table(issue)}"
        "</body></html>"
    )


def _recipient_addresses() -> list[str]:
    # Supports one or many recipients from a single env var:
    # SAMPLE_ISSUE_EMAIL_TO=a@x.com,b@y.com,c@z.com
    raw = settings.SAMPLE_ISSUE_EMAIL_TO or ""
    recipients = [addr.strip() for addr in raw.split(",") if addr.strip()]
    # Preserve order and drop duplicates.
    return list(dict.fromkeys(recipients))


def _to_graph_recipients(addresses: Iterable[str]) -> list[dict]:
    return [{"emailAddress": {"address": addr}} for addr in addresses]


def _acquire_graph_token() -> str:
    authority = f"https://login.microsoftonline.com/{settings.BILL_PROCESSING_AZURE_TENANT_ID}"
    app = msal.ConfidentialClientApplication(
        client_id=settings.BILL_PROCESSING_AZURE_CLIENT_ID,
        client_credential=settings.BILL_PROCESSING_AZURE_CLIENT_SECRET,
        authority=authority,
    )
    token_result = app.acquire_token_for_client(scopes=[settings.BILL_PROCESSING_AZURE_SCOPE])
    access_token = token_result.get("access_token")
    if not access_token:
        error = token_result.get("error_description") or token_result.get("error") or "Unknown token error"
        raise RuntimeError(f"Failed to acquire Graph token: {error}")
    return access_token


def send_sample_issue_issued_email(issue: SampleIssue) -> None:
    if not settings.BILL_PROCESSING_AZURE_TENANT_ID:
        raise RuntimeError("Missing BILL_PROCESSING_AZURE_TENANT_ID")
    if not settings.BILL_PROCESSING_AZURE_CLIENT_ID:
        raise RuntimeError("Missing BILL_PROCESSING_AZURE_CLIENT_ID")
    if not settings.BILL_PROCESSING_AZURE_CLIENT_SECRET:
        raise RuntimeError("Missing BILL_PROCESSING_AZURE_CLIENT_SECRET")
    if not settings.BILL_PROCESSING_GRAPH_SENDER:
        raise RuntimeError("Missing BILL_PROCESSING_GRAPH_SENDER")

    recipients = _recipient_addresses()
    if not recipients:
        raise RuntimeError("No recipients configured for sample issue email")

    print(
        f"Sending Sample Issue email for {issue.doc_number} "
        f"from {settings.BILL_PROCESSING_GRAPH_SENDER} to {recipients}"
    )

    access_token = _acquire_graph_token()
    sender = quote(settings.BILL_PROCESSING_GRAPH_SENDER)
    send_url = f"{_GRAPH_BASE_URL}/users/{sender}/sendMail"

    payload = {
        "message": {
            "subject": _build_subject(issue),
            "body": {
                "contentType": "HTML",
                "content": _build_html_body(issue),
            },
            "toRecipients": _to_graph_recipients(recipients),
        },
        "saveToSentItems": "true",
    }

    response = requests.post(
        send_url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30,
    )
    if response.status_code not in (200, 202):
        raise RuntimeError(
            f"Graph sendMail failed ({response.status_code}): {response.text[:500]}"
        )
    print(
        f"Graph sendMail accepted for {issue.doc_number} "
        f"(status={response.status_code})"
    )
