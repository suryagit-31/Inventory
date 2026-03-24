import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import SampleIssuePage from './pages/SampleIssuePage';
import InventoryAddOnPage from './pages/InventoryAddOnPage';
import SampleReturnPage from './pages/SampleReturnPage';
import ReportsPage from './pages/ReportsPage';
import { ToastProvider } from './components/Toast/ToastContext';
import './App.css';

const App: React.FC = () => {
  return (
    <ToastProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/sample-issue" replace />} />
            <Route path="/sample-issue" element={<SampleIssuePage />} />
            <Route path="/sample-issue/:projectId" element={<Navigate to="/sample-issue" replace />} />
            <Route path="/inventory-addon" element={<InventoryAddOnPage />} />
            <Route path="/sample-return" element={<SampleReturnPage />} />
            <Route path="/sample-return/:issueDocNumber" element={<SampleReturnPage />} />
            <Route path="/reports" element={<ReportsPage />} />
          </Routes>
        </Layout>
      </Router>
    </ToastProvider>
  );
};

export default App;
