import { API_BASE_URL } from '../config/api';

export type SampleIssueCreatePayload = {
  project_number: string;
  customer_name?: string | null;
  salesperson?: string | null;
  project_manager?: string | null;
  date_of_issue: string; // ISO string
  business_unit?: string | null;
  subsidiary?: string | null;
  location_stored?: string | null;
  disposition_type: string;
  status?: string;
  line_items: Array<{
    item_name: string;
    description?: string | null;
    qty_on_hand: number;
    qty_issue: number;
  }>;
};

export type SampleIssueResponse = {
  id: string;
  doc_number: string;
  project_number: string;
  customer_name?: string | null;
  salesperson?: string | null;
  project_manager?: string | null;
  date_of_issue: string;
  business_unit?: string | null;
  subsidiary?: string | null;
  location_stored?: string | null;
  disposition_type: string;
  status: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  line_items: Array<{
    id: string;
    header_id: string;
    item_name: string;
    description?: string | null;
    qty_on_hand: number;
    qty_issue: number;
    created_at: string;
  }>;
};

export async function createSampleIssue(
  payload: SampleIssueCreatePayload
): Promise<SampleIssueResponse> {
  const response = await fetch(`${API_BASE_URL}/api/sample-issues/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const json = await response.json();
      detail = json?.detail || JSON.stringify(json);
    } catch {
      // ignore
    }
    throw new Error(`Failed to save sample issue: ${detail}`);
  }

  return await response.json();
}

export async function listSampleIssues(params?: {
  skip?: number;
  limit?: number;
  status_filter?: string;
  project_number?: string;
}): Promise<SampleIssueResponse[]> {
  const search = new URLSearchParams();
  search.set('skip', String(params?.skip ?? 0));
  search.set('limit', String(params?.limit ?? 100));
  if (params?.status_filter) search.set('status_filter', params.status_filter);
  if (params?.project_number) search.set('project_number', params.project_number);

  const response = await fetch(`${API_BASE_URL}/api/sample-issues/?${search.toString()}`);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const json = await response.json();
      detail = json?.detail || JSON.stringify(json);
    } catch {
      // ignore
    }
    throw new Error(`Failed to load sample issues: ${detail}`);
  }

  return await response.json();
}

export type ReturnableLine = {
  item_name: string;
  description?: string | null;
  qty_issued_total: number;
  qty_returned_total: number;
  qty_remaining: number;
  inventory_qty_on_hand?: number | null;
  inventory_qty_issued?: number | null;
  inventory_qty_available?: number | null;
};

export async function getIssueReturnable(issueId: string): Promise<ReturnableLine[]> {
  const response = await fetch(`${API_BASE_URL}/api/sample-issues/${encodeURIComponent(issueId)}/returnable`);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const json = await response.json();
      detail = json?.detail || JSON.stringify(json);
    } catch {
      // ignore
    }
    throw new Error(`Failed to load returnable quantities: ${detail}`);
  }
  return await response.json();
}
