import { API_BASE_URL } from '../config/api';

export type SampleReturnCreatePayload = {
  original_issue_id: string;
  date_of_return: string; // naive datetime string
  remarks?: string | null;
  reason_for_return?: string | null;
  status?: string; // Draft | Returned
  line_items: Array<{
    item_name: string;
    work_id: string;
    description?: string | null;
    qty_issued: number;
    qty_return: number;
    condition: string; // Good | Damaged | Lost
  }>;
};

export type SampleReturnResponse = {
  id: string;
  doc_number: string;
  original_issue_id: string;
  date_of_return: string;
  remarks?: string | null;
  reason_for_return?: string | null;
  status: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  line_items: Array<{
    id: string;
    header_id: string;
    item_name: string;
    work_id: string;
    description?: string | null;
    qty_issued: number;
    qty_return: number;
    condition: string;
    created_at: string;
  }>;
};

export type SampleReturnSummary = {
  id: string;
  doc_number: string;
  original_issue_id: string;
  original_issue_doc_number: string;
  store_location?: string | null;
  date_of_return: string;
  status: string;
  return_scope: string; // Draft | Partial | Full
  line_count: number;
  total_qty_return: number;
};

export async function createSampleReturn(
  payload: SampleReturnCreatePayload
): Promise<SampleReturnResponse> {
  const response = await fetch(`${API_BASE_URL}/api/sample-returns/`, {
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
    throw new Error(`Failed to create sample return: ${detail}`);
  }

  return await response.json();
}

export async function listSampleReturnSummaries(params?: {
  skip?: number;
  limit?: number;
  q?: string;
}): Promise<SampleReturnSummary[]> {
  const search = new URLSearchParams();
  search.set('skip', String(params?.skip ?? 0));
  search.set('limit', String(params?.limit ?? 50));
  if (params?.q && params.q.trim()) {
    search.set('q', params.q.trim());
  }

  const response = await fetch(`${API_BASE_URL}/api/sample-returns/summaries?${search.toString()}`);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const json = await response.json();
      detail = json?.detail || JSON.stringify(json);
    } catch {
      // ignore
    }
    throw new Error(`Failed to load sample returns: ${detail}`);
  }
  return await response.json();
}

export async function getSampleReturn(returnId: string): Promise<SampleReturnResponse> {
  const response = await fetch(`${API_BASE_URL}/api/sample-returns/${encodeURIComponent(returnId)}`);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const json = await response.json();
      detail = json?.detail || JSON.stringify(json);
    } catch {
      // ignore
    }
    throw new Error(`Failed to load sample return: ${detail}`);
  }
  return await response.json();
}
