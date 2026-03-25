import { API_BASE_URL } from '../config/api';

export type ItemResponse = {
  id: string;
  item_name: string;
  description?: string | null;
  location?: string | null;
  qty_on_hand: number;
  qty_issued: number;
  qty_available: number;
  created_at: string;
  updated_at: string;
};

export type ItemSearchResult = {
  id: string;
  item_name: string;
  description?: string | null;
  location?: string | null;
  qty_on_hand: number;
  qty_issued: number;
  qty_available: number;
};

export async function listItems(params?: {
  location?: string;
  skip?: number;
  limit?: number;
}): Promise<ItemResponse[]> {
  const search = new URLSearchParams();
  search.set('skip', String(params?.skip ?? 0));
  search.set('limit', String(params?.limit ?? 1000));
  if (params?.location) search.set('location', params.location);

  const response = await fetch(`${API_BASE_URL}/api/items/?${search.toString()}`);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const json = await response.json();
      detail = json?.detail || JSON.stringify(json);
    } catch {
      // ignore
    }
    throw new Error(`Failed to load items: ${detail}`);
  }
  return await response.json();
}

export async function searchItems(params: {
  q: string;
  limit?: number;
  location?: string;
}): Promise<ItemSearchResult[]> {
  const q = (params.q || '').trim();
  // Allow empty query when location is provided (so the UI can show "all items in store").
  const location = (params.location || '').trim();
  if (!q && !location) return [];

  const search = new URLSearchParams();
  search.set('q', q);
  search.set('limit', String(params.limit ?? 10));
  if (location) search.set('location', location);

  const response = await fetch(`${API_BASE_URL}/api/items/search?${search.toString()}`);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const json = await response.json();
      detail = json?.detail || JSON.stringify(json);
    } catch {
      // ignore
    }
    throw new Error(`Failed to search items: ${detail}`);
  }
  return await response.json();
}
