import { Project, Item } from '../types/sample.types';

export const mockProjects: Project[] = [
  {
    id: '1',
    projectNumber: 'PRJ-2026-001',
    customerName: 'ABC Construction LLC',
    salesperson: 'John Smith',
    projectManager: 'Sarah Johnson'
  },
  {
    id: '2',
    projectNumber: 'PRJ-2026-002',
    customerName: 'XYZ Development Corp',
    salesperson: 'Mike Brown',
    projectManager: 'Emily Davis'
  },
  {
    id: '3',
    projectNumber: 'PRJ-2026-003',
    customerName: 'Gulf Engineering Solutions',
    salesperson: 'Ahmed Al-Farsi',
    projectManager: 'Mohammed Hassan'
  }
];

export const mockItems: Item[] = [
  {
    id: '1',
    itemName: 'Sample 1',
    description: 'High-grade steel sample',
    qtyOnHand: 50
  },
  {
    id: '2',
    itemName: 'Sample 123',
    description: 'Aluminum composite panel',
    qtyOnHand: 30
  },
  {
    id: '3',
    itemName: 'Sample A-200',
    description: 'Thermal insulation material',
    qtyOnHand: 100
  },
  {
    id: '4',
    itemName: 'Sample B-150',
    description: 'Waterproofing membrane',
    qtyOnHand: 75
  }
];

export const generateDocNumber = (): string => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  return `SI-${year}${month}-${random}`;
};
