import React, { useState } from 'react';
import { LOCATIONS } from '../types/sample.types';
import { generateDocNumber } from '../data/mockData';
import { useToast } from '../components/Toast/ToastContext';
import { createInventoryAddOn } from '../services/inventoryService';
import { localISODate } from '../utils/date';
import './SampleIssuePage.css';

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

const InventoryAddOnPage: React.FC = () => {
  const toast = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<InventoryAddOn>({
    docNumber: generateDocNumber().replace('SI-', 'IA-'),
    date: localISODate(),
    locationStore: '',
    lineItems: []
  });

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

  const handleSave = async () => {
    if (!formData.locationStore || formData.lineItems.length === 0) {
      toast.warning('Please select location and add at least one item');
      return;
    }

    for (let i = 0; i < formData.lineItems.length; i++) {
      const item = formData.lineItems[i];
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
          line_items: formData.lineItems.map((item) => ({
            item_name: item.itemName.trim(),
            description: item.description?.trim() || undefined,
            quantity: Number(item.quantity),
          })),
        };

      const saved = await createInventoryAddOn(payload);
      toast.success(`Inventory added successfully (${saved.doc_number})`);

      // Reset form (doc # is server-generated; keep UI placeholder).
      setFormData({
        docNumber: generateDocNumber().replace('SI-', 'IA-'),
        date: localISODate(),
        locationStore: '',
        lineItems: []
      });
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
      <div className="page-header">
        <h1>Inventory Add-On</h1>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={handleSave}>Save & Add to Inventory</button>
          <button className="btn btn-secondary" onClick={handlePrint}>Print</button>
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
                value={formData.docNumber || 'null'}
                disabled
                className="input-field input-disabled"
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
            <button className="btn btn-add" onClick={addLineItem}>+ Add Item</button>
          </div>

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
                        <input
                          type="text"
                          value={item.itemName}
                          onChange={(e) => updateLineItem(item.id, 'itemName', e.target.value)}
                          className="table-input"
                          placeholder="Enter item name"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                          className="table-input"
                          placeholder="Enter description"
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
                        />
                      </td>
                      <td>
                        <button
                          className="btn-delete"
                          onClick={() => removeLineItem(item.id)}
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
    </div>
  );
};

export default InventoryAddOnPage;
