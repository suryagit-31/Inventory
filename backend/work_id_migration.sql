-- Add Work ID columns (non-breaking migration)
-- Run this on the Sample Tracker (APP) database if tables already exist.
-- This adds nullable columns so existing rows remain valid.

IF COL_LENGTH('dbo.ErpSampleTrackerInventoryAddOnLines', 'work_id') IS NULL
BEGIN
    ALTER TABLE dbo.ErpSampleTrackerInventoryAddOnLines
    ADD work_id NVARCHAR(50) NULL;
END
GO

IF COL_LENGTH('dbo.ErpSampleTrackerSampleIssueLines', 'work_id') IS NULL
BEGIN
    ALTER TABLE dbo.ErpSampleTrackerSampleIssueLines
    ADD work_id NVARCHAR(50) NULL;
END
GO

IF COL_LENGTH('dbo.ErpSampleTrackerSampleReturnLines', 'work_id') IS NULL
BEGIN
    ALTER TABLE dbo.ErpSampleTrackerSampleReturnLines
    ADD work_id NVARCHAR(50) NULL;
END
GO

-- Optional: If you are starting fresh (no legacy data), you can make Work ID required:
-- ALTER TABLE dbo.ErpSampleTrackerInventoryAddOnLines ALTER COLUMN work_id NVARCHAR(50) NOT NULL;
-- ALTER TABLE dbo.ErpSampleTrackerSampleIssueLines ALTER COLUMN work_id NVARCHAR(50) NOT NULL;
-- ALTER TABLE dbo.ErpSampleTrackerSampleReturnLines ALTER COLUMN work_id NVARCHAR(50) NOT NULL;

