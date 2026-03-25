-- Sample Tracker Module - Doc Number Sequence Table Setup
-- Microsoft SQL Server
--
-- Use this script if you already created the other Sample Tracker tables and you
-- need to add the doc-number sequence table used for concurrency-safe document
-- number generation (SI/IA/SR).
--
-- Run this in the target database (e.g., SampleTrackerDB or ERP-Live).

SET NOCOUNT ON;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ErpSampleTrackerDocNumberSequences')
BEGIN
    CREATE TABLE dbo.ErpSampleTrackerDocNumberSequences (
        id NVARCHAR(50) PRIMARY KEY,
        prefix NVARCHAR(10) NOT NULL,
        year_month NVARCHAR(6) NOT NULL, -- YYYYMM
        next_value INT NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        CONSTRAINT uq_ErpSampleTrackerDocNumberSequences_prefix_year_month UNIQUE (prefix, year_month)
    );

    CREATE INDEX idx_ErpSampleTrackerDocNumberSequences_prefix_year_month
        ON dbo.ErpSampleTrackerDocNumberSequences(prefix, year_month);
END

PRINT 'Doc number sequence table setup complete.';

