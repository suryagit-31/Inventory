-- Sample Tracker Module - Store-Specific Descriptions Upgrade
-- Microsoft SQL Server
--
-- Adds `description` to dbo.ErpSampleTrackerItemStocks and backfills from the
-- master item description for existing stock rows where description is NULL/blank.
--
-- Run this in the target database after item_stock_upgrade.sql if your stocks table
-- already exists without the description column.

SET NOCOUNT ON;

IF OBJECT_ID('dbo.ErpSampleTrackerItemStocks') IS NULL
BEGIN
    PRINT 'ERROR: dbo.ErpSampleTrackerItemStocks not found. Run backend/item_stock_upgrade.sql first.';
    RETURN;
END

IF COL_LENGTH('dbo.ErpSampleTrackerItemStocks', 'description') IS NULL
BEGIN
    ALTER TABLE dbo.ErpSampleTrackerItemStocks
    ADD description NVARCHAR(500) NULL;
    PRINT 'Added dbo.ErpSampleTrackerItemStocks.description.';
END
ELSE
BEGIN
    PRINT 'Column dbo.ErpSampleTrackerItemStocks.description already exists.';
END

UPDATE s
SET s.description = i.description
FROM dbo.ErpSampleTrackerItemStocks s
JOIN dbo.ErpSampleTrackerItems i ON i.id = s.item_id
WHERE (s.description IS NULL OR LTRIM(RTRIM(s.description)) = '')
  AND (i.description IS NOT NULL AND LTRIM(RTRIM(i.description)) <> '');

PRINT 'Backfill complete.';

