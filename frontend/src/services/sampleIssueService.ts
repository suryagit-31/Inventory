import { API_BASE_URL } from '../config/api';

const dbg = (...args: unknown[]) => {
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.info('[sampleIssueService]', ...args);
  }
};

async function fetchOrLog(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    dbg('fetch failed (DNS/CORS/offline?)', { url, error: e });
    throw e;
  }
}

export type SampleIssueCreatePayload = {
  project_id: string;
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
    work_id: string;
    description?: string | null;
    qty_on_hand: number;
    qty_issue: number;
  }>;
};

export type SampleIssueResponse = {
  id: string;
  doc_number: string;
  project_id: string;
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
    work_id?: string | null;
    description?: string | null;
    qty_on_hand: number;
    qty_issue: number;
    created_at: string;
  }>;
};

export async function createSampleIssue(
  payload: SampleIssueCreatePayload
): Promise<SampleIssueResponse> {
  const url = `${API_BASE_URL}/api/sample-issues/`;
  dbg('POST', url, { lineItems: payload.line_items?.length ?? 0 });
  const response = await fetchOrLog(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  dbg('POST response', url, response.status, response.statusText);

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const json = await response.json();
      detail = json?.detail || JSON.stringify(json);
    } catch {
      // ignore
    }
    dbg('POST error body', detail);
    throw new Error(`Failed to save sample issue: ${detail}`);
  }

  return await response.json();
}

export async function listSampleIssues(params?: {
  skip?: number;
  limit?: number;
  status_filter?: string;
  project_id?: string;
}): Promise<SampleIssueResponse[]> {
  const search = new URLSearchParams();
  search.set('skip', String(params?.skip ?? 0));
  search.set('limit', String(params?.limit ?? 100));
  if (params?.status_filter) search.set('status_filter', params.status_filter);
  if (params?.project_id) search.set('project_id', params.project_id);

  const url = `${API_BASE_URL}/api/sample-issues/?${search.toString()}`;
  dbg('GET', url, { API_BASE_URL: API_BASE_URL || '(empty = CRA proxy)' });
  const response = await fetchOrLog(url);
  dbg('GET list response', response.status, response.statusText);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const json = await response.json();
      detail = json?.detail || JSON.stringify(json);
    } catch {
      // ignore
    }
    dbg('GET list error body', detail);
    throw new Error(`Failed to load sample issues: ${detail}`);
  }

  const data = await response.json();
  dbg('GET list ok', {
    isArray: Array.isArray(data),
    length: Array.isArray(data) ? data.length : undefined,
    topLevelKeys: data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data as object) : undefined,
  });
  return data;
}

export async function getSampleIssueByDocNumber(docNumber: string): Promise<SampleIssueResponse> {
  const url = `${API_BASE_URL}/api/sample-issues/doc/${encodeURIComponent(docNumber)}`;
  dbg('GET by doc', url);
  const response = await fetchOrLog(url);
  dbg('GET by doc response', response.status, response.statusText);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const json = await response.json();
      detail = json?.detail || JSON.stringify(json);
    } catch {
      // ignore
    }
    dbg('GET by doc error body', detail);
    throw new Error(`Failed to load sample issue: ${detail}`);
  }
  return await response.json();
}

export type ReturnableLine = {
  item_name: string;
  work_id: string;
  description?: string | null;
  qty_issued_total: number;
  qty_returned_total: number;
  qty_remaining: number;
  inventory_qty_on_hand?: number | null;
  inventory_qty_issued?: number | null;
  inventory_qty_available?: number | null;
};

export async function getIssueReturnable(issueId: string): Promise<ReturnableLine[]> {
  const url = `${API_BASE_URL}/api/sample-issues/${encodeURIComponent(issueId)}/returnable`;
  dbg('GET returnable', url);
  const response = await fetchOrLog(url);
  dbg('GET returnable response', response.status, response.statusText);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const json = await response.json();
      detail = json?.detail || JSON.stringify(json);
    } catch {
      // ignore
    }
    dbg('GET returnable error body', detail);
    throw new Error(`Failed to load returnable quantities: ${detail}`);
  }
  return await response.json();
}
