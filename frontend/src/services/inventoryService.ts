import { API_BASE_URL } from '../config/api';

export type InventoryAddOnCreatePayload = {
  date: string; // ISO string
  location_store: string;
  line_items: Array<{
    item_name: string;
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
    description?: string | null;
    quantity: number;
    created_at: string;
  }>;
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

