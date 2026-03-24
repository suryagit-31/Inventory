import { API_BASE_URL } from '../config/api';

export type SampleReturnCreatePayload = {
  original_issue_id: string;
  date_of_return: string; // naive datetime string
  remarks?: string | null;
  reason_for_return?: string | null;
  status?: string; // Draft | Returned
  line_items: Array<{
    item_name: string;
    description?: string | null;
    qty_issued: number;
    qty_return: number;
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
    description?: string | null;
    qty_issued: number;
    qty_return: number;
    created_at: string;
  }>;
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

