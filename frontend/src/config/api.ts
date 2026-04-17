// API Configurationhttp://localhost:8000
const envUrl = (process.env.REACT_APP_API_URL || '').trim();
const envUrlNormalized = envUrl.replace(/\/+$/, '');

// In CRA dev: use package.json proxy only when hitting local backend (avoids CORS).
// If REACT_APP_API_URL points at a real host (e.g. production API), use it directly.
const localhostBackends = new Set(['http://localhost:8000', 'https://localhost:8000']);
const shouldUseDevProxy =
  process.env.NODE_ENV === 'development' &&
  (!envUrl || localhostBackends.has(envUrlNormalized));

export const API_BASE_URL = shouldUseDevProxy ? '' : envUrlNormalized;

if (process.env.NODE_ENV === 'development') {
  // One-line hint in the browser console: which API base URL is active
  // eslint-disable-next-line no-console
  console.info(
    '[API]',
    API_BASE_URL || '(CRA proxy → http://localhost:8000 from package.json)'
  );
}

export const API_ENDPOINTS = {
  // ERP Projects
  erpProjectsSearch: '/api/erp/projects/search',
  erpProjectDetail: (projectId: string) => `/api/erp/projects/${encodeURIComponent(projectId)}`,
  erpProjectsList: '/api/erp/projects/',
} as const;
