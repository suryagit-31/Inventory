-- Sample Tracker Module - Database Setup Script
-- Microsoft SQL Server

-- Create database (if not exists)
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'SampleTrackerDB')
BEGIN
    CREATE DATABASE SampleTrackerDB;
    PRINT 'Database SampleTrackerDB created successfully.';
END
ELSE
BEGIN
    PRINT 'Database SampleTrackerDB already exists.';
END
GO

USE SampleTrackerDB;
GO

-- =============================================
-- Table: ErpSampleTrackerProjects
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ErpSampleTrackerProjects')
BEGIN
    CREATE TABLE dbo.ErpSampleTrackerProjects (
        id NVARCHAR(50) PRIMARY KEY,
        project_number NVARCHAR(50) UNIQUE NOT NULL,
        customer_name NVARCHAR(200) NOT NULL,
        salesperson NVARCHAR(100) NOT NULL,
        project_manager NVARCHAR(100) NOT NULL,
        status NVARCHAR(20) DEFAULT 'Active',
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
    CREATE INDEX idx_ErpSampleTrackerProjects_project_number ON dbo.ErpSampleTrackerProjects(project_number);
    PRINT 'Table ErpSampleTrackerProjects created successfully.';
END
GO

-- =============================================
-- Table: ErpSampleTrackerItems
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ErpSampleTrackerItems')
BEGIN
    CREATE TABLE dbo.ErpSampleTrackerItems (
        id NVARCHAR(50) PRIMARY KEY,
        item_name NVARCHAR(100) UNIQUE NOT NULL,
        description NVARCHAR(500),
        location NVARCHAR(100),
        qty_on_hand FLOAT DEFAULT 0.0,
        qty_issued FLOAT DEFAULT 0.0,
        qty_available FLOAT DEFAULT 0.0,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
    CREATE INDEX idx_ErpSampleTrackerItems_item_name ON dbo.ErpSampleTrackerItems(item_name);
    PRINT 'Table ErpSampleTrackerItems created successfully.';
END
GO

-- =============================================
-- Table: ErpSampleTrackerSampleIssues
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ErpSampleTrackerSampleIssues')
BEGIN
    CREATE TABLE dbo.ErpSampleTrackerSampleIssues (
        id NVARCHAR(50) PRIMARY KEY,
        doc_number NVARCHAR(50) UNIQUE NOT NULL,
        project_number NVARCHAR(50) NOT NULL,
        customer_name NVARCHAR(200),
        salesperson NVARCHAR(100),
        project_manager NVARCHAR(100),
        date_of_issue DATETIME NOT NULL,
        business_unit NVARCHAR(100),
        subsidiary NVARCHAR(100),
        location_stored NVARCHAR(100),
        status NVARCHAR(20) DEFAULT 'Draft' NOT NULL,
        disposition_type NVARCHAR(50) NOT NULL,
        created_by NVARCHAR(100),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
    CREATE INDEX idx_ErpSampleTrackerSampleIssues_doc_number ON dbo.ErpSampleTrackerSampleIssues(doc_number);
    CREATE INDEX idx_ErpSampleTrackerSampleIssues_project_number ON dbo.ErpSampleTrackerSampleIssues(project_number);
    CREATE INDEX idx_ErpSampleTrackerSampleIssues_status ON dbo.ErpSampleTrackerSampleIssues(status);
    PRINT 'Table ErpSampleTrackerSampleIssues created successfully.';
END
GO

-- =============================================
-- Table: ErpSampleTrackerSampleIssueLines
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ErpSampleTrackerSampleIssueLines')
BEGIN
    CREATE TABLE dbo.ErpSampleTrackerSampleIssueLines (
        id NVARCHAR(50) PRIMARY KEY,
        header_id NVARCHAR(50) NOT NULL,
        item_name NVARCHAR(100) NOT NULL,
        description NVARCHAR(500),
        qty_on_hand FLOAT NOT NULL,
        qty_issue FLOAT NOT NULL,
        created_at DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (header_id) REFERENCES dbo.ErpSampleTrackerSampleIssues(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_ErpSampleTrackerSampleIssueLines_header_id ON dbo.ErpSampleTrackerSampleIssueLines(header_id);
    PRINT 'Table ErpSampleTrackerSampleIssueLines created successfully.';
END
GO

-- =============================================
-- Table: ErpSampleTrackerInventoryAddOns
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ErpSampleTrackerInventoryAddOns')
BEGIN
    CREATE TABLE dbo.ErpSampleTrackerInventoryAddOns (
        id NVARCHAR(50) PRIMARY KEY,
        doc_number NVARCHAR(50) UNIQUE NOT NULL,
        date DATETIME NOT NULL,
        location_store NVARCHAR(100) NOT NULL,
        created_by NVARCHAR(100),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
    CREATE INDEX idx_ErpSampleTrackerInventoryAddOns_doc_number ON dbo.ErpSampleTrackerInventoryAddOns(doc_number);
    PRINT 'Table ErpSampleTrackerInventoryAddOns created successfully.';
END
GO

-- =============================================
-- Table: ErpSampleTrackerInventoryAddOnLines
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ErpSampleTrackerInventoryAddOnLines')
BEGIN
    CREATE TABLE dbo.ErpSampleTrackerInventoryAddOnLines (
        id NVARCHAR(50) PRIMARY KEY,
        header_id NVARCHAR(50) NOT NULL,
        item_name NVARCHAR(100) NOT NULL,
        description NVARCHAR(500),
        quantity INT NOT NULL,
        created_at DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (header_id) REFERENCES dbo.ErpSampleTrackerInventoryAddOns(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_ErpSampleTrackerInventoryAddOnLines_header_id ON dbo.ErpSampleTrackerInventoryAddOnLines(header_id);
    PRINT 'Table ErpSampleTrackerInventoryAddOnLines created successfully.';
END
GO

-- =============================================
-- Table: ErpSampleTrackerSampleReturns
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ErpSampleTrackerSampleReturns')
BEGIN
    CREATE TABLE dbo.ErpSampleTrackerSampleReturns (
        id NVARCHAR(50) PRIMARY KEY,
        doc_number NVARCHAR(50) UNIQUE NOT NULL,
        original_issue_id NVARCHAR(50) NOT NULL,
        date_of_return DATETIME NOT NULL,
        remarks NVARCHAR(500),
        status NVARCHAR(20) DEFAULT 'Draft' NOT NULL,
        created_by NVARCHAR(100),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (original_issue_id) REFERENCES dbo.ErpSampleTrackerSampleIssues(id)
    );
    CREATE INDEX idx_ErpSampleTrackerSampleReturns_doc_number ON dbo.ErpSampleTrackerSampleReturns(doc_number);
    CREATE INDEX idx_ErpSampleTrackerSampleReturns_original_issue_id ON dbo.ErpSampleTrackerSampleReturns(original_issue_id);
    PRINT 'Table ErpSampleTrackerSampleReturns created successfully.';
END
GO

-- =============================================
-- Table: ErpSampleTrackerSampleReturnLines
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ErpSampleTrackerSampleReturnLines')
BEGIN
    CREATE TABLE dbo.ErpSampleTrackerSampleReturnLines (
        id NVARCHAR(50) PRIMARY KEY,
        header_id NVARCHAR(50) NOT NULL,
        item_name NVARCHAR(100) NOT NULL,
        description NVARCHAR(500),
        qty_issued FLOAT NOT NULL,
        qty_return FLOAT NOT NULL,
        created_at DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (header_id) REFERENCES dbo.ErpSampleTrackerSampleReturns(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_ErpSampleTrackerSampleReturnLines_header_id ON dbo.ErpSampleTrackerSampleReturnLines(header_id);
    PRINT 'Table ErpSampleTrackerSampleReturnLines created successfully.';
END
GO

-- =============================================
-- Create Trigger for updated_at
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_ErpSampleTrackerProjects_updated_at')
BEGIN
    EXEC('
    CREATE TRIGGER trg_ErpSampleTrackerProjects_updated_at
    ON dbo.ErpSampleTrackerProjects
    AFTER UPDATE
    AS
    BEGIN
        UPDATE dbo.ErpSampleTrackerProjects
        SET updated_at = GETDATE()
        FROM dbo.ErpSampleTrackerProjects p
        INNER JOIN inserted i ON p.id = i.id;
    END
    ');
    PRINT 'Trigger trg_ErpSampleTrackerProjects_updated_at created successfully.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_ErpSampleTrackerItems_updated_at')
BEGIN
    EXEC('
    CREATE TRIGGER trg_ErpSampleTrackerItems_updated_at
    ON dbo.ErpSampleTrackerItems
    AFTER UPDATE
    AS
    BEGIN
        UPDATE dbo.ErpSampleTrackerItems
        SET updated_at = GETDATE()
        FROM dbo.ErpSampleTrackerItems i
        INNER JOIN inserted ins ON i.id = ins.id;
    END
    ');
    PRINT 'Trigger trg_ErpSampleTrackerItems_updated_at created successfully.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_ErpSampleTrackerSampleIssues_updated_at')
BEGIN
    EXEC('
    CREATE TRIGGER trg_ErpSampleTrackerSampleIssues_updated_at
    ON dbo.ErpSampleTrackerSampleIssues
    AFTER UPDATE
    AS
    BEGIN
        UPDATE dbo.ErpSampleTrackerSampleIssues
        SET updated_at = GETDATE()
        FROM dbo.ErpSampleTrackerSampleIssues s
        INNER JOIN inserted i ON s.id = i.id;
    END
    ');
    PRINT 'Trigger trg_ErpSampleTrackerSampleIssues_updated_at created successfully.';
END
GO

PRINT '';
PRINT '=============================================';
PRINT 'Database setup completed successfully!';
PRINT '=============================================';
