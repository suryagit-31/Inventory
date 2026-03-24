import React from 'react';
import './CommonPage.css';

const ReportsPage: React.FC = () => {
  return (
    <div className="common-page">
      <div className="page-header">
        <h1>Reports</h1>
      </div>
      <div className="form-card">
        <div className="coming-soon">
          <h2>Coming Soon</h2>
          <p>Generate sample inventory and customer-based reports.</p>
          <ul>
            <li>Sample Inventory Report</li>
            <li>Customer-Based Sample Report</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
