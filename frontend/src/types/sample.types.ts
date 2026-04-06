export interface Project {
  id: string;
  projectId: string;
  customerName: string;
  salesperson: string;
  projectManager: string;
}

// ERP Project types - matching backend exact field names
export interface ERPProjectDetail {
  ProjectId: string;
  CustomerName: string | null;
  SalesPerson: string | null;
  BRCompany: string | null;
  Businessunit: string | null;
  ProjectManager: string | null;
  createdOn: string | null;
}

export interface ERPProjectSearchResult {
  ProjectId: string;
  CustomerName: string | null;
  Businessunit: string | null;
}

export interface Item {
  id: string;
  itemName: string;
  description: string;
  qtyOnHand: number;
}

export interface SampleLineItem {
  id: string;
  itemName: string;
  workId: string;
  description: string;
  qtyOnHand: number;
  qtyIssue: number | '';
}

export interface SampleIssue {
  docNumber: string;
  projectId: string;
  customerName: string | null;
  salesperson: string | null;
  projectManager: string | null;
  dateOfIssue: string;
  businessUnit: string | null;
  subsidiary: string | null;
  locationStored: string;
  status: 'Draft' | 'Issued' | 'Partial Return' | 'Returned';
  dispositionType: DispositionType | '';
  lineItems: SampleLineItem[];
}

export type DispositionType =
  | 'Scrapping'
  | 'Used in Main Project'
  | 'Missing'
  | 'Issued to Customer'
  | 'Issued out for Rework';

export const DISPOSITION_TYPES: DispositionType[] = [
  'Scrapping',
  'Used in Main Project',
  'Missing',
  'Issued to Customer',
  'Issued out for Rework'
];

export const LOCATIONS = [
  'Sample Store Dubai',
  'Main Store UAQ'
];

export const STATUS_OPTIONS = [
  'Draft',
  'Issued',
  'Partial Return',
  'Returned'
];
