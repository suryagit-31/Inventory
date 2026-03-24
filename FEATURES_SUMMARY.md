# Sample Issue Page - Features Summary

## 🎨 Visual Design

### Color Scheme
- **Primary Blue**: #3C507F (header, buttons, titles)
- **Orange Accent**: #FF8C42 (action buttons, highlights)
- **White**: Clean backgrounds
- **Gray**: #f5f5f5 (page background)

### Typography
- **Font Family**: Lato, sans-serif (Google Fonts)
- **Weights**: 300, 400, 600, 700, 900

### Layout
- Blue Rhine Industries header navigation
- Responsive card-based form
- Clean table design for line items
- Professional spacing and borders

---

## 📋 Form Fields Reference

### Header Section (11 Fields)

| Field | Type | Behavior | Required |
|-------|------|----------|----------|
| **Doc #** | Text | Auto-generated (SI-YYYYMM-####) | Auto |
| **Project #** | Dropdown | User selects from list | ✅ Yes |
| **Customer Name** | Text | Auto-fetched from project | Read-only |
| **Salesperson** | Text | Auto-fetched from project | Read-only |
| **Project Manager** | Text | Auto-fetched from project | Read-only |
| **Date of Issue** | Date | Defaults to today | Optional |
| **Business Unit** | Text | Manual entry | Optional |
| **Subsidiary** | Text | Manual entry | Optional |
| **Location Stored** | Dropdown | Dubai / UAQ | Optional |
| **Status** | Text | Auto (Draft/Issued/Returned/Closed) | Read-only |
| **Disposition Type** | Dropdown | 4 options | ✅ Yes |

### Line Items Section (Dynamic Rows)

| Column | Type | Behavior | Required |
|--------|------|----------|----------|
| **Item Name** | Dropdown | Select from inventory | ✅ Yes |
| **Description** | Text | Auto-filled or editable | Optional |
| **Qty On Hand** | Number | Auto-fetched, read-only | Display |
| **Qty Issue** | Number | User input (0 to Qty On Hand) | ✅ Yes |
| **Action** | Button | Delete row | - |

---

## ⚙️ Functionality

### Auto-Population Features
1. **Doc Number Generation**
   - Format: `SI-YYYYMM-XXXX`
   - Example: `SI-202603-1234`
   - Unique per session

2. **Project Selection Trigger**
   - When project selected → Auto-fills:
     - Customer Name
     - Salesperson
     - Project Manager

3. **Item Selection Trigger**
   - When item selected → Auto-fills:
     - Description
     - Qty On Hand

### Validation Rules
- ✅ Project # must be selected
- ✅ Disposition Type must be selected
- ✅ At least 1 line item required
- ✅ Qty Issue cannot exceed Qty On Hand
- ✅ Qty Issue must be positive number

### Status Flow
```
Draft → [Submit] → Issued → [Return] → Returned → [Close] → Closed
```

### Actions
- **Save Draft**: Saves current form (allows incomplete data)
- **Submit Issue**: Validates and submits (changes status to "Issued")
- **Print**: Opens browser print dialog
- **Add Item**: Adds new row to line items
- **Delete**: Removes line item row

---

## 🗂️ File Structure Created

```
frontend/
├── public/
│   └── index.html                 # HTML template with Google Fonts
├── src/
│   ├── components/
│   │   └── Layout/
│   │       ├── Layout.tsx         # Main layout wrapper
│   │       ├── Layout.css         # Layout styles
│   │       ├── Header.tsx         # Blue Rhine header
│   │       └── Header.css         # Header styles
│   ├── pages/
│   │   ├── SampleIssuePage.tsx    # Main page component
│   │   └── SampleIssuePage.css    # Page-specific styles
│   ├── types/
│   │   └── sample.types.ts        # TypeScript interfaces
│   ├── data/
│   │   └── mockData.ts            # Mock projects & items
│   ├── App.tsx                    # Root component with routing
│   ├── App.css                    # App styles
│   ├── index.tsx                  # Entry point
│   └── index.css                  # Global styles
├── package.json                   # Dependencies
├── tsconfig.json                  # TypeScript config
├── .gitignore                     # Git ignore rules
└── README.md                      # Documentation
```

---

## 🔌 Mock Data Provided

### Projects (3)
```typescript
PRJ-2026-001 → ABC Construction LLC (John Smith, Sarah Johnson)
PRJ-2026-002 → XYZ Development Corp (Mike Brown, Emily Davis)
PRJ-2026-003 → Gulf Engineering Solutions (Ahmed Al-Farsi, Mohammed Hassan)
```

### Items (4)
```typescript
Sample 1      → High-grade steel sample (Qty: 50)
Sample 123    → Aluminum composite panel (Qty: 30)
Sample A-200  → Thermal insulation material (Qty: 100)
Sample B-150  → Waterproofing membrane (Qty: 75)
```

### Locations (2)
- Sample Store Dubai
- Main Store UAQ

### Disposition Types (4)
- Scrapping
- Used in Main Project
- Missing
- Issued to Customer

---

## 🎯 User Experience Flow

### Creating a New Sample Issue

1. **Page loads** → Doc # auto-generated, Status = "Draft"
2. **Select Project** → Customer details populate automatically
3. **Fill header fields** → Date, location, disposition type
4. **Click "Add Item"** → New row appears in table
5. **Select Item** → Description and qty populate
6. **Enter Qty Issue** → Cannot exceed qty on hand
7. **Add more items** → Repeat steps 4-6 as needed
8. **Save Draft** OR **Submit Issue**
9. **Print** if needed

---

## 📊 Data Model (TypeScript Interfaces)

### SampleIssue
```typescript
{
  docNumber: string;           // Auto-generated
  projectNumber: string;       // Required
  customerName: string;        // Auto-fetched
  salesperson: string;         // Auto-fetched
  projectManager: string;      // Auto-fetched
  dateOfIssue: string;         // Date
  businessUnit: string;
  subsidiary: string;
  locationStored: string;
  status: 'Draft' | 'Issued' | 'Returned' | 'Closed';
  dispositionType: string;     // Required
  lineItems: SampleLineItem[]; // Array
}
```

### SampleLineItem
```typescript
{
  id: string;                  // Unique ID
  itemName: string;           // Required
  description: string;
  qtyOnHand: number;          // Read-only
  qtyIssue: number;           // Required
}
```

---

## 🚀 Ready for Backend Integration

### API Endpoints Needed (Future)

```
GET  /api/projects           → List all projects
GET  /api/projects/{id}      → Get project details
GET  /api/items              → List all items
GET  /api/items/{id}         → Get item details
POST /api/sample-issues      → Create new sample issue
GET  /api/sample-issues/{id} → Get sample issue
PUT  /api/sample-issues/{id} → Update sample issue
```

### Database Tables Required

1. **SampleIssues** (Header)
2. **SampleIssueLines** (Line items)
3. **Projects** (Master data)
4. **Items** (Inventory master)
5. **Locations** (Store locations)

---

## ✨ Highlights

✅ Professional UI matching company branding
✅ Fully typed with TypeScript
✅ Responsive design
✅ Form validation
✅ Auto-population features
✅ Print-ready layout
✅ Mock data for immediate testing
✅ Clean, maintainable code structure
✅ Ready for backend integration

---

**Status**: ✅ Phase 1 Complete
**Next**: Backend API + Database Integration
