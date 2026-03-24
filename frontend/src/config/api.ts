// API Configuration
const envUrl = (process.env.REACT_APP_API_URL || '').trim();

// In CRA dev, prefer same-origin requests and rely on `package.json` proxy to avoid CORS.
const shouldUseDevProxy =
  process.env.NODE_ENV === 'development' &&
  (!envUrl || envUrl === 'http://localhost:8000' || envUrl === 'https://localhost:8000');

export const API_BASE_URL = shouldUseDevProxy ? '' : envUrl.replace(/\/+$/, '');

export const API_ENDPOINTS = {
  // ERP Projects
  erpProjectsSearch: '/api/erp/projects/search',
  erpProjectDetail: (projectId: string) => `/api/erp/projects/${encodeURIComponent(projectId)}`,
  erpProjectsList: '/api/erp/projects/',
} as const;
