-- Sample Tracker Module - Per-Location Stock Upgrade (Option 1)
-- Microsoft SQL Server
--
-- Creates dbo.ErpSampleTrackerItemStocks and migrates existing quantities from
-- dbo.ErpSampleTrackerItems into a per-location stock row using the current `location`.
--
-- Notes:
-- - If an item has NULL/blank location, it will be migrated to location = 'Unspecified'.
-- - After migration, the application will use ItemStocks for availability/updates.

SET NOCOUNT ON;

IF OBJECT_ID('dbo.ErpSampleTrackerItems') IS NULL
BEGIN
    PRINT 'ERROR: dbo.ErpSampleTrackerItems not found.';
    RETURN;
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ErpSampleTrackerItemStocks')
BEGIN
    CREATE TABLE dbo.ErpSampleTrackerItemStocks (
        id NVARCHAR(50) PRIMARY KEY,
        item_id NVARCHAR(50) NOT NULL,
        location NVARCHAR(100) NOT NULL,
        description NVARCHAR(500),
        qty_on_hand FLOAT DEFAULT 0.0,
        qty_issued FLOAT DEFAULT 0.0,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        CONSTRAINT fk_ErpSampleTrackerItemStocks_item_id FOREIGN KEY (item_id)
            REFERENCES dbo.ErpSampleTrackerItems(id) ON DELETE CASCADE,
        CONSTRAINT uq_ErpSampleTrackerItemStocks_item_location UNIQUE (item_id, location)
    );
    CREATE INDEX idx_ErpSampleTrackerItemStocks_item_id ON dbo.ErpSampleTrackerItemStocks(item_id);
    CREATE INDEX idx_ErpSampleTrackerItemStocks_location ON dbo.ErpSampleTrackerItemStocks(location);
    PRINT 'Created table dbo.ErpSampleTrackerItemStocks.';
END
ELSE
BEGIN
    PRINT 'Table dbo.ErpSampleTrackerItemStocks already exists.';
END

-- Migrate existing Item quantities into ItemStocks only when no stock row exists yet.
INSERT INTO dbo.ErpSampleTrackerItemStocks (id, item_id, location, description, qty_on_hand, qty_issued, created_at, updated_at)
SELECT
    CONVERT(NVARCHAR(50), NEWID()) AS id,
    i.id AS item_id,
    COALESCE(NULLIF(LTRIM(RTRIM(i.location)), ''), 'Unspecified') AS location,
    i.description AS description,
    COALESCE(i.qty_on_hand, 0.0) AS qty_on_hand,
    COALESCE(i.qty_issued, 0.0) AS qty_issued,
    GETDATE() AS created_at,
    GETDATE() AS updated_at
FROM dbo.ErpSampleTrackerItems i
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.ErpSampleTrackerItemStocks s
    WHERE s.item_id = i.id
      AND s.location = COALESCE(NULLIF(LTRIM(RTRIM(i.location)), ''), 'Unspecified')
);

PRINT 'Migration complete.';
