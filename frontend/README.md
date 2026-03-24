# Sample Tracker Module - Frontend

React + TypeScript frontend for the Sample Tracker Module.

## Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

### Running the Application

Start the development server:
```bash
npm start
```

The application will open at `http://localhost:3000`

## Features Implemented

### ✅ Sample Issue Page
- Auto-generated Document Number
- Project selection with auto-fetch customer details
- Header fields (Business Unit, Subsidiary, Location, Status, Disposition Type)
- Line items table with add/remove functionality
- Quantity tracking (On Hand vs Issue)
- Save Draft, Submit Issue, and Print functions
- Form validation

## Current Status
- **Frontend Only**: Uses mock data for testing
- **Mock Data Included**:
  - 3 sample projects
  - 4 sample items
  - Auto-generated doc numbers

## Next Steps
1. Backend API development (FastAPI)
2. MSSQL database integration
3. Real data connection
4. Additional pages (Inventory Add-On, Sample Return, Reports)

## Design
- **Font**: Lato
- **Primary Color**: #3C507F (Navy Blue)
- **Secondary Color**: #FF8C42 (Orange)
- **Style**: Matches Blue Rhine Industries branding
