import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DocumentTextIcon } from '@heroicons/react/24/outline';
import { DISPOSITION_TYPES, LOCATIONS, SampleIssue, SampleLineItem, ERPProjectSearchResult } from '../types/sample.types';
import { API_BASE_URL } from '../config/api';
import { getProjectDetails, searchProjects } from '../services/projectService';
import { listItems, ItemResponse } from '../services/itemsService';
import { createSampleIssue, getSampleIssueByDocNumber, listSampleIssues, SampleIssueResponse } from '../services/sampleIssueService';
import { useToast } from '../components/Toast/ToastContext';
import { localISODate } from '../utils/date';
import './SampleIssuePage.css';
import './SampleIssuePagePrint.css';

const createEmptyIssue = (): SampleIssue => ({
  docNumber: '',
  projectId: '',
  customerName: null,
  salesperson: null,
  projectManager: null,
  dateOfIssue: localISODate(),
  businessUnit: null,
  subsidiary: null,
  locationStored: '',
  status: 'Draft',
  dispositionType: '',
  lineItems: []
});

function _num(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function _agingDays(value: any): string {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return 'N/A';
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86400000);
  return String(Math.max(0, days));
}

function _downloadBlob(filename: string, blob: Blob) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function _filenameFromDisposition(value: string | null): string | null {
  if (!value) return null;
  const m = value.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const raw = (m?.[1] || m?.[2] || '').trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

type PrintableSampleIssueDocProps = {
  formData: SampleIssue;
};

function PrintableSampleIssueDoc({ formData }: PrintableSampleIssueDocProps) {
  const printedAt = new Date();
  const totalQty = (formData.lineItems || []).reduce((sum, li) => sum + _num(li.qtyIssue), 0);
  const printedTime = printedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

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
            <div className="print-title">Sample Issue</div>
          </div>
        </div>
        <div className="print-meta">
          <div><span className="k">Doc #</span><span className="v">{formData.docNumber || 'N/A'}</span></div>
          <div><span className="k">Date</span><span className="v">{formData.dateOfIssue || 'N/A'}</span></div>
          <div><span className="k">Status</span><span className="v">{formData.status || 'N/A'}</span></div>
          <div><span className="k">Store</span><span className="v">{formData.locationStored || 'N/A'}</span></div>
          <div><span className="k">Time</span><span className="v">{printedTime}</span></div>
        </div>
      </div>

      <div className="print-section">
        <div className="print-section-title">Project Information</div>
        <div className="print-grid">
          <div><span className="k">Project ID</span><span className="v">{formData.projectId || 'N/A'}</span></div>
          <div><span className="k">Customer</span><span className="v">{formData.customerName || 'N/A'}</span></div>
          <div><span className="k">Salesperson</span><span className="v">{formData.salesperson || 'N/A'}</span></div>
          <div><span className="k">Project Mgr</span><span className="v">{formData.projectManager || 'N/A'}</span></div>
          <div><span className="k">Business Unit</span><span className="v">{formData.businessUnit || 'N/A'}</span></div>
          <div><span className="k">Subsidiary</span><span className="v">{formData.subsidiary || 'N/A'}</span></div>
          <div><span className="k">Disposition</span><span className="v">{formData.dispositionType || 'N/A'}</span></div>
        </div>
      </div>

      <div className="print-section">
        <div className="print-section-title">Issued Items</div>
        <table className="print-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>#</th>
              <th>Item</th>
              <th>Work ID</th>
              <th>Description</th>
              <th style={{ width: '110px' }}>Qty On Hand</th>
              <th style={{ width: '90px' }}>Qty Issue</th>
            </tr>
          </thead>
          <tbody>
            {(formData.lineItems || []).length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">No line items.</td>
              </tr>
            ) : (
              (formData.lineItems || []).map((li, idx) => (
                <tr key={`${li.id || ''}:${idx}`}>
                  <td className="num">{idx + 1}</td>
                  <td>{li.itemName}</td>
                  <td>{li.workId || ''}</td>
                  <td>{li.description || ''}</td>
                  <td className="num">{_num(li.qtyOnHand)}</td>
                  <td className="num">{_num(li.qtyIssue)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="print-totals">
          <div><span className="k">Total Lines</span><span className="v">{(formData.lineItems || []).length}</span></div>
          <div><span className="k">Total Qty</span><span className="v">{totalQty}</span></div>
        </div>
      </div>

      <div className="print-signatures">
        <div className="sig sig-left">
          <div className="line" />
          <div className="label">Issued By</div>
        </div>
        <div className="sig sig-right">
          <div className="line" />
          <div className="label">Approved By</div>
        </div>
      </div>
    </div>
  );
}

const SampleIssuePage: React.FC = () => {
  const toast = useToast();

  const [formData, setFormData] = useState<SampleIssue>(createEmptyIssue);
  const [items, setItems] = useState<ItemResponse[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ERPProjectSearchResult[]>([]);
  const [selectedProject, setSelectedProject] = useState<ERPProjectSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingProjectDetails, setIsLoadingProjectDetails] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const [issuedIssues, setIssuedIssues] = useState<SampleIssueResponse[]>([]);
  const [issuedPage, setIssuedPage] = useState(0);
  const [isLoadingIssued, setIsLoadingIssued] = useState(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const suppressNextSearchRef = useRef(false);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  useEffect(() => {
    const query = debouncedSearchQuery.trim();
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      return;
    }

    if (!query || isFormOpen) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const loadResults = async () => {
      setIsSearching(true);
      try {
        const results = await searchProjects(query, 50);

        const normalized = query.toLowerCase();
        const score = (p: ERPProjectSearchResult) => {
          const projectId = (p.ProjectId || '').toLowerCase();
          const customerName = (p.CustomerName || '').toLowerCase();
          if (projectId.startsWith(normalized)) return 0;
          if (customerName.startsWith(normalized)) return 1;
          if (projectId.includes(normalized)) return 2;
          if (customerName.includes(normalized)) return 3;
          return 4;
        };

        const sorted = [...results].sort((a, b) => {
          const diff = score(a) - score(b);
          if (diff !== 0) return diff;
          return a.ProjectId.localeCompare(b.ProjectId);
        });

        setSearchResults(sorted);
        setShowDropdown(true);
      } catch (error) {
        console.error('Failed to search projects:', error);
        setSearchResults([]);
        setShowDropdown(true);
        toast.error('Unable to search projects. Please try again.');
      } finally {
        setIsSearching(false);
      }
    };

    loadResults();
  }, [debouncedSearchQuery, isFormOpen, toast]);

  useEffect(() => {
    if (!isFormOpen) return;

    const load = async () => {
      setIsLoadingItems(true);
      try {
        const location = formData.locationStored?.trim() || undefined;
        const result = await listItems({ location, limit: 1000 });
        setItems(result);
      } catch (error: any) {
        console.error('Failed to load items:', error);
        toast.error(error?.message || 'Unable to load items. Please try again.');
        setItems([]);
      } finally {
        setIsLoadingItems(false);
      }
    };

    load();
  }, [isFormOpen, formData.locationStored, toast]);

  useEffect(() => {
    if (isFormOpen) return;

    const loadIssued = async () => {
      setIsLoadingIssued(true);
      try {
        const pageSize = 100;
        const result = await listSampleIssues({
          status_filter: 'Issued,Partial Return,Returned',
          skip: issuedPage * pageSize,
          limit: pageSize,
        });
        setIssuedIssues(result);
      } catch (error: any) {
        console.error('Failed to load issued sample issues:', error);
        toast.error(error?.message || 'Unable to load issued sample issues.');
        setIssuedIssues([]);
      } finally {
        setIsLoadingIssued(false);
      }
    };

    loadIssued();
  }, [isFormOpen, issuedPage, toast]);

  const updateDropdownPosition = () => {
    const input = searchInputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
  };

  useLayoutEffect(() => {
    if (!showDropdown || isFormOpen) return;
    updateDropdownPosition();

    const onScrollOrResize = () => updateDropdownPosition();
    const mainContent = document.querySelector<HTMLElement>('.main-content');

    window.addEventListener('resize', onScrollOrResize);
    // Capture scroll events from any scrollable ancestors (including .main-content).
    window.addEventListener('scroll', onScrollOrResize, true);
    mainContent?.addEventListener('scroll', onScrollOrResize, { passive: true });

    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
      mainContent?.removeEventListener('scroll', onScrollOrResize);
    };
  }, [showDropdown, isFormOpen, searchResults.length, debouncedSearchQuery]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const container = searchContainerRef.current;
      const dropdown = dropdownRef.current;
      if (!(event.target instanceof Node)) return;
      const clickedInside =
        (container && container.contains(event.target)) ||
        (dropdown && dropdown.contains(event.target));
      if (!clickedInside) setShowDropdown(false);
    };

    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);

    if (selectedProject && value.trim() !== selectedProject.ProjectId) {
      setSelectedProject(null);
    }

    if (!value.trim()) {
      setShowDropdown(false);
      setSearchResults([]);
    }
  };

  const handleSelectProject = (project: ERPProjectSearchResult) => {
    suppressNextSearchRef.current = true;
    setSelectedProject(project);
    setSearchQuery(project.ProjectId);
    setSearchResults([]);
    setShowDropdown(false);
    setDropdownPos(null);
  };

  const handleCreateIssue = async () => {
    if (!selectedProject) {
      toast.warning('Please select a project first.');
      return;
    }

    setIsLoadingProjectDetails(true);
    try {
      const projectDetails = await getProjectDetails(selectedProject.ProjectId);

      setFormData({
        docNumber: '',
        projectId: projectDetails.ProjectId,
        customerName: projectDetails.CustomerName === null ? null : projectDetails.CustomerName,
        salesperson: projectDetails.SalesPerson === null ? null : projectDetails.SalesPerson,
        projectManager: projectDetails.ProjectManager === null ? null : projectDetails.ProjectManager,
        dateOfIssue: localISODate(),
        businessUnit: projectDetails.Businessunit === null ? null : projectDetails.Businessunit,
        subsidiary: projectDetails.BRCompany === null ? null : projectDetails.BRCompany,
        locationStored: '',
        status: 'Draft',
        dispositionType: '',
        lineItems: []
      });

      setIsViewOnly(false);
      setIsFormOpen(true);
    } catch (error) {
      console.error('Failed to load project details:', error);
      toast.error('Unable to load project details. Please try again.');
    } finally {
      setIsLoadingProjectDetails(false);
    }
  };

  const handleViewIssue = async (docNumber: string) => {
    const doc = (docNumber || '').trim();
    if (!doc) return;

    setIsLoadingProjectDetails(true);
    try {
      const issue = await getSampleIssueByDocNumber(doc);
      const disposition = DISPOSITION_TYPES.includes(issue.disposition_type as any)
        ? (issue.disposition_type as any)
        : '';
      setFormData({
        docNumber: issue.doc_number,
        projectId: issue.project_id,
        customerName: issue.customer_name ?? null,
        salesperson: issue.salesperson ?? null,
        projectManager: issue.project_manager ?? null,
        dateOfIssue: String(issue.date_of_issue).slice(0, 10),
        businessUnit: issue.business_unit ?? null,
        subsidiary: issue.subsidiary ?? null,
        locationStored: issue.location_stored ?? '',
        status: (issue.status as any) || 'Draft',
        dispositionType: disposition,
        lineItems: issue.line_items.map((li) => ({
          id: li.id,
          itemName: li.item_name,
          workId: li.work_id || '',
          description: li.description || '',
          qtyOnHand: li.qty_on_hand,
          qtyIssue: li.qty_issue,
        })),
      });
      setIsViewOnly(true);
      setIsFormOpen(true);
    } catch (error: any) {
      console.error('Failed to load sample issue for view:', error);
      toast.error(error?.message || 'Unable to load sample issue.');
    } finally {
      setIsLoadingProjectDetails(false);
    }
  };

  const handleDownloadIssuedExcel = async () => {
    try {
      const pageSize = 100;
      const skip = issuedPage * pageSize;
      const qs = new URLSearchParams({
        skip: String(skip),
        limit: String(pageSize),
        status_filter: 'Issued,Partial Return,Returned',
      });
      const res = await fetch(`${API_BASE_URL}/api/sample-issues/export.xlsx?${qs.toString()}`);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Failed to download excel (${res.status})`);
      }
      const blob = await res.blob();
      const filename = _filenameFromDisposition(res.headers.get('content-disposition')) || 'sample-issues.xlsx';
      _downloadBlob(filename, blob);
      toast.success('Excel downloaded.');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to download Excel.');
    }
  };

  const handleBackToSearch = () => {
    setIsFormOpen(false);
    setIsViewOnly(false);
    setSelectedProject(null);
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setSearchResults([]);
    setShowDropdown(false);
    setDropdownPos(null);
    setFormData(createEmptyIssue());
    setIssuedPage(0);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const handleInputChange = (field: keyof SampleIssue, value: any) => {
    if (isViewOnly) return;
    setFormData({
      ...formData,
      [field]: value
    });
  };

  const addLineItem = () => {
    if (isViewOnly) return;
    const newItem: SampleLineItem = {
      id: Date.now().toString(),
      itemName: '',
      workId: '',
      description: '',
      qtyOnHand: 0,
      qtyIssue: ''
    };
    setFormData({
      ...formData,
      lineItems: [...formData.lineItems, newItem]
    });
  };

  const removeLineItem = (id: string) => {
    if (isViewOnly) return;
    setFormData({
      ...formData,
      lineItems: formData.lineItems.filter(item => item.id !== id)
    });
  };

  const updateLineItem = (id: string, field: keyof SampleLineItem, value: any) => {
    if (isViewOnly) return;
    setFormData({
      ...formData,
      lineItems: formData.lineItems.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    });
  };

  const handleItemSelect = (id: string, itemName: string) => {
    if (isViewOnly) return;
    if (!itemName) {
      setFormData(prev => ({
        ...prev,
        lineItems: prev.lineItems.map(lineItem =>
          lineItem.id === id
            ? { ...lineItem, itemName: '', workId: '', description: '', qtyOnHand: 0 }
            : lineItem
        )
      }));
      return;
    }

    const item = items.find(i => i.item_name === itemName);
    if (item) {
      setFormData(prev => ({
        ...prev,
        lineItems: prev.lineItems.map(lineItem =>
          lineItem.id === id
            ? {
                ...lineItem,
                itemName: item.item_name,
                description: item.description || '',
                qtyOnHand: Number.isFinite(item.qty_available) ? item.qty_available : item.qty_on_hand
              }
            : lineItem
        )
      }));
    }
  };

  const _validateIssue = () => {
    if (!formData.projectId || !formData.dispositionType || formData.lineItems.length === 0) {
      toast.warning('Select a project, choose disposition type, and add at least one line item.');
      return false;
    }

    for (let i = 0; i < formData.lineItems.length; i++) {
      const li = formData.lineItems[i];
      const row = i + 1;

      if (!li.itemName) {
        toast.warning(`Row ${row}: select an item.`);
        return false;
      }

      if (!(li.workId || '').trim()) {
        toast.warning(`Row ${row} (${li.itemName}): enter Work ID.`);
        return false;
      }

      if (li.qtyIssue === '') {
        toast.warning(`Row ${row} (${li.itemName}): enter Qty Issue.`);
        return false;
      }

      if (li.qtyIssue <= 0) {
        toast.warning(`Row ${row} (${li.itemName}): Qty Issue must be greater than 0.`);
        return false;
      }

      if (li.qtyIssue > li.qtyOnHand) {
        toast.warning(
          `Row ${row} (${li.itemName}): Qty Issue (${li.qtyIssue}) exceeds Qty On Hand (${li.qtyOnHand}).`
        );
        return false;
      }
    }

    return true;
  };

  const _saveIssue = async (status: 'Draft' | 'Issued') => {
    if (!_validateIssue()) return;
    if (isSaving) return;

    setIsSaving(true);
    try {
      const payload = {
        project_id: formData.projectId,
        customer_name: formData.customerName,
        salesperson: formData.salesperson,
        project_manager: formData.projectManager,
        // Send a "naive" datetime string (no timezone) to avoid date shifting (e.g. IST -> previous UTC day).
        date_of_issue: `${formData.dateOfIssue}T00:00:00`,
        business_unit: formData.businessUnit,
        subsidiary: formData.subsidiary,
        location_stored: formData.locationStored || null,
        disposition_type: formData.dispositionType,
        status,
        line_items: formData.lineItems.map((li) => ({
          item_name: li.itemName,
          work_id: li.workId.trim(),
          description: li.description || null,
          qty_on_hand: Number(li.qtyOnHand || 0),
          qty_issue: li.qtyIssue === '' ? 0 : Number(li.qtyIssue),
        })),
      };

      const saved = await createSampleIssue(payload);

      setFormData((prev) => ({
        ...prev,
        docNumber: saved.doc_number,
        status: saved.status as any,
        lineItems: saved.line_items.map((li) => ({
          id: li.id,
          itemName: li.item_name,
          workId: li.work_id || '',
          description: li.description || '',
          qtyOnHand: li.qty_on_hand,
          qtyIssue: li.qty_issue,
        })),
      }));

      toast.success(`Sample Issue ${status === 'Issued' ? 'submitted' : 'saved'} (${saved.doc_number})`);
      if (status === 'Issued') {
        handleBackToSearch();
      }
    } catch (error: any) {
      console.error('Failed to save sample issue:', error);
      toast.error(error?.message || 'Unable to save sample issue. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => _saveIssue('Draft');
  const handleSubmit = () => _saveIssue('Issued');

  const canPrintDoc = Boolean((formData.docNumber || '').trim());
  const handlePrint = () => {
    if (!canPrintDoc) {
      toast.warning('You can print after saving draft or submitting.');
      return;
    }
    window.print();
  };

  return (
    <div className="sample-issue-page">
      <div className="no-print">
      <div className="project-search-section">
        <h2>Search Project</h2>
        <div className="project-search-wrapper">
          <label className="project-search-label">
            Project ID <span style={{ color: '#ff4444' }}>*</span>
          </label>

          <div className="project-search-row" ref={searchContainerRef}>
            <div className="project-search-container">
              <input
                ref={searchInputRef}
                type="text"
                className="project-search-input"
                placeholder="Type project number or customer name to search..."
                value={searchQuery}
                disabled={isFormOpen || isLoadingProjectDetails}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => {
                  if (debouncedSearchQuery.trim()) {
                    setShowDropdown(true);
                    updateDropdownPosition();
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setShowDropdown(false);
                }}
              />

              {(isSearching || searchQuery !== debouncedSearchQuery) && (
                <div className="search-loading">Searching...</div>
              )}

            </div>

            <button
              className="btn btn-primary project-create-issue-btn"
              onClick={handleCreateIssue}
              disabled={!selectedProject || isLoadingProjectDetails || isFormOpen}
            >
              {isLoadingProjectDetails ? 'Loading...' : 'Create Issue'}
            </button>
          </div>

          {selectedProject && !isFormOpen && (
            <div className="project-selected-hint">
              Selected: <strong>{selectedProject.ProjectId}</strong>
            </div>
          )}
        </div>
      </div>

      {isFormOpen ? null : (
        <div className="form-card" style={{ marginTop: 18 }}>
          <div className="form-section">
            <div
              className="section-header"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <h2 style={{ margin: 0 }}>Latest Issued / Returned</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setIssuedPage((p) => Math.max(0, p - 1))}
                  disabled={isLoadingIssued || issuedPage === 0}
                >
                  Prev
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setIssuedPage((p) => p + 1)}
                  disabled={isLoadingIssued || issuedIssues.length < 100}
                >
                  Next
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleDownloadIssuedExcel}
                  disabled={isLoadingIssued || issuedIssues.length === 0}
                  type="button"
                >
                  Download Excel
                </button>
              </div>
            </div>

            {isLoadingIssued ? (
              <div style={{ padding: 12 }}>Loading issued issues...</div>
            ) : issuedIssues.length === 0 ? (
              <div style={{ padding: 12 }}>No issued sample issues found.</div>
            ) : (
              <div className="table-container">
                <table className="project-list-table">
                  <thead>
                    <tr>
                      <th>Doc #</th>
                      <th>Project ID</th>
                      <th>Customer</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Aging (Days)</th>
                      <th>Store</th>
                      <th>Business Unit</th>
                      <th style={{ width: 110 }}>View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issuedIssues.map((iss) => (
                      <tr key={iss.id}>
                        <td>{iss.doc_number}</td>
                        <td>{iss.project_id}</td>
                        <td>{iss.customer_name || ''}</td>
                        <td>{String(iss.date_of_issue || '').slice(0, 10)}</td>
                        <td>{iss.status || ''}</td>
                        <td>{_agingDays(iss.date_of_issue)}</td>
                        <td>{iss.location_stored || ''}</td>
                        <td>{iss.business_unit || ''}</td>
                        <td>
                          <button
                            className="btn btn-secondary btn-small"
                            type="button"
                            onClick={() => handleViewIssue(iss.doc_number)}
                            disabled={!iss.doc_number || isLoadingProjectDetails}
                            title="View document (read-only)"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ paddingTop: 10, fontSize: 13, opacity: 0.8 }} />
          </div>
        </div>
      )}

      {showDropdown && !isFormOpen && debouncedSearchQuery.trim() && dropdownPos
        ? createPortal(
            <div
              ref={dropdownRef}
              className="project-dropdown"
              style={{
                position: 'fixed',
                top: dropdownPos.top,
                left: dropdownPos.left,
                right: 'auto',
                width: dropdownPos.width,
                zIndex: 100000,
              }}
            >
              {searchResults.length === 0 ? (
                <div className="project-dropdown-empty">No projects found.</div>
              ) : (
                searchResults.map((project) => (
                  <div
                    key={project.ProjectId}
                    className="project-dropdown-item"
                    onClick={() => handleSelectProject(project)}
                  >
                    <div className="project-id">{project.ProjectId}</div>
                    <div className="project-details">
                      <span className="customer-name">{project.CustomerName || 'null'}</span>
                      <span className="business-unit">{project.Businessunit || 'null'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>,
            document.body
          )
        : null}

      {!isFormOpen ? null : (
        <>
          <div className="page-header">
            <h1>Sample Issue</h1>
            <div className="header-actions">
              <button className="btn btn-secondary" onClick={handleBackToSearch} disabled={isSaving}>
                ← Back to Projects
              </button>
              {isViewOnly ? null : (
                <>
                  <button className="btn btn-secondary" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Draft'}
                  </button>
                  <button className="btn btn-primary" onClick={handleSubmit} disabled={isSaving}>
                    {isSaving ? 'Submitting...' : 'Submit Issue'}
                  </button>
                </>
              )}
              <button
                className={`btn btn-print ${canPrintDoc ? '' : 'btn-disabled'}`}
                onClick={handlePrint}
                type="button"
                title={canPrintDoc ? 'Print' : 'You can print after saving draft or submitting.'}
                aria-disabled={!canPrintDoc}
              >
                Print
              </button>
            </div>
          </div>

          <div className="form-card">
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
                  <label>Date of Issue</label>
                  <input
                    type="date"
                    value={formData.dateOfIssue || ''}
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

            <div className="project-info-section">
              <h3>
                <DocumentTextIcon className="section-icon" />
                Project Information <span className="section-subtitle">(Filled using SELECTED project ID)</span>
              </h3>
              <div className="project-info-grid">
                <div className="form-group project-id-highlight">
                  <label className="project-id-label">Project ID</label>
                  <input
                    type="text"
                    value={formData.projectId === null ? '' : formData.projectId}
                    disabled
                    className="input-field input-disabled project-id-input"
                    placeholder={formData.projectId ? 'null' : 'Select a project to auto-fill'}
                  />
                </div>
                <div className="form-group">
                  <label>Customer Name</label>
                  <input
                    type="text"
                    value={formData.customerName === null ? '' : formData.customerName}
                    disabled
                    className="input-field input-disabled"
                    placeholder={formData.projectId ? 'null' : 'Select a project to auto-fill'}
                  />
                </div>

                <div className="form-group">
                  <label>Salesperson</label>
                  <input
                    type="text"
                    value={formData.salesperson === null ? '' : formData.salesperson}
                    disabled
                    className="input-field input-disabled"
                    placeholder={formData.projectId ? 'null' : 'Select a project to auto-fill'}
                  />
                </div>

                <div className="form-group">
                  <label>Project Manager</label>
                  <input
                    type="text"
                    value={formData.projectManager === null ? '' : formData.projectManager}
                    disabled
                    className="input-field input-disabled"
                    placeholder={formData.projectId ? 'null' : 'Select a project to auto-fill'}
                  />
                </div>

                <div className="form-group">
                  <label>Business Unit</label>
                  <input
                    type="text"
                    value={formData.businessUnit === null ? '' : formData.businessUnit}
                    disabled
                    className="input-field input-disabled"
                    placeholder={formData.projectId ? 'null' : 'Select a project to auto-fill'}
                  />
                </div>

                <div className="form-group">
                  <label>Subsidiary</label>
                  <input
                    type="text"
                    value={formData.subsidiary === null ? '' : formData.subsidiary}
                    disabled
                    className="input-field input-disabled"
                    placeholder={formData.projectId ? 'null' : 'Select a project to auto-fill'}
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h2>Sample Details</h2>
              <div className="sample-details-grid">
                <div className="form-group">
                  <label>Location Stored</label>
                  <select
                    value={formData.locationStored}
                    onChange={(e) => handleInputChange('locationStored', e.target.value)}
                    className="input-field"
                    disabled={isViewOnly}
                  >
                    <option value="">Select Location</option>
                    {LOCATIONS.map(location => (
                      <option key={location} value={location}>{location}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Sample Disposition Type <span className="required">*</span></label>
                  <select
                    value={formData.dispositionType}
                    onChange={(e) => handleInputChange('dispositionType', e.target.value)}
                    className="input-field"
                    disabled={isViewOnly}
                  >
                    <option value="">Select Disposition Type</option>
                    {DISPOSITION_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="section-header">
                <h2>Line Items</h2>
                {isViewOnly ? null : (
                  <button className="btn btn-add" onClick={addLineItem}>+ Add Item</button>
                )}
              </div>

              <div className="table-container">
                <table className="line-items-table">
                  <thead>
                    <tr>
                      <th>Item Name</th>
                      <th>Work ID</th>
                      <th>Description</th>
                      <th>Qty On Hand</th>
                      <th>Qty Issue</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.lineItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="empty-state">
                          No items added. Click "Add Item" to begin.
                        </td>
                      </tr>
                    ) : (
                      formData.lineItems.map((item) => (
                        <tr key={item.id}>
                          <td>
                              <select
                                value={item.itemName}
                                onChange={(e) => handleItemSelect(item.id, e.target.value)}
                                className="table-input"
                                disabled={isViewOnly}
                              >
                                <option value="">{isLoadingItems ? 'Loading...' : 'Select Item'}</option>
                                {[...items]
                                  .sort((a, b) => a.item_name.localeCompare(b.item_name))
                                  .map((dbItem) => (
                                    <option key={dbItem.id} value={dbItem.item_name}>
                                      {dbItem.item_name}
                                    </option>
                                  ))}
                              </select>
                            </td>
                          <td>
                            <input
                              type="text"
                              value={item.workId}
                              onChange={(e) => updateLineItem(item.id, 'workId', e.target.value)}
                              className="table-input"
                              placeholder="Work ID"
                              disabled={isViewOnly}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                              className="table-input"
                              placeholder="Description"
                              disabled={isViewOnly}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={item.qtyOnHand}
                              disabled
                              className="table-input input-disabled"
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={item.qtyIssue === '' ? '' : String(item.qtyIssue)}
                              onChange={(e) => {
                                const raw = e.target.value.trim();
                                if (raw === '') {
                                  updateLineItem(item.id, 'qtyIssue', '');
                                  return;
                                }
                                if (!/^\d+$/.test(raw)) return;
                                updateLineItem(item.id, 'qtyIssue', Number(raw));
                              }}
                              className="table-input"
                              min="1"
                              max={item.qtyOnHand}
                              placeholder="0"
                              disabled={isViewOnly}
                            />
                          </td>
                          <td>
                            {isViewOnly ? null : (
                              <button
                                className="btn-delete"
                                onClick={() => removeLineItem(item.id)}
                              >
                                Delete
                              </button>
                            )}
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
                  Total Quantity: {formData.lineItems.reduce((sum, item) => sum + (item.qtyIssue === '' ? 0 : item.qtyIssue), 0)}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
      </div>

      <div className="print-only">
        <PrintableSampleIssueDoc formData={formData} />
      </div>
    </div>
  );
};

export default SampleIssuePage;
