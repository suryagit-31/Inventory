import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { DocumentTextIcon } from '@heroicons/react/24/outline';
import { LOCATIONS } from '../types/sample.types';
import { API_BASE_URL } from '../config/api';
import { useToast } from '../components/Toast/ToastContext';
import { localISODate } from '../utils/date';
import { createSampleReturn, getSampleReturn, listSampleReturnSummaries, SampleReturnResponse, SampleReturnSummary } from '../services/sampleReturnService';
import { getIssueReturnable, ReturnableLine } from '../services/sampleIssueService';
import './SampleIssuePage.css';
import './SampleReturnPagePrint.css';

interface SampleReturnLineItem {
  id: string;
  itemName: string;
  description: string;
  qtyIssued: number;
  qtyAlreadyReturned: number;
  qtyRemaining: number;
  qtyAvailable: number | null;
  qtyReturn: number | '';
  condition: string;
}

interface SampleReturnForm {
  docNumber: string;
  issueDocNumber: string;
  originalIssueId: string | null;
  projectNumber: string | null;
  customerName: string | null;
  issuedDate: string | null;
  issuedLocation: string | null;
  returnDate: string;
  returnedBy: string;
  locationReturned: string;
  reason: string;
  status: 'Draft' | 'Returned';
  lineItems: SampleReturnLineItem[];
}

interface SampleIssueListItem {
  id: string;
  doc_number: string;
  project_number: string;
  customer_name: string | null;
  date_of_issue: string;
  status: string;
  business_unit: string | null;
}

function _num(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

type PrintableSampleReturnDocProps = {
  formData: SampleReturnForm;
};

type PrintableSampleReturnListDocProps = {
  listTab: 'issues' | 'returns';
  searchQuery: string;
  issuedSamples: SampleIssueListItem[];
  recentReturns: SampleReturnSummary[];
  issuesPage: number;
  returnsPage: number;
};

function PrintableSampleReturnDoc({
  formData,
}: PrintableSampleReturnDocProps) {
  const totalQtyReturn = formData.lineItems.reduce((sum, li) => sum + _num(li.qtyReturn === '' ? 0 : li.qtyReturn), 0);
  const lineCountReturned = formData.lineItems.filter((li) => _num(li.qtyReturn === '' ? 0 : li.qtyReturn) > 0).length;

  const isFullReturn =
    formData.status === 'Returned' &&
    formData.lineItems.every((li) => {
      const remaining = _num(li.qtyRemaining);
      if (remaining <= 0) return true;
      return _num(li.qtyReturn === '' ? 0 : li.qtyReturn) === remaining;
    });
  const scopeLabel = formData.status !== 'Returned' ? 'Draft' : isFullReturn ? 'Full Return' : 'Partial Return';

  const printedAt = new Date();

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
            <div className="print-title">Sample Return</div>
            <div className="print-subtitle">Printed: {printedAt.toLocaleString()}</div>
          </div>
        </div>
        <div className="print-meta">
          <div><span className="k">Return Doc #</span><span className="v">{formData.docNumber || '(Not saved yet)'}</span></div>
          <div><span className="k">Return Date</span><span className="v">{formData.returnDate || 'N/A'}</span></div>
          <div><span className="k">Status</span><span className="v">{formData.status}</span></div>
          <div><span className="k">Scope</span><span className="v">{scopeLabel}</span></div>
        </div>
      </div>

      <div className="print-section">
        <div className="print-section-title">Issue Reference</div>
        <div className="print-grid">
          <div><span className="k">Issue Doc #</span><span className="v">{formData.issueDocNumber || 'N/A'}</span></div>
          <div><span className="k">Issued Date</span><span className="v">{formData.issuedDate ? String(formData.issuedDate).slice(0, 10) : 'N/A'}</span></div>
          <div><span className="k">Project #</span><span className="v">{formData.projectNumber || 'N/A'}</span></div>
          <div><span className="k">Customer</span><span className="v">{formData.customerName || 'N/A'}</span></div>
        </div>
      </div>

      <div className="print-section">
        <div className="print-section-title">Return Details</div>
        <div className="print-grid">
          <div><span className="k">Store (Issued From)</span><span className="v">{formData.issuedLocation || 'N/A'}</span></div>
          <div><span className="k">Location Returned</span><span className="v">{formData.locationReturned || 'N/A'}</span></div>
          <div><span className="k">Returned By</span><span className="v">{formData.returnedBy || 'N/A'}</span></div>
          <div><span className="k">Reason</span><span className="v">{formData.reason || 'N/A'}</span></div>
        </div>
      </div>

      <div className="print-section">
        <div className="print-section-title">Returned Items</div>
        <table className="print-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>#</th>
              <th>Item</th>
              <th>Description</th>
              <th style={{ width: '90px' }}>Issued</th>
              <th style={{ width: '90px' }}>Return</th>
              <th style={{ width: '90px' }}>Remaining</th>
              <th style={{ width: '110px' }}>Condition</th>
            </tr>
          </thead>
          <tbody>
            {formData.lineItems.map((li, idx) => (
              <tr key={li.id}>
                <td>{idx + 1}</td>
                <td>{li.itemName}</td>
                <td>{li.description || ''}</td>
                <td className="num">{_num(li.qtyIssued)}</td>
                <td className="num">{_num(li.qtyReturn === '' ? 0 : li.qtyReturn)}</td>
                <td className="num">{_num(li.qtyRemaining)}</td>
                <td>{li.condition || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="print-totals">
          <div><span className="k">Lines Returned</span><span className="v">{lineCountReturned}</span></div>
          <div><span className="k">Total Qty Returned</span><span className="v">{totalQtyReturn}</span></div>
        </div>
      </div>

      <div className="print-signatures">
        <div className="sig">
          <div className="line" />
          <div className="label">Returned By</div>
        </div>
        <div className="sig">
          <div className="line" />
          <div className="label">Store Keeper</div>
        </div>
        <div className="sig">
          <div className="line" />
          <div className="label">Approved By</div>
        </div>
      </div>
    </div>
  );
}

function PrintableSampleReturnListDoc({
  listTab,
  searchQuery,
  issuedSamples,
  recentReturns,
  issuesPage,
  returnsPage,
}: PrintableSampleReturnListDocProps) {
  const printedAt = new Date();
  const title = listTab === 'issues' ? 'Issued Samples (Return List)' : 'Recent Returns';
  const pageLabel = listTab === 'issues' ? `Page ${issuesPage + 1}` : `Page ${returnsPage + 1}`;
  const queryLabel = (searchQuery || '').trim();

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
            <div className="print-title">Sample Return</div>
            <div className="print-subtitle">
              {title} • {pageLabel} • Printed: {printedAt.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="print-meta">
          <div>
            <span className="k">Filter</span>
            <span className="v">{queryLabel ? queryLabel : 'None'}</span>
          </div>
          <div>
            <span className="k">Rows</span>
            <span className="v">{listTab === 'issues' ? issuedSamples.length : recentReturns.length}</span>
          </div>
        </div>
      </div>

      <div className="print-section">
        <div className="print-section-title">{title}</div>

        {listTab === 'issues' ? (
          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th>Issue Doc #</th>
                <th>Project ID</th>
                <th>Customer Name</th>
                <th style={{ width: '110px' }}>Issue Date</th>
                <th>Business Unit</th>
              </tr>
            </thead>
            <tbody>
              {issuedSamples.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    {queryLabel ? 'No issued samples found matching the filter.' : 'No issued samples available.'}
                  </td>
                </tr>
              ) : (
                issuedSamples.map((issue, idx) => (
                  <tr key={issue.id}>
                    <td className="num">{idx + 1}</td>
                    <td>{issue.doc_number || 'N/A'}</td>
                    <td>{issue.project_number || 'N/A'}</td>
                    <td>{issue.customer_name || 'N/A'}</td>
                    <td>{issue.date_of_issue ? String(issue.date_of_issue).slice(0, 10) : 'N/A'}</td>
                    <td>{issue.business_unit || 'N/A'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th>Return Doc #</th>
                <th>Issue Doc #</th>
                <th>Store</th>
                <th style={{ width: '110px' }}>Return Date</th>
                <th style={{ width: '70px' }}>Lines</th>
                <th style={{ width: '90px' }}>Total Qty</th>
                <th style={{ width: '110px' }}>Partial/Full</th>
                <th style={{ width: '90px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentReturns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty">
                    No return documents found.
                  </td>
                </tr>
              ) : (
                recentReturns.map((ret, idx) => (
                  <tr key={ret.id}>
                    <td className="num">{idx + 1}</td>
                    <td>{ret.doc_number || 'N/A'}</td>
                    <td>{ret.original_issue_doc_number || 'N/A'}</td>
                    <td>{ret.store_location || 'N/A'}</td>
                    <td>{ret.date_of_return ? String(ret.date_of_return).slice(0, 10) : 'N/A'}</td>
                    <td className="num">{ret.line_count ?? 0}</td>
                    <td className="num">{ret.total_qty_return ?? 0}</td>
                    <td>{ret.return_scope || 'N/A'}</td>
                    <td>{ret.status || 'N/A'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function _csvEscape(value: unknown): string {
  const s = String(value ?? '');
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function _downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const SampleReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { issueDocNumber } = useParams<{ issueDocNumber: string }>();
  const toast = useToast();

  // View state
  const [currentView, setCurrentView] = useState<'list' | 'form'>(issueDocNumber ? 'form' : 'list');
  const [listTab, setListTab] = useState<'issues' | 'returns'>('issues');
  const [issuedSamples, setIssuedSamples] = useState<SampleIssueListItem[]>([]);
  const [recentReturns, setRecentReturns] = useState<SampleReturnSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [returnsSearchQuery, setReturnsSearchQuery] = useState('');
  const [debouncedReturnsSearchQuery, setDebouncedReturnsSearchQuery] = useState('');
  const [viewReturn, setViewReturn] = useState<SampleReturnResponse | null>(null);
  const [isLoadingViewReturn, setIsLoadingViewReturn] = useState(false);
  const [issuesPage, setIssuesPage] = useState(0);
  const [issuesHasMore, setIssuesHasMore] = useState(true);
  const issuesPerPage = 100;
  const [returnsPage, setReturnsPage] = useState(0);
  const [returnsHasMore, setReturnsHasMore] = useState(true);
  const returnsPerPage = 100;
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const returnsSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [formData, setFormData] = useState<SampleReturnForm>({
    docNumber: '',
    issueDocNumber: issueDocNumber || '',
    originalIssueId: null,
    projectNumber: null,
    customerName: null,
    issuedDate: null,
    issuedLocation: null,
    returnDate: localISODate(),
    returnedBy: '',
    locationReturned: '',
    reason: '',
    status: 'Draft',
    lineItems: []
  });

  // Update view when URL params change
  useEffect(() => {
    if (issueDocNumber) {
      setCurrentView('form');
    } else {
      setCurrentView('list');
    }
  }, [issueDocNumber]);

  // Debounce search query
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500); // Wait 500ms after user stops typing

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Debounce recent returns search query
  useEffect(() => {
    if (returnsSearchTimeoutRef.current) {
      clearTimeout(returnsSearchTimeoutRef.current);
    }

    returnsSearchTimeoutRef.current = setTimeout(() => {
      setDebouncedReturnsSearchQuery(returnsSearchQuery);
    }, 500); // Wait 500ms after user stops typing

    return () => {
      if (returnsSearchTimeoutRef.current) {
        clearTimeout(returnsSearchTimeoutRef.current);
      }
    };
  }, [returnsSearchQuery]);

  // Load issued samples list
  useEffect(() => {
    const loadIssuedSamples = async () => {
      if (currentView === 'list' && listTab === 'issues') {
        setIsLoading(true);
        try {
          // Fetch issued sample issues from backend
          const skip = issuesPage * issuesPerPage;
          const params = new URLSearchParams({
            skip: String(skip),
            limit: String(issuesPerPage),
            status_filter: 'Issued',
          });

          if (debouncedSearchQuery.trim()) {
            params.set('project_number', debouncedSearchQuery.trim());
          }

          const url = `${API_BASE_URL}/api/sample-issues/?${params.toString()}`;

          const response = await fetch(url);
          if (!response.ok) {
            throw new Error('Failed to load issued samples');
          }

          const data = await response.json();
          setIssuedSamples(data);
          setIssuesHasMore(data.length === issuesPerPage);
        } catch (error) {
          console.error('Failed to load issued samples:', error);
          toast.error('Unable to load issued samples. Please try again.');
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadIssuedSamples();
  }, [currentView, listTab, issuesPage, debouncedSearchQuery, toast]);

  // Load recent returns list
  useEffect(() => {
    const loadRecentReturns = async () => {
      if (currentView === 'list' && listTab === 'returns') {
        setIsLoading(true);
        try {
          const skip = returnsPage * returnsPerPage;
          const q = debouncedReturnsSearchQuery.trim();
          const data = await listSampleReturnSummaries({ skip, limit: returnsPerPage, q: q ? q : undefined });
          setRecentReturns(data);
          setReturnsHasMore(data.length === returnsPerPage);
        } catch (error: any) {
          console.error('Failed to load recent returns:', error);
          toast.error(error?.message || 'Unable to load recent returns. Please try again.');
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadRecentReturns();
  }, [currentView, listTab, returnsPage, debouncedReturnsSearchQuery, toast]);

  // Load issue details when issueDocNumber changes
  useEffect(() => {
    const loadIssueForReturn = async () => {
      if (issueDocNumber && currentView === 'form') {
        setIsLoading(true);
        try {
          // Fetch the specific issue by doc_number (server-side lookup; does not depend on paging).
          const response = await fetch(
            `${API_BASE_URL}/api/sample-issues/doc/${encodeURIComponent(issueDocNumber)}`
          );
          if (!response.ok) {
            throw new Error('Failed to load issue details');
          }

          const issue = await response.json();

          const returnable: ReturnableLine[] = await getIssueReturnable(issue.id);
          const returnLineItems: SampleReturnLineItem[] = returnable.map((row) => ({
            id: `${issue.id}:${row.item_name}`,
            itemName: row.item_name,
            description: row.description || '',
            qtyIssued: row.qty_issued_total,
            qtyAlreadyReturned: row.qty_returned_total,
            qtyRemaining: row.qty_remaining,
            qtyAvailable: row.inventory_qty_available ?? null,
            qtyReturn: '',
            condition: ''
          }));

          setFormData({
            docNumber: '',
            issueDocNumber: issue.doc_number,
            originalIssueId: issue.id,
            projectNumber: issue.project_number,
            customerName: issue.customer_name,
            issuedDate: issue.date_of_issue || null,
            issuedLocation: issue.location_stored || null,
            returnDate: localISODate(),
            returnedBy: '',
            locationReturned: issue.location_stored || '',
            reason: '',
            status: 'Draft',
            lineItems: returnLineItems
          });
        } catch (error) {
          console.error('Failed to load issue details:', error);
          toast.error('Unable to load issue details. Please try again.');
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadIssueForReturn();
  }, [issueDocNumber, currentView, navigate, toast]);

  const handleInputChange = (field: keyof SampleReturnForm, value: any) => {
    setFormData({
      ...formData,
      [field]: value
    });
  };

  const handleLineItemChange = (id: string, field: 'qtyReturn' | 'condition', value: any) => {
    setFormData({
      ...formData,
      lineItems: formData.lineItems.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    });
  };

  const handleSelectIssue = (docNumber: string) => {
    navigate(`/sample-return/${encodeURIComponent(docNumber)}`);
  };

  const handleBackToList = () => {
    navigate('/sample-return');
    setListTab('issues');
    setIssuesPage(0);
    setReturnsPage(0);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setIssuesPage(0);
  };

  const handleReturnsSearchChange = (value: string) => {
    setReturnsSearchQuery(value);
    setReturnsPage(0);
  };

  const handleViewReturn = async (returnId: string) => {
    const id = (returnId || '').trim();
    if (!id) return;
    setIsLoadingViewReturn(true);
    try {
      const ret = await getSampleReturn(id);
      setViewReturn(ret);
    } catch (error: any) {
      console.error('Failed to load sample return:', error);
      toast.error(error?.message || 'Unable to load sample return.');
    } finally {
      setIsLoadingViewReturn(false);
    }
  };

  const viewReturnModal = viewReturn
    ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setViewReturn(null)}
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
                Sample Return (View)
              </div>
              <button className="btn btn-secondary btn-small" type="button" onClick={() => setViewReturn(null)}>
                Close
              </button>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 14 }}>
              <div><strong>Doc #:</strong> {viewReturn.doc_number}</div>
              <div><strong>Return Date:</strong> {String(viewReturn.date_of_return || '').slice(0, 10)}</div>
              <div><strong>Status:</strong> {viewReturn.status}</div>
            </div>

            <div style={{ marginTop: 12 }} className="table-container">
              <table className="line-items-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Description</th>
                    <th style={{ width: 110 }}>Issued</th>
                    <th style={{ width: 110 }}>Return</th>
                  </tr>
                </thead>
                <tbody>
                  {viewReturn.line_items.map((li) => (
                    <tr key={li.id}>
                      <td>{li.item_name}</td>
                      <td>{li.description || ''}</td>
                      <td>{li.qty_issued}</td>
                      <td>{li.qty_return}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  const handleIssuesPreviousPage = () => {
    if (issuesPage > 0) {
      setIssuesPage(issuesPage - 1);
    }
  };

  const handleIssuesNextPage = () => {
    if (issuesHasMore) {
      setIssuesPage(issuesPage + 1);
    }
  };

  const handleReturnsPreviousPage = () => {
    if (returnsPage > 0) {
      setReturnsPage(returnsPage - 1);
    }
  };

  const handleReturnsNextPage = () => {
    if (returnsHasMore) {
      setReturnsPage(returnsPage + 1);
    }
  };

  const handleSelectTab = (tab: 'issues' | 'returns') => {
    setListTab(tab);
    if (tab === 'issues') {
      setIssuesPage(0);
    } else {
      setReturnsPage(0);
    }
  };

  const validateReturn = (): boolean => {
    if (!formData.issueDocNumber) {
      toast.warning('Select an issued sample document first.');
      return false;
    }
    if (!formData.originalIssueId) {
      toast.warning('Unable to identify original issue. Please go back and select the issue again.');
      return false;
    }
    if (!formData.returnedBy.trim()) {
      toast.warning('Returned By is required.');
      return false;
    }
    if (!formData.locationReturned.trim()) {
      toast.warning('Location Returned is required.');
      return false;
    }
    if (formData.lineItems.length === 0) {
      toast.warning('No return items found for this issue.');
      return false;
    }

    for (let i = 0; i < formData.lineItems.length; i++) {
      const li = formData.lineItems[i];
      const row = i + 1;

      // Allow blank / 0 as "no return" for partial returns.
      if (li.qtyReturn === '') continue;

      if (li.qtyReturn < 0) {
        toast.warning(`Row ${row} (${li.itemName}): Qty Return cannot be negative.`);
        return false;
      }
      if (li.qtyReturn > li.qtyIssued) {
        toast.warning(
          `Row ${row} (${li.itemName}): Qty Return (${li.qtyReturn}) exceeds Qty Issued (${li.qtyIssued}).`
        );
        return false;
      }
      if (li.qtyReturn > li.qtyRemaining) {
        toast.warning(
          `Row ${row} (${li.itemName}): Qty Return (${li.qtyReturn}) exceeds Remaining (${li.qtyRemaining}).`
        );
        return false;
      }
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateReturn()) return;

    try {
      const lineItems = formData.lineItems
        .filter((li) => li.qtyReturn !== '' && Number(li.qtyReturn) > 0)
        .map((li) => ({
          item_name: li.itemName,
          description: li.description || null,
          qty_issued: li.qtyIssued,
          qty_return: Number(li.qtyReturn),
        }));

      if (lineItems.length === 0) {
        toast.warning('Enter Qty Return greater than 0 for at least one item.');
        return;
      }

      const saved = await createSampleReturn({
        original_issue_id: formData.originalIssueId!,
        date_of_return: `${formData.returnDate}T00:00:00`,
        reason_for_return: formData.reason?.trim() || null,
        status: 'Draft',
        line_items: lineItems,
      });

      toast.success(`Sample Return saved (${saved.doc_number})`);
      setFormData((prev) => ({ ...prev, docNumber: saved.doc_number }));
    } catch (error: any) {
      console.error('Failed to save sample return:', error);
      toast.error(error?.message || 'Unable to save sample return.');
    }
  };

  const handleSubmit = async () => {
    if (!validateReturn()) return;

    try {
      const lineItems = formData.lineItems
        .filter((li) => li.qtyReturn !== '' && Number(li.qtyReturn) > 0)
        .map((li) => ({
          item_name: li.itemName,
          description: li.description || null,
          qty_issued: li.qtyIssued,
          qty_return: Number(li.qtyReturn),
        }));

      if (lineItems.length === 0) {
        toast.warning('Enter Qty Return greater than 0 for at least one item.');
        return;
      }

      const saved = await createSampleReturn({
        original_issue_id: formData.originalIssueId!,
        date_of_return: `${formData.returnDate}T00:00:00`,
        reason_for_return: formData.reason?.trim() || null,
        status: 'Returned',
        line_items: lineItems,
      });

      toast.success(`Sample Return submitted (${saved.doc_number})`);
      navigate('/sample-return');
      setListTab('issues');
      setIssuesPage(0);
      setReturnsPage(0);
      setSearchQuery('');
      setDebouncedSearchQuery('');
    } catch (error: any) {
      console.error('Failed to submit sample return:', error);
      toast.error(error?.message || 'Unable to submit sample return.');
    }
  };

  const handlePrintList = () => {
    window.print();
  };

  const canPrintDoc = Boolean((formData.docNumber || '').trim());
  const handlePrintDoc = () => {
    if (!canPrintDoc) {
      toast.warning('You can print after saving draft or submitting.');
      return;
    }
    window.print();
  };

  const handleDownloadCsv = () => {
    const today = new Date().toISOString().slice(0, 10);

    if (listTab === 'issues') {
      const headers = ['Issue Doc #', 'Project ID', 'Customer Name', 'Issue Date', 'Business Unit'];
      const rows = issuedSamples.map((issue) => [
        issue.doc_number || '',
        issue.project_number || '',
        issue.customer_name || '',
        issue.date_of_issue ? String(issue.date_of_issue).slice(0, 10) : '',
        issue.business_unit || '',
      ]);
      const csv =
        `${headers.map(_csvEscape).join(',')}\r\n` +
        rows.map((r) => r.map(_csvEscape).join(',')).join('\r\n') +
        '\r\n';
      _downloadTextFile(`sample-return-issued-samples-${today}.csv`, csv, 'text/csv;charset=utf-8');
      return;
    }

    const headers = [
      'Return Doc #',
      'Issue Doc #',
      'Store',
      'Return Date',
      'Lines',
      'Total Qty',
      'Partial/Full',
      'Status',
    ];
    const rows = recentReturns.map((ret) => [
      ret.doc_number || '',
      ret.original_issue_doc_number || '',
      ret.store_location || '',
      ret.date_of_return ? String(ret.date_of_return).slice(0, 10) : '',
      ret.line_count ?? 0,
      ret.total_qty_return ?? 0,
      ret.return_scope || '',
      ret.status || '',
    ]);
    const csv =
      `${headers.map(_csvEscape).join(',')}\r\n` +
      rows.map((r) => r.map(_csvEscape).join(',')).join('\r\n') +
      '\r\n';
    _downloadTextFile(`sample-return-recent-returns-${today}.csv`, csv, 'text/csv;charset=utf-8');
  };

  // Render list view
  if (currentView === 'list') {
    return (
      <div className="sample-issue-page">
        <div className="no-print">
        {/* Header + Tabs */}
        <div style={{
          background: 'linear-gradient(135deg, #3C507F 0%, #2D3E5F 100%)',
          padding: '30px',
          borderRadius: '8px',
          marginBottom: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
            <h2 style={{ color: 'white', fontSize: '20px', fontWeight: '600', margin: 0 }}>
              Sample Return
            </h2>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                className={listTab === 'issues' ? 'btn btn-primary' : 'btn btn-secondary'}
                onClick={() => handleSelectTab('issues')}
                type="button"
              >
                Issued Samples
              </button>
              <button
                className={listTab === 'returns' ? 'btn btn-primary' : 'btn btn-secondary'}
                onClick={() => handleSelectTab('returns')}
                type="button"
              >
                Recent Returns
              </button>
            </div>
          </div>

          {listTab === 'issues' ? (
            <div style={{ marginTop: '20px' }}>
              <label style={{
                color: 'white',
                fontSize: '14px',
                fontWeight: '500',
                display: 'block',
                marginBottom: '10px'
              }}>
                Issue Document # / Project ID <span style={{ color: '#ff4444' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Type issue document number or project ID to search..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: '14px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: 'white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                />
                {searchQuery !== debouncedSearchQuery && (
                  <div style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '12px',
                    color: '#666'
                  }}>
                    Searching...
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '14px', color: 'rgba(255,255,255,0.9)', fontSize: '14px' }}>
              Shows the most recent return documents with store, quantities, and Partial/Full status.
            </div>
          )}
        </div>

        {/* Issues List */}
        <div className="form-card">
          {isLoading ? (
            <div className="loading-state">
              {listTab === 'issues' ? 'Loading issued samples...' : 'Loading recent returns...'}
            </div>
          ) : (
            <>
              {listTab === 'returns' ? (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button className="btn btn-print" onClick={handlePrintList} type="button">
                      Print
                    </button>
                    <button className="btn btn-secondary" onClick={handleDownloadCsv} type="button">
                      Download CSV
                    </button>
                  </div>

                  <input
                    type="text"
                    placeholder="Search returns (Return Doc # / Issue Doc # / Store / Status)..."
                    value={returnsSearchQuery}
                    onChange={(e) => handleReturnsSearchChange(e.target.value)}
                    style={{
                      width: '420px',
                      maxWidth: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                    }}
                  />
                </div>
              ) : null}

              <div className="project-list-container">
                {listTab === 'issues' ? (
                  <table className="project-list-table">
                    <thead>
                      <tr>
                        <th>Issue Doc #</th>
                        <th>Project ID</th>
                        <th>Customer Name</th>
                        <th>Issue Date</th>
                        <th>Business Unit</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {issuedSamples.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="empty-state">
                            {searchQuery
                              ? 'No issued samples found matching your search.'
                              : 'No issued samples available for return.'}
                          </td>
                        </tr>
                      ) : (
                        issuedSamples.map((issue) => (
                          <tr key={issue.id}>
                            <td className="project-id-cell">{issue.doc_number || 'N/A'}</td>
                            <td>{issue.project_number || 'N/A'}</td>
                            <td>{issue.customer_name || 'N/A'}</td>
                            <td>{issue.date_of_issue ? String(issue.date_of_issue).slice(0, 10) : 'N/A'}</td>
                            <td>{issue.business_unit || 'N/A'}</td>
                            <td>
                              <button
                                className="btn btn-accent btn-small"
                                onClick={() => handleSelectIssue(issue.doc_number)}
                                disabled={!issue.doc_number}
                                style={{
                                  opacity: issue.doc_number ? 1 : 0.5,
                                  cursor: issue.doc_number ? 'pointer' : 'not-allowed'
                                }}
                              >
                                Create Return
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className="project-list-table">
                    <thead>
                      <tr>
                        <th>Return Doc #</th>
                        <th>Issue Doc #</th>
                        <th>Store</th>
                        <th>Return Date</th>
                        <th>Lines</th>
                        <th>Total Qty</th>
                        <th>Partial/Full</th>
                        <th>Status</th>
                        <th style={{ width: 110 }}>View</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentReturns.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="empty-state">
                            No return documents found.
                          </td>
                        </tr>
                      ) : (
                        recentReturns.map((ret) => (
                          <tr key={ret.id}>
                            <td className="project-id-cell">{ret.doc_number || 'N/A'}</td>
                            <td>{ret.original_issue_doc_number || 'N/A'}</td>
                            <td>{ret.store_location || 'N/A'}</td>
                            <td>{ret.date_of_return ? String(ret.date_of_return).slice(0, 10) : 'N/A'}</td>
                            <td>{ret.line_count ?? 0}</td>
                            <td>{ret.total_qty_return ?? 0}</td>
                            <td>{ret.return_scope || 'N/A'}</td>
                            <td>{ret.status || 'N/A'}</td>
                            <td>
                              <button
                                className="btn btn-secondary btn-small"
                                type="button"
                                onClick={() => handleViewReturn(ret.id)}
                                disabled={!ret.id || isLoadingViewReturn}
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
                )}
              </div>

              {/* Pagination */}
              <div className="pagination-controls" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '20px',
                padding: '10px 0'
              }}>
                <button
                  className="btn btn-secondary"
                  onClick={listTab === 'issues' ? handleIssuesPreviousPage : handleReturnsPreviousPage}
                  disabled={listTab === 'issues' ? issuesPage === 0 : returnsPage === 0}
                  style={{ opacity: listTab === 'issues' ? (issuesPage === 0 ? 0.5 : 1) : (returnsPage === 0 ? 0.5 : 1) }}
                >
                  ← Previous
                </button>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  {listTab === 'issues'
                    ? `Page ${issuesPage + 1} | Showing ${issuedSamples.length} issues`
                    : `Page ${returnsPage + 1} | Showing ${recentReturns.length} returns`}
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={listTab === 'issues' ? handleIssuesNextPage : handleReturnsNextPage}
                  disabled={listTab === 'issues' ? !issuesHasMore : !returnsHasMore}
                  style={{ opacity: listTab === 'issues' ? (!issuesHasMore ? 0.5 : 1) : (!returnsHasMore ? 0.5 : 1) }}
                >
                  Next →
                </button>
              </div>
            </>
          )}
        </div>
        </div>

        {listTab === 'returns' ? (
          <div className="print-only">
            <PrintableSampleReturnListDoc
              listTab={listTab}
              searchQuery={returnsSearchQuery}
              issuedSamples={issuedSamples}
              recentReturns={recentReturns}
              issuesPage={issuesPage}
              returnsPage={returnsPage}
            />
          </div>
        ) : null}
        {viewReturnModal}
      </div>
    );
  }

  // Render form view
  return (
    <div className="sample-issue-page">
      <div className="no-print">
      <div className="page-header">
        <h1>Sample Return</h1>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={handleBackToList}>← Back to Issues</button>
          <button className="btn btn-secondary" onClick={handleSave}>Save Draft</button>
          <button className="btn btn-primary" onClick={handleSubmit}>Submit Return</button>
          <button
            className={`btn btn-print ${canPrintDoc ? '' : 'btn-disabled'}`}
            onClick={handlePrintDoc}
            type="button"
            title={canPrintDoc ? 'Print return document' : 'You can print after saving draft or submitting.'}
            aria-disabled={!canPrintDoc}
          >
            Print
          </button>
        </div>
      </div>

      <div className="form-card">

        {/* DOCUMENT DETAILS SECTION */}
        <div className="form-section">
          <h2>Document Details</h2>
          <div className="document-details-grid">
            <div className="form-group">
              <label>Return Doc # <span className="auto-label">(Auto-generated)</span></label>
              <input
                type="text"
                value={formData.docNumber || ''}
                disabled
                className="input-field input-disabled"
                placeholder="Auto-generated on save/submit"
              />
            </div>

            <div className="form-group">
              <label>Return Date</label>
              <input
                type="date"
                value={formData.returnDate || ''}
                disabled
                className="input-field input-disabled"
              />
            </div>

            <div className="form-group">
              <label>Status</label>
              <input
                type="text"
                value={formData.status || 'null'}
                disabled
                className="input-field input-disabled status-badge"
              />
            </div>
          </div>
        </div>

        {/* ISSUE INFORMATION SECTION */}
        <div className="project-info-section">
          <h3>
            <DocumentTextIcon className="section-icon" />
            Issue Information <span className="section-subtitle">(From selected issue document)</span>
          </h3>
          <div className="project-info-grid">
            <div className="form-group">
              <label>Issued Doc #</label>
              <input
                type="text"
                value={formData.issueDocNumber || ''}
                disabled
                className="input-field input-disabled"
              />
            </div>

            <div className="form-group">
              <label>Issued Date</label>
              <input
                type="text"
                value={formData.issuedDate ? String(formData.issuedDate).slice(0, 10) : ''}
                disabled
                className="input-field input-disabled"
              />
            </div>

            <div className="form-group">
              <label>Project Number</label>
              <input
                type="text"
                value={formData.projectNumber === null ? '' : formData.projectNumber}
                disabled
                className="input-field input-disabled"
                placeholder={formData.issueDocNumber ? 'null' : 'Search issue document first'}
              />
            </div>

            <div className="form-group">
              <label>Customer Name</label>
              <input
                type="text"
                value={formData.customerName === null ? '' : formData.customerName}
                disabled
                className="input-field input-disabled"
                placeholder={formData.issueDocNumber ? 'null' : 'Search issue document first'}
              />
            </div>
          </div>
        </div>

        {/* RETURN DETAILS SECTION */}
        <div className="form-section">
          <h2>Return Details</h2>
          <div className="sample-details-grid">
            <div className="form-group">
              <label>Returned By <span className="required">*</span></label>
              <input
                type="text"
                value={formData.returnedBy}
                onChange={(e) => handleInputChange('returnedBy', e.target.value)}
                className="input-field"
                placeholder="Enter name"
              />
            </div>

            <div className="form-group">
              <label>Location Returned <span className="required">*</span></label>
              <select
                value={formData.locationReturned}
                onChange={(e) => handleInputChange('locationReturned', e.target.value)}
                className="input-field"
                disabled={!!formData.issuedLocation}
              >
                <option value="">Select Location</option>
                {LOCATIONS.map(location => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Reason for Return <span className="auto-label">(Optional)</span></label>
              <input
                type="text"
                value={formData.reason}
                onChange={(e) => handleInputChange('reason', e.target.value)}
                className="input-field"
                placeholder="Enter reason (optional)"
              />
            </div>
          </div>
        </div>

        {/* LINE ITEMS SECTION */}
        <div className="form-section">
          <div className="section-header">
            <h2>Return Items</h2>
          </div>

          <div className="table-container">
            <table className="line-items-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Description</th>
                  <th>Qty Issued</th>
                  <th>Already Returned</th>
                  <th>Remaining</th>
                  <th>Qty Available</th>
                  <th>Qty Return</th>
                  <th>Condition</th>
                </tr>
              </thead>
              <tbody>
                {formData.lineItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty-state">
                      Search and select an issue document to load items.
                    </td>
                  </tr>
                ) : (
                  formData.lineItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.itemName}</td>
                      <td>{item.description}</td>
                      <td>{item.qtyIssued}</td>
                      <td>{item.qtyAlreadyReturned}</td>
                      <td>{item.qtyRemaining}</td>
                      <td>{item.qtyAvailable ?? ''}</td>
                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={item.qtyReturn === '' ? '' : String(item.qtyReturn)}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            if (raw === '') {
                              handleLineItemChange(item.id, 'qtyReturn', '');
                              return;
                            }
                            if (!/^\d+$/.test(raw)) return;
                            handleLineItemChange(item.id, 'qtyReturn', Number(raw));
                          }}
                          className="table-input"
                          min="0"
                          max={item.qtyRemaining}
                          placeholder="0"
                        />
                      </td>
                      <td>
                        <select
                          className="table-input"
                          value={item.condition}
                          onChange={(e) => handleLineItemChange(item.id, 'condition', e.target.value)}
                        >
                          <option value="">Select Condition</option>
                          <option value="Good">Good</option>
                          <option value="Damaged">Damaged</option>
                          <option value="Lost">Lost</option>
                        </select>
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
              {formData.lineItems.reduce((sum, item) => sum + (item.qtyReturn === '' ? 0 : item.qtyReturn), 0)}
            </span>
          </div>
        </div>
      </div>
      </div>

      <div className="print-only">
        <PrintableSampleReturnDoc
          formData={formData}
        />
      </div>
      {viewReturnModal}
    </div>
  );
};

export default SampleReturnPage;
