import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LOCATIONS } from '../types/sample.types';
import { useToast } from '../components/Toast/ToastContext';
import { createInventoryAddOn, getInventoryAddOn, InventoryAddOnResponse, listRecentInventoryAddOnLines, InventoryAddOnLineListItem } from '../services/inventoryService';
import { searchItems, ItemSearchResult } from '../services/itemsService';
import { localISODate } from '../utils/date';
import './SampleIssuePage.css';
import './InventoryAddOnPage.css';
import './InventoryAddOnPagePrint.css';

interface InventoryLineItem {
  id: string;
  itemName: string;
  description: string;
  quantity: number | '';
}

interface InventoryAddOn {
  docNumber: string;
  date: string;
  locationStore: string;
  lineItems: InventoryLineItem[];
}

type PrintableInventoryAddOnDocProps = {
  recentLines: InventoryAddOnLineListItem[];
};

function PrintableInventoryAddOnDoc({ recentLines }: PrintableInventoryAddOnDocProps) {
  const printedAt = new Date();
  const totalQty = (recentLines || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0);

  return (
    <div className="print-doc">
      <div className="print-header">
        <div className="print-brand">
          <img
            className="print-logo"
            src={`${process.env.PUBLIC_URL}/Fulllogo.png`}
            alt="Company logo"
          />
          <div>
            <div className="print-title">Inventory Add-Ons</div>
            <div className="print-subtitle">Printed: {printedAt.toLocaleString()}</div>
          </div>
        </div>
        <div className="print-meta">
          <div><span className="k">Rows</span><span className="v">{recentLines.length}</span></div>
          <div><span className="k">Total Qty</span><span className="v">{totalQty}</span></div>
        </div>
      </div>

      <div className="print-section">
        <div className="print-section-title">Recent Inventory Add-Ons (Added Items)</div>
        <table className="print-table">
          <thead>
            <tr>
              <th>Doc #</th>
              <th>Store</th>
              <th>Item Name</th>
              <th>Description</th>
              <th style={{ width: '90px' }}>Qty</th>
              <th style={{ width: '110px' }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {recentLines.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">No recent add-ons found.</td>
              </tr>
            ) : (
              recentLines.map((row) => (
                <tr key={row.line_id}>
                  <td>{row.doc_number}</td>
                  <td>{row.location_store}</td>
                  <td>{row.item_name}</td>
                  <td>{row.description || ''}</td>
                  <td className="num">{row.quantity}</td>
                  <td>{(row.date || '').slice(0, 10)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function normalizeItemKey(name: string): string {
  // Strict whitespace removal so: iphone14 == iphone 14 == iphone   14
  return (name || '').trim().replace(/\s+/g, '').toUpperCase();
}

function mergeDuplicateLineItems(lineItems: InventoryLineItem[]) {
  const indexByKey = new Map<string, number>();
  const mergedNotices: Array<{ itemName: string; addedQty: number }> = [];

  const merged: InventoryLineItem[] = [];
  for (const li of lineItems) {
    const key = normalizeItemKey(li.itemName);
    if (!key) {
      merged.push({ ...li });
      continue;
    }

    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, merged.length);
      merged.push({ ...li, itemName: li.itemName.trim().replace(/\s+/g, ' ') });
      continue;
    }

    const existing = merged[existingIndex];
    const existingQty = existing.quantity === '' ? 0 : Number(existing.quantity);
    const addQty = li.quantity === '' ? 0 : Number(li.quantity);
    existing.quantity = existingQty + addQty;

    const existingDesc = (existing.description || '').trim();
    const incomingDesc = (li.description || '').trim();
    if (!existingDesc && incomingDesc) {
      existing.description = incomingDesc;
    }

    mergedNotices.push({
      itemName: (existing.itemName || li.itemName || '').trim(),
      addedQty: addQty,
    });
  }

  return { merged, mergedNotices };
}

const InventoryAddOnPage: React.FC = () => {
  const toast = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<InventoryAddOn>({
    docNumber: '',
    date: localISODate(),
    locationStore: '',
    lineItems: []
  });

  const pageSize = 100;
  const [recentLines, setRecentLines] = useState<InventoryAddOnLineListItem[]>([]);
  const [recentPage, setRecentPage] = useState(0);
  const [recentHasMore, setRecentHasMore] = useState(true);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [recentRefreshToken, setRecentRefreshToken] = useState(0);
  const [viewAddOn, setViewAddOn] = useState<InventoryAddOnResponse | null>(null);
  const [isLoadingViewAddOn, setIsLoadingViewAddOn] = useState(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const itemInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const [typeahead, setTypeahead] = useState<{
    rowId: string | null;
    query: string;
    results: ItemSearchResult[];
    isOpen: boolean;
    isLoading: boolean;
  }>({
    rowId: null,
    query: '',
    results: [],
    isOpen: false,
    isLoading: false,
  });

  const [typeaheadPos, setTypeaheadPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const selectedStore = (formData.locationStore || '').trim();

  const handleViewAddOn = async (addonId: string) => {
    const id = (addonId || '').trim();
    if (!id) return;
    setIsLoadingViewAddOn(true);
    try {
      const addon = await getInventoryAddOn(id);
      setViewAddOn(addon);
    } catch (error: any) {
      console.error('Failed to load inventory add-on:', error);
      toast.error(error?.message || 'Unable to load inventory add-on.');
    } finally {
      setIsLoadingViewAddOn(false);
    }
  };

  const updateTypeaheadPosition = useCallback((rowId: string) => {
    const el = itemInputRefs.current.get(rowId);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTypeaheadPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  const closeTypeahead = useCallback(() => {
    setTypeahead({ rowId: null, query: '', results: [], isOpen: false, isLoading: false });
    setTypeaheadPos(null);
  }, []);

  useEffect(() => {
    const rowId = typeahead.rowId;
    const query = typeahead.query.trim();
    if (!rowId || (!query && !selectedStore)) {
      setTypeahead((prev) => ({ ...prev, results: [], isOpen: false, isLoading: false }));
      setTypeaheadPos(null);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setTypeahead((prev) => ({ ...prev, isLoading: true }));
      try {
        const results = await searchItems({ q: query, limit: 10, location: selectedStore || undefined });
        setTypeahead((prev) => ({ ...prev, results, isOpen: true, isLoading: false }));
        updateTypeaheadPosition(rowId);
      } catch (error: any) {
        console.error('Item search failed:', error);
        setTypeahead((prev) => ({ ...prev, results: [], isOpen: true, isLoading: false }));
        updateTypeaheadPosition(rowId);
      }
    }, 400);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [selectedStore, typeahead.query, typeahead.rowId, updateTypeaheadPosition]);

  // When store changes, clear typeahead and line items (store-scoped inventory add-on).
  useEffect(() => {
    closeTypeahead();
    setFormData((prev) => ({ ...prev, lineItems: [] }));
  }, [closeTypeahead, selectedStore]);

  useEffect(() => {
    if (!typeahead.isOpen || !typeahead.rowId) return;

    const onScroll = () => updateTypeaheadPosition(typeahead.rowId!);
    const onResize = () => updateTypeaheadPosition(typeahead.rowId!);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [typeahead.isOpen, typeahead.rowId, updateTypeaheadPosition]);

  useEffect(() => {
    if (!typeahead.isOpen || !typeahead.rowId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTypeahead();
    };

    const onMouseDown = (e: MouseEvent) => {
      const rowId = typeahead.rowId!;
      const inputEl = itemInputRefs.current.get(rowId);
      const dropdownEl = document.getElementById('inventory-item-typeahead');
      const target = e.target as Node | null;
      if (target && (inputEl?.contains(target) || dropdownEl?.contains(target))) return;
      closeTypeahead();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown, true);
    };
  }, [closeTypeahead, typeahead.isOpen, typeahead.rowId]);

  useEffect(() => {
    const loadRecent = async () => {
      setIsLoadingRecent(true);
      try {
        const skip = recentPage * pageSize;
        const data = await listRecentInventoryAddOnLines({ skip, limit: pageSize });
        setRecentLines(data);
        setRecentHasMore(data.length === pageSize);
      } catch (error: any) {
        console.error('Failed to load recent inventory add-ons:', error);
        toast.error(error?.message || 'Unable to load recent inventory add-ons.');
      } finally {
        setIsLoadingRecent(false);
      }
    };

    loadRecent();
  }, [recentPage, pageSize, recentRefreshToken, toast]);

  const handleInputChange = (field: keyof InventoryAddOn, value: any) => {
    setFormData({
      ...formData,
      [field]: value
    });
  };

  const addLineItem = () => {
    const newItem: InventoryLineItem = {
      id: Date.now().toString(),
      itemName: '',
      description: '',
      quantity: ''
    };
    setFormData({
      ...formData,
      lineItems: [...formData.lineItems, newItem]
    });
  };

  const removeLineItem = (id: string) => {
    setFormData({
      ...formData,
      lineItems: formData.lineItems.filter(item => item.id !== id)
    });
  };

  const updateLineItem = (id: string, field: keyof InventoryLineItem, value: any) => {
    setFormData({
      ...formData,
      lineItems: formData.lineItems.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    });
  };

  const updateItemNameAndMaybeMerge = (id: string, nextName: string) => {
    let mergedNotices: Array<{ itemName: string; addedQty: number }> = [];

    setFormData((prev) => {
      const nextLineItems = prev.lineItems.map((li) =>
        li.id === id ? { ...li, itemName: nextName } : li
      );
      const mergedResult = mergeDuplicateLineItems(nextLineItems);
      mergedNotices = mergedResult.mergedNotices;
      return { ...prev, lineItems: mergedResult.merged };
    });

    if (mergedNotices.length) {
      const first = mergedNotices[0];
      toast.info(`Merged duplicate item lines: ${first.itemName}${first.addedQty ? ` (+${first.addedQty})` : ''}`);
    }
  };

  const handleSelectSuggestion = useCallback((rowId: string, item: ItemSearchResult) => {
    let mergedNotices: Array<{ itemName: string; addedQty: number }> = [];

    setFormData((prev) => {
      const nextLineItems = prev.lineItems.map((li) => {
        if (li.id !== rowId) return li;
        const currentDesc = (li.description || '').trim();
        return {
          ...li,
          itemName: item.item_name,
          // If the user hasn't typed a description, auto-fill from the store-filtered search result.
          description: currentDesc ? li.description : (item.description || ''),
        };
      });
      const mergedResult = mergeDuplicateLineItems(nextLineItems);
      mergedNotices = mergedResult.mergedNotices;
      return { ...prev, lineItems: mergedResult.merged };
    });

    closeTypeahead();

    if (mergedNotices.length) {
      const first = mergedNotices[0];
      toast.info(`Merged duplicate item lines: ${first.itemName}${first.addedQty ? ` (+${first.addedQty})` : ''}`);
    }
  }, [closeTypeahead, toast]);

  const typeaheadPortal = useMemo(() => {
    if (!typeahead.isOpen || !typeahead.rowId) return null;
    if (!typeaheadPos) return null;
    if (!typeahead.isLoading && typeahead.results.length === 0) return null;

    return createPortal(
      <div
        id="inventory-item-typeahead"
        className="typeahead-portal"
        style={{
          top: typeaheadPos.top,
          left: typeaheadPos.left,
          width: typeaheadPos.width,
        }}
      >
        <div className="typeahead-dropdown">
          {typeahead.isLoading ? (
            <div className="typeahead-empty">Searching…</div>
          ) : (
            <ul className="typeahead-list">
              {typeahead.results.map((r) => (
                <li
                  key={r.id}
                  className="typeahead-item"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectSuggestion(typeahead.rowId!, r)}
                >
                  <div className="typeahead-name">{r.item_name}</div>
                  {!!r.description && <div className="typeahead-desc">{r.description}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>,
      document.body
    );
  }, [handleSelectSuggestion, typeahead.isLoading, typeahead.isOpen, typeahead.results, typeahead.rowId, typeaheadPos]);

  const handleSave = async () => {
    if (!formData.locationStore || formData.lineItems.length === 0) {
      toast.warning('Please select location and add at least one item');
      return;
    }

    // Ensure duplicates are merged before validating/saving (UI convenience; backend is authoritative too).
    const mergeResult = mergeDuplicateLineItems(formData.lineItems);
    const effectiveLineItems = mergeResult.merged;
    if (mergeResult.mergedNotices.length) {
      setFormData((prev) => ({ ...prev, lineItems: effectiveLineItems }));
    }

    for (let i = 0; i < effectiveLineItems.length; i++) {
      const item = effectiveLineItems[i];
      const row = i + 1;
      const name = (item.itemName || '').trim();

      if (!name) {
        toast.warning(`Row ${row}: enter item name.`);
        return;
      }
      if (item.quantity === '') {
        toast.warning(`Row ${row} (${name}): enter quantity.`);
        return;
      }
      if (Number(item.quantity) <= 0) {
        toast.warning(`Row ${row} (${name}): quantity must be greater than 0.`);
        return;
      }
    }

    if (isSaving) return;

    setIsSaving(true);
    try {
        const payload = {
          // Send a "naive" datetime string (no timezone) to avoid date shifting (e.g. IST -> previous UTC day).
          date: `${formData.date}T00:00:00`,
          location_store: formData.locationStore,
          line_items: effectiveLineItems.map((item) => ({
            item_name: item.itemName.trim(),
            description: item.description?.trim() || undefined,
            quantity: Number(item.quantity),
          })),
        };

      const saved = await createInventoryAddOn(payload);
      toast.success(`Inventory added successfully (${saved.doc_number})`);

      // Reset form (doc # is server-generated; keep UI placeholder).
      setFormData({
        docNumber: saved.doc_number,
        date: localISODate(),
        locationStore: '',
        lineItems: []
      });

      setRecentPage(0);
      setRecentRefreshToken((v) => v + 1);
    } catch (error: any) {
      console.error('Failed to save inventory add-on:', error);
      toast.error(error?.message || 'Unable to save inventory add-on. Please try again.');
    } finally {
      setIsSaving(false);
    }

  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="sample-issue-page">
      <div className="no-print">
      <div className="page-header">
        <h1>Inventory Add-On</h1>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={handleSave}>Save & Add to Inventory</button>
        </div>
      </div>

      <div className="form-card">
        {/* DOCUMENT DETAILS SECTION */}
        <div className="form-section">
          <h2>Document Details</h2>
          <div className="document-details-grid">
            <div className="form-group">
              <label>Doc # <span className="auto-label">(Auto-generated)</span></label>
              <input
                type="text"
                value={formData.docNumber || ''}
                disabled
                className="input-field input-disabled"
                placeholder="Auto-generated on save"
              />
            </div>

            <div className="form-group">
              <label>Date</label>
              <input
                type="date"
                value={formData.date || ''}
                disabled
                className="input-field input-disabled"
              />
            </div>

            <div className="form-group">
              <label>Location Store <span className="required">*</span></label>
              <select
                value={formData.locationStore}
                onChange={(e) => handleInputChange('locationStore', e.target.value)}
                className="input-field"
              >
                <option value="">Select Location</option>
                {LOCATIONS.map(location => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* LINE ITEMS SECTION */}
        <div className="form-section">
          <div className="section-header">
            <h2>Items to Add</h2>
            <button className="btn btn-add" onClick={addLineItem} disabled={!selectedStore}>+ Add Item</button>
          </div>
          {!selectedStore && (
            <div className="info-box" style={{ marginTop: 0 }}>
              <h3>Select Store First</h3>
              <ul>
                <li>Select a Location Store to start adding items.</li>
                <li>Item suggestions will be filtered to that store (including zero qty items).</li>
              </ul>
            </div>
          )}

          <div className="table-container">
            <table className="line-items-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {formData.lineItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty-state">
                      No items added. Click "Add Item" to begin.
                    </td>
                  </tr>
                ) : (
                  formData.lineItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="typeahead-cell">
                          <input
                            ref={(el) => {
                              if (el) itemInputRefs.current.set(item.id, el);
                              else itemInputRefs.current.delete(item.id);
                            }}
                            type="text"
                            value={item.itemName}
                            onChange={(e) => {
                              const next = e.target.value;
                              updateItemNameAndMaybeMerge(item.id, next);
                              if (!selectedStore) {
                                closeTypeahead();
                                return;
                              }
                              setTypeahead((prev) => ({
                                ...prev,
                                rowId: item.id,
                                query: next,
                                isOpen: true,
                              }));
                              updateTypeaheadPosition(item.id);
                            }}
                            onFocus={() => {
                              if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
                              if (!selectedStore) {
                                closeTypeahead();
                                toast.warning('Select Location Store first.');
                                return;
                              }
                              setTypeahead((prev) => ({
                                ...prev,
                                rowId: item.id,
                                query: item.itemName,
                                isOpen: true,
                              }));
                              updateTypeaheadPosition(item.id);
                            }}
                            onBlur={() => {
                              if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
                              blurTimeoutRef.current = setTimeout(() => {
                                setTypeahead((prev) => ({ ...prev, isOpen: false }));
                              }, 150);
                            }}
                            className="table-input"
                            placeholder="Type to search or enter new item"
                            disabled={!selectedStore}
                          />
                        </div>
                      </td>
                      <td>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                          className="table-input"
                          placeholder="Enter description"
                          disabled={!selectedStore}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={item.quantity === '' ? '' : String(item.quantity)}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            if (raw === '') {
                              updateLineItem(item.id, 'quantity', '');
                              return;
                            }
                            if (!/^\d+$/.test(raw)) return;
                            const n = Number(raw);
                            updateLineItem(item.id, 'quantity', n);
                          }}
                          className="table-input"
                          min="1"
                          placeholder="0"
                          disabled={!selectedStore}
                        />
                      </td>
                      <td>
                        <button
                          className="btn-delete"
                          onClick={() => removeLineItem(item.id)}
                          disabled={!selectedStore}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="form-footer">
          <div className="footer-info">
            <span>Total Items: {formData.lineItems.length}</span>
            <span>
              Total Quantity:{' '}
              {formData.lineItems.reduce((sum, item) => sum + (item.quantity === '' ? 0 : item.quantity), 0)}
            </span>
          </div>
        </div>
      </div>

      <div className="form-card" style={{ marginTop: '16px' }}>
        <div className="form-section">
          <div className="section-header">
            <h2>Recent Inventory Add-Ons</h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setRecentPage((p) => Math.max(0, p - 1))}
                disabled={recentPage === 0 || isLoadingRecent}
              >
                Previous
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setRecentPage((p) => p + 1)}
                disabled={!recentHasMore || isLoadingRecent}
              >
                Next
              </button>
              <button
                className="btn btn-print"
                onClick={handlePrint}
                type="button"
                disabled={isLoadingRecent}
              >
                Print
              </button>
            </div>
          </div>

          <div className="table-container">
            <table className="project-list-table">
              <thead>
                <tr>
                  <th>Doc #</th>
                  <th>Store</th>
                  <th>Item Name</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Date</th>
                  <th style={{ width: 110 }}>View</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingRecent ? (
                  <tr>
                    <td colSpan={7} className="empty-state">Loading…</td>
                  </tr>
                ) : recentLines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty-state">No recent add-ons found.</td>
                  </tr>
                ) : (
                  recentLines.map((row) => (
                    <tr key={row.line_id}>
                      <td>{row.doc_number}</td>
                      <td>{row.location_store}</td>
                      <td>{row.item_name}</td>
                      <td>{row.description || ''}</td>
                      <td>{row.quantity}</td>
                      <td>{(row.date || '').slice(0, 10)}</td>
                      <td>
                        <button
                          className="btn btn-secondary btn-small"
                          type="button"
                          onClick={() => handleViewAddOn(row.header_id)}
                          disabled={!row.header_id || isLoadingViewAddOn}
                          title="View document (read-only)"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {typeaheadPortal}

      {viewAddOn
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              onClick={() => setViewAddOn(null)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.35)',
                zIndex: 200000,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                padding: 24,
                overflow: 'auto',
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 'min(980px, 100%)',
                  background: '#fff',
                  borderRadius: 10,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#2D3E5F' }}>
                    Inventory Add-On (View)
                  </div>
                  <button className="btn btn-secondary btn-small" type="button" onClick={() => setViewAddOn(null)}>
                    Close
                  </button>
                </div>

                <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 14 }}>
                  <div><strong>Doc #:</strong> {viewAddOn.doc_number}</div>
                  <div><strong>Date:</strong> {String(viewAddOn.date || '').slice(0, 10)}</div>
                  <div><strong>Store:</strong> {viewAddOn.location_store}</div>
                </div>

                <div style={{ marginTop: 12 }} className="table-container">
                  <table className="line-items-table">
                    <thead>
                      <tr>
                        <th>Item Name</th>
                        <th>Description</th>
                        <th style={{ width: 90 }}>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewAddOn.line_items.map((li) => (
                        <tr key={li.id}>
                          <td>{li.item_name}</td>
                          <td>{li.description || ''}</td>
                          <td>{li.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      </div>

      <div className="print-only">
        <PrintableInventoryAddOnDoc recentLines={recentLines} />
      </div>
    </div>
  );
};

export default InventoryAddOnPage;
