import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DocumentTextIcon } from '@heroicons/react/24/outline';
import { LOCATIONS } from '../types/sample.types';
import { generateDocNumber } from '../data/mockData';
import { API_BASE_URL } from '../config/api';
import { useToast } from '../components/Toast/ToastContext';
import { localISODate } from '../utils/date';
import { createSampleReturn } from '../services/sampleReturnService';
import { getIssueReturnable, ReturnableLine } from '../services/sampleIssueService';
import './SampleIssuePage.css';

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

const SampleReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { issueDocNumber } = useParams<{ issueDocNumber: string }>();
  const toast = useToast();

  // View state
  const [currentView, setCurrentView] = useState<'list' | 'form'>(issueDocNumber ? 'form' : 'list');
  const [issuedSamples, setIssuedSamples] = useState<SampleIssueListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const itemsPerPage = 20;
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [formData, setFormData] = useState<SampleReturnForm>({
    docNumber: generateDocNumber().replace('SI-', 'SR-'),
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

  // Load issued samples list
  useEffect(() => {
    const loadIssuedSamples = async () => {
      if (currentView === 'list') {
        setIsLoading(true);
        try {
          // Fetch issued sample issues from backend
          const skip = currentPage * itemsPerPage;
          const params = new URLSearchParams({
            skip: String(skip),
            limit: String(itemsPerPage),
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
          setHasMore(data.length === itemsPerPage);
        } catch (error) {
          console.error('Failed to load issued samples:', error);
          toast.error('Unable to load issued samples. Please try again.');
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadIssuedSamples();
  }, [currentView, currentPage, debouncedSearchQuery, toast]);

  // Load issue details when issueDocNumber changes
  useEffect(() => {
    const loadIssueForReturn = async () => {
      if (issueDocNumber && currentView === 'form') {
        setIsLoading(true);
        try {
          // Fetch the specific issue by doc_number
          const response = await fetch(`${API_BASE_URL}/api/sample-issues/?limit=100`);
          if (!response.ok) {
            throw new Error('Failed to load issue details');
          }

          const allIssues = await response.json();
          const issue = allIssues.find((i: any) => i.doc_number === issueDocNumber);

          if (issue) {
            // Map line items from issue to return line items
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
          } else {
            toast.error('Issue document not found');
            navigate('/sample-return');
          }
        } catch (error) {
          console.error('Failed to load issue details:', error);
          toast.error('Unable to load issue details. Please try again.');
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadIssueForReturn();
  }, [issueDocNumber, currentView, navigate]);

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
    setCurrentPage(0);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(0);
  };

  const handlePreviousPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (hasMore) {
      setCurrentPage(currentPage + 1);
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
      setCurrentPage(0);
      setSearchQuery('');
      setDebouncedSearchQuery('');
    } catch (error: any) {
      console.error('Failed to submit sample return:', error);
      toast.error(error?.message || 'Unable to submit sample return.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Render list view
  if (currentView === 'list') {
    return (
      <div className="sample-issue-page">
        {/* Search Section */}
        <div style={{
          background: 'linear-gradient(135deg, #3C507F 0%, #2D3E5F 100%)',
          padding: '30px',
          borderRadius: '8px',
          marginBottom: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{
            color: 'white',
            fontSize: '20px',
            fontWeight: '600',
            marginBottom: '20px',
            borderBottom: '1px solid rgba(255,255,255,0.2)',
            paddingBottom: '15px'
          }}>
            Search Issued Sample
          </h2>
          <div>
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
        </div>

        {/* Issues List */}
        <div className="form-card">
          {isLoading ? (
            <div className="loading-state">Loading issued samples...</div>
          ) : (
            <>
              <div className="project-list-container">
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
                          {searchQuery ? 'No issued samples found matching your search.' : 'No issued samples available for return.'}
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
                              style={{ opacity: issue.doc_number ? 1 : 0.5, cursor: issue.doc_number ? 'pointer' : 'not-allowed' }}
                            >
                              Create Return
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
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
                  onClick={handlePreviousPage}
                  disabled={currentPage === 0}
                  style={{ opacity: currentPage === 0 ? 0.5 : 1 }}
                >
                  ← Previous
                </button>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  Page {currentPage + 1} | Showing {issuedSamples.length} issues
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={handleNextPage}
                  disabled={!hasMore}
                  style={{ opacity: !hasMore ? 0.5 : 1 }}
                >
                  Next →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Render form view
  return (
    <div className="sample-issue-page">
      <div className="page-header">
        <h1>Sample Return</h1>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={handleBackToList}>← Back to Issues</button>
          <button className="btn btn-secondary" onClick={handleSave}>Save Draft</button>
          <button className="btn btn-primary" onClick={handleSubmit}>Submit Return</button>
          <button className="btn btn-secondary" onClick={handlePrint}>Print</button>
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
  );
};

export default SampleReturnPage;
