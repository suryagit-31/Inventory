import React, { useEffect, useRef, useState } from 'react';
import './CommonPage.css';
import './ReportsPage.css';
import { API_BASE_URL } from '../config/api';
import { useToast } from '../components/Toast/ToastContext';
import { LOCATIONS } from '../types/sample.types';

type ReportTab = 'inventory' | 'customer';
const PAGE_SIZE = 100;

const ReportsPage: React.FC = () => {
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<ReportTab>('inventory');

  const [inventoryLocation, setInventoryLocation] = useState<string>('');
  const [appliedInventoryLocation, setAppliedInventoryLocation] = useState<string>('');

  const [customerName, setCustomerName] = useState<string>('');
  const [projectNumber, setProjectNumber] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [appliedCustomerFilters, setAppliedCustomerFilters] = useState<{
    customerName: string;
    projectNumber: string;
    dateFrom: string;
    dateTo: string;
  }>({ customerName: '', projectNumber: '', dateFrom: '', dateTo: '' });

  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  const [isLoadingCustomer, setIsLoadingCustomer] = useState(false);
  const [inventoryRows, setInventoryRows] = useState<any[]>([]);
  const [customerRows, setCustomerRows] = useState<any[]>([]);
  const didInitLoadRef = useRef(false);
  const [inventoryPage, setInventoryPage] = useState(0);
  const [customerPage, setCustomerPage] = useState(0);

  const [customerSuggestions, setCustomerSuggestions] = useState<string[]>([]);
  const [projectSuggestions, setProjectSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const customerDebounceRef = useRef<number | null>(null);
  const projectDebounceRef = useRef<number | null>(null);

  const _downloadBlob = (filename: string, blob: Blob) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const _filenameFromDisposition = (value: string | null): string | null => {
    if (!value) return null;
    const m = value.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    const raw = (m?.[1] || m?.[2] || '').trim();
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  };

  const downloadExcel = async (
    endpoint: string,
    params: Record<string, string | undefined>,
    fallbackFilename: string
  ) => {
    try {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v && v.trim()) qs.set(k, v.trim());
      });
      const url = `${API_BASE_URL}${endpoint}${qs.toString() ? `?${qs.toString()}` : ''}`;

      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Request failed (${res.status})`);
      }

      const blob = await res.blob();
      const filename =
        _filenameFromDisposition(res.headers.get('content-disposition')) || fallbackFilename;
      _downloadBlob(filename, blob);
      toast.success('Excel downloaded.');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to download Excel.');
    }
  };

  const loadInventory = async () => {
    setIsLoadingInventory(true);
    try {
      const qs = new URLSearchParams();
      if (appliedInventoryLocation.trim()) qs.set('location', appliedInventoryLocation.trim());
      const url = `${API_BASE_URL}/api/reports/inventory${qs.toString() ? `?${qs.toString()}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load inventory report (${res.status})`);
      const json = await res.json();
      setInventoryRows(Array.isArray(json?.data) ? json.data : []);
      setInventoryPage(0);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to load inventory report.');
      setInventoryRows([]);
    } finally {
      setIsLoadingInventory(false);
    }
  };

  const loadCustomer = async () => {
    setIsLoadingCustomer(true);
    try {
      const qs = new URLSearchParams();
      if (appliedCustomerFilters.customerName.trim()) qs.set('customer_name', appliedCustomerFilters.customerName.trim());
      if (appliedCustomerFilters.projectNumber.trim()) qs.set('project_number', appliedCustomerFilters.projectNumber.trim());
      if (appliedCustomerFilters.dateFrom) qs.set('date_from', appliedCustomerFilters.dateFrom);
      if (appliedCustomerFilters.dateTo) qs.set('date_to', appliedCustomerFilters.dateTo);
      const url = `${API_BASE_URL}/api/reports/customer-samples${qs.toString() ? `?${qs.toString()}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load customer report (${res.status})`);
      const json = await res.json();
      setCustomerRows(Array.isArray(json?.data) ? json.data : []);
      setCustomerPage(0);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to load customer report.');
      setCustomerRows([]);
    } finally {
      setIsLoadingCustomer(false);
    }
  };

  useEffect(() => {
    if (didInitLoadRef.current) return;
    didInitLoadRef.current = true;
    loadInventory();
    loadCustomer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyInventoryFilters = async () => {
    setAppliedInventoryLocation(inventoryLocation);
    // load using next tick state by passing direct value
    setIsLoadingInventory(true);
    try {
      const qs = new URLSearchParams();
      if (inventoryLocation.trim()) qs.set('location', inventoryLocation.trim());
      const url = `${API_BASE_URL}/api/reports/inventory${qs.toString() ? `?${qs.toString()}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load inventory report (${res.status})`);
      const json = await res.json();
      setInventoryRows(Array.isArray(json?.data) ? json.data : []);
      setInventoryPage(0);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to load inventory report.');
      setInventoryRows([]);
    } finally {
      setIsLoadingInventory(false);
    }
  };

  const applyCustomerFilters = async () => {
    const next = { customerName, projectNumber, dateFrom, dateTo };
    setAppliedCustomerFilters(next);
    setIsLoadingCustomer(true);
    try {
      const qs = new URLSearchParams();
      if (next.customerName.trim()) qs.set('customer_name', next.customerName.trim());
      if (next.projectNumber.trim()) qs.set('project_number', next.projectNumber.trim());
      if (next.dateFrom) qs.set('date_from', next.dateFrom);
      if (next.dateTo) qs.set('date_to', next.dateTo);
      const url = `${API_BASE_URL}/api/reports/customer-samples${qs.toString() ? `?${qs.toString()}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load customer report (${res.status})`);
      const json = await res.json();
      setCustomerRows(Array.isArray(json?.data) ? json.data : []);
      setCustomerPage(0);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to load customer report.');
      setCustomerRows([]);
    } finally {
      setIsLoadingCustomer(false);
    }
  };

  const loadCustomerSuggestions = (q: string) => {
    if (customerDebounceRef.current) window.clearTimeout(customerDebounceRef.current);
    customerDebounceRef.current = window.setTimeout(async () => {
      const needle = (q || '').trim();
      if (!needle) {
        setCustomerSuggestions([]);
        return;
      }
      setIsLoadingSuggestions(true);
      try {
        const qs = new URLSearchParams({ customer_q: needle, limit: '20' });
        const res = await fetch(`${API_BASE_URL}/api/reports/customer-samples/suggestions?${qs.toString()}`);
        if (!res.ok) throw new Error('Failed to load suggestions');
        const json = await res.json();
        setCustomerSuggestions(Array.isArray(json?.customers) ? json.customers : []);
      } catch {
        setCustomerSuggestions([]);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 250);
  };

  const loadProjectSuggestions = (q: string) => {
    if (projectDebounceRef.current) window.clearTimeout(projectDebounceRef.current);
    projectDebounceRef.current = window.setTimeout(async () => {
      const needle = (q || '').trim();
      if (!needle) {
        setProjectSuggestions([]);
        return;
      }
      setIsLoadingSuggestions(true);
      try {
        const qs = new URLSearchParams({ project_q: needle, limit: '20' });
        const res = await fetch(`${API_BASE_URL}/api/reports/customer-samples/suggestions?${qs.toString()}`);
        if (!res.ok) throw new Error('Failed to load suggestions');
        const json = await res.json();
        setProjectSuggestions(Array.isArray(json?.projects) ? json.projects : []);
      } catch {
        setProjectSuggestions([]);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 250);
  };

  return (
    <div className="common-page">
      <div className="page-header">
        <h1>Reports</h1>
      </div>

      <div className="reports-card">
        <div className="reports-tabs">
          <button
            className={`btn ${activeTab === 'inventory' ? 'btn-accent' : 'btn-secondary'} reports-tab`}
            type="button"
            onClick={() => {
              setActiveTab('inventory');
              setInventoryPage(0);
            }}
          >
            Sample Inventory
          </button>
          <button
            className={`btn ${activeTab === 'customer' ? 'btn-accent' : 'btn-secondary'} reports-tab`}
            type="button"
            onClick={() => {
              setActiveTab('customer');
              setCustomerPage(0);
            }}
          >
            Customer Based
          </button>
        </div>

        {activeTab === 'inventory' ? (
        <div className="reports-section">
          <h2>Sample Inventory Report</h2>
          <div className="reports-row">
            <label>
              Location (optional)
              <select value={inventoryLocation} onChange={(e) => setInventoryLocation(e.target.value)}>
                <option value="">All</option>
                {LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </label>

            <button className="btn btn-secondary" type="button" onClick={applyInventoryFilters} disabled={isLoadingInventory}>
              Apply Filters
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() =>
                downloadExcel(
                  '/api/reports/inventory.xlsx',
                  { location: appliedInventoryLocation || undefined },
                  'sample-inventory-report.xlsx'
                )
              }
              disabled={isLoadingInventory}
            >
              Download Excel
            </button>
          </div>

          <div className="reports-table-wrap">
            {isLoadingInventory ? (
              <div className="reports-muted">Loading…</div>
            ) : inventoryRows.length === 0 ? (
              <div className="reports-muted">No rows.</div>
            ) : (
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Location</th>
                    <th className="num">Qty On Hand</th>
                    <th className="num">Qty Issued</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryRows
                    .slice(inventoryPage * PAGE_SIZE, (inventoryPage + 1) * PAGE_SIZE)
                    .map((r, idx) => (
                    <tr key={`${r.item_name || ''}:${r.location || ''}:${idx}`}>
                      <td>{r.item_name}</td>
                      <td>{r.location}</td>
                      <td className="num">{Number(r.qty_on_hand ?? 0)}</td>
                      <td className="num">{Number(r.qty_issued ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!isLoadingInventory && inventoryRows.length > 0 ? (
            <div className="reports-pagination">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setInventoryPage((p) => Math.max(0, p - 1))}
                disabled={inventoryPage === 0}
              >
                Prev
              </button>
              <div className="reports-pagination-label">
                Page {inventoryPage + 1} • Showing{' '}
                {Math.min(PAGE_SIZE, Math.max(0, inventoryRows.length - inventoryPage * PAGE_SIZE))} of {inventoryRows.length}
              </div>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setInventoryPage((p) => p + 1)}
                disabled={(inventoryPage + 1) * PAGE_SIZE >= inventoryRows.length}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
        ) : null}

        {activeTab === 'customer' ? (
        <div className="reports-section">
          <h2>Customer-Based Sample Report</h2>
          <div className="reports-grid">
            <label>
              Customer Name (optional)
              <div className="reports-typeahead">
                <input
                  value={customerName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomerName(v);
                    setShowCustomerDropdown(true);
                    loadCustomerSuggestions(v);
                  }}
                  onFocus={() => {
                    setShowCustomerDropdown(true);
                    loadCustomerSuggestions(customerName);
                  }}
                  onBlur={() => window.setTimeout(() => setShowCustomerDropdown(false), 120)}
                  placeholder="Customer name"
                />
                {showCustomerDropdown ? (
                  <div className="reports-dropdown">
                    {isLoadingSuggestions ? (
                      <div className="reports-dropdown-muted">Searching…</div>
                    ) : customerSuggestions.length === 0 ? (
                      <div className="reports-dropdown-muted">No matches.</div>
                    ) : (
                      customerSuggestions.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className="reports-dropdown-row"
                          onMouseDown={(ev) => {
                            ev.preventDefault();
                            setCustomerName(name);
                            setShowCustomerDropdown(false);
                          }}
                        >
                          {name}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </label>
            <label>
              Project Number (optional)
              <div className="reports-typeahead">
                <input
                  value={projectNumber}
                  onChange={(e) => {
                    const v = e.target.value;
                    setProjectNumber(v);
                    setShowProjectDropdown(true);
                    loadProjectSuggestions(v);
                  }}
                  onFocus={() => {
                    setShowProjectDropdown(true);
                    loadProjectSuggestions(projectNumber);
                  }}
                  onBlur={() => window.setTimeout(() => setShowProjectDropdown(false), 120)}
                  placeholder="Project number"
                />
                {showProjectDropdown ? (
                  <div className="reports-dropdown">
                    {isLoadingSuggestions ? (
                      <div className="reports-dropdown-muted">Searching…</div>
                    ) : projectSuggestions.length === 0 ? (
                      <div className="reports-dropdown-muted">No matches.</div>
                    ) : (
                      projectSuggestions.map((p) => (
                        <button
                          key={p}
                          type="button"
                          className="reports-dropdown-row"
                          onMouseDown={(ev) => {
                            ev.preventDefault();
                            setProjectNumber(p);
                            setShowProjectDropdown(false);
                          }}
                        >
                          {p}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </label>
            <label>
              Date From (optional)
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label>
              Date To (optional)
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
          </div>

          <div className="reports-actions">
            <button className="btn btn-secondary" type="button" onClick={applyCustomerFilters} disabled={isLoadingCustomer}>
              Apply Filters
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() =>
                downloadExcel(
                  '/api/reports/customer-samples.xlsx',
                  {
                    customer_name: appliedCustomerFilters.customerName || undefined,
                    project_number: appliedCustomerFilters.projectNumber || undefined,
                    date_from: appliedCustomerFilters.dateFrom || undefined,
                    date_to: appliedCustomerFilters.dateTo || undefined,
                  },
                  'customer-samples-report.xlsx'
                )
              }
              disabled={isLoadingCustomer}
            >
              Download Excel
            </button>
          </div>

          <div className="reports-table-wrap">
            {isLoadingCustomer ? (
              <div className="reports-muted">Loading…</div>
            ) : customerRows.length === 0 ? (
              <div className="reports-muted">No rows.</div>
            ) : (
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Project</th>
                    <th>Item</th>
                    <th className="num">Issued Qty</th>
                    <th className="num">Returned Qty</th>
                    <th className="num">Balance</th>
                    <th>Disposition</th>
                    <th className="num">Aging</th>
                  </tr>
                </thead>
                <tbody>
                  {customerRows
                    .slice(customerPage * PAGE_SIZE, (customerPage + 1) * PAGE_SIZE)
                    .map((r, idx) => (
                    <tr key={`${r.doc_number || ''}:${r.item_name || ''}:${idx}`}>
                      <td>{r.customer}</td>
                      <td>{r.project_number}</td>
                      <td>{r.item_name}</td>
                      <td className="num">{Number(r.qty_issued ?? 0)}</td>
                      <td className="num">{Number(r.qty_returned ?? 0)}</td>
                      <td className="num">{Number(r.balance_with_customer ?? 0)}</td>
                      <td>{r.disposition_type}</td>
                      <td className="num">{r.aging_days ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!isLoadingCustomer && customerRows.length > 0 ? (
            <div className="reports-pagination">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setCustomerPage((p) => Math.max(0, p - 1))}
                disabled={customerPage === 0}
              >
                Prev
              </button>
              <div className="reports-pagination-label">
                Page {customerPage + 1} • Showing{' '}
                {Math.min(PAGE_SIZE, Math.max(0, customerRows.length - customerPage * PAGE_SIZE))} of {customerRows.length}
              </div>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setCustomerPage((p) => p + 1)}
                disabled={(customerPage + 1) * PAGE_SIZE >= customerRows.length}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
        ) : null}
      </div>
    </div>
  );
};

export default ReportsPage;
