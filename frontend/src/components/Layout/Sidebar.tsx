import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  CubeIcon,
  PlusCircleIcon,
  ArrowUturnLeftIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';
import './Sidebar.css';

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      name: 'Sample Issue',
      path: '/sample-issue',
      icon: CubeIcon
    },
    {
      name: 'Inventory Add-On',
      path: '/inventory-addon',
      icon: PlusCircleIcon
    },
    {
      name: 'Sample Return',
      path: '/sample-return',
      icon: ArrowUturnLeftIcon
    },
    {
      name: 'Reports',
      path: '/reports',
      icon: ChartBarIcon
    }
  ];

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.path}
              className={`sidebar-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <Icon className="sidebar-icon" />
              <span className="sidebar-label">{item.name}</span>
            </div>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
