import { API_BASE_URL } from '../config/api';

export type InventoryAddOnCreatePayload = {
  date: string; // ISO string
  location_store: string;
  line_items: Array<{
    item_name: string;
    work_id: string;
    description?: string;
    quantity: number;
  }>;
};

export type InventoryAddOnResponse = {
  id: string;
  doc_number: string;
  date: string;
  location_store: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  line_items: Array<{
    id: string;
    header_id: string;
    item_name: string;
    work_id?: string | null;
    description?: string | null;
    quantity: number;
    created_at: string;
  }>;
};

export type InventoryAddOnLineListItem = {
  header_id: string;
  line_id: string;
  doc_number: string;
  date: string;
  location_store: string;
  item_name: string;
  work_id?: string | null;
  description?: string | null;
  quantity: number;
  created_at: string;
};

export async function createInventoryAddOn(
  payload: InventoryAddOnCreatePayload
): Promise<InventoryAddOnResponse> {
  const response = await fetch(`${API_BASE_URL}/api/inventory/`, {
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
    throw new Error(`Failed to save inventory add-on: ${detail}`);
  }

  return await response.json();
}

export async function listRecentInventoryAddOnLines(params?: {
  skip?: number;
  limit?: number;
}): Promise<InventoryAddOnLineListItem[]> {
  const search = new URLSearchParams();
  search.set('skip', String(params?.skip ?? 0));
  search.set('limit', String(params?.limit ?? 100));

  const response = await fetch(`${API_BASE_URL}/api/inventory/lines?${search.toString()}`);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const json = await response.json();
      detail = json?.detail || JSON.stringify(json);
    } catch {
      // ignore
    }
    throw new Error(`Failed to load recent inventory add-ons: ${detail}`);
  }

  return await response.json();
}

export async function getInventoryAddOn(addonId: string): Promise<InventoryAddOnResponse> {
  const response = await fetch(`${API_BASE_URL}/api/inventory/${encodeURIComponent(addonId)}`);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const json = await response.json();
      detail = json?.detail || JSON.stringify(json);
    } catch {
      // ignore
    }
    throw new Error(`Failed to load inventory add-on: ${detail}`);
  }
  return await response.json();
}
