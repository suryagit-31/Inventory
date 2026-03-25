-- Sample Tracker Module - Item Name Key Upgrade (dedupe Samsung s24 == samsung S24)
-- Microsoft SQL Server
--
-- This script adds a canonical, case+space-insensitive key column to items:
--   dbo.ErpSampleTrackerItems.item_name_key
-- and provides a collision report you must resolve before enforcing NOT NULL + UNIQUE.
--
-- Normalization rule (must match backend/frontend):
-- - Trim
-- - Replace tabs with spaces
-- - Collapse repeated spaces
-- - Uppercase
--
-- Run this in the target database that holds the Sample Tracker tables.

SET NOCOUNT ON;

-- 1) Add the column as NULL (non-breaking)
IF COL_LENGTH('dbo.ErpSampleTrackerItems', 'item_name_key') IS NULL
BEGIN
    ALTER TABLE dbo.ErpSampleTrackerItems
    ADD item_name_key NVARCHAR(100) NULL;
    PRINT 'Added column dbo.ErpSampleTrackerItems.item_name_key (NULL).';
END
ELSE
BEGIN
    PRINT 'Column dbo.ErpSampleTrackerItems.item_name_key already exists.';
END

-- 2) Backfill key (repeat double-space collapse a few times)
UPDATE dbo.ErpSampleTrackerItems
SET item_name_key =
    UPPER(
        LTRIM(RTRIM(
            REPLACE(
                REPLACE(
                    REPLACE(
                        REPLACE(item_name, CHAR(9), ' '),
                    '  ', ' '),
                '  ', ' '),
            '  ', ' ')
        ))
    )
WHERE item_name_key IS NULL;

PRINT 'Backfilled item_name_key for rows where it was NULL.';

-- 3) Collision report (resolve these BEFORE enforcing UNIQUE)
PRINT 'Checking for item_name_key collisions...';
SELECT
    item_name_key,
    COUNT(*) AS cnt
FROM dbo.ErpSampleTrackerItems
GROUP BY item_name_key
HAVING COUNT(*) > 1
ORDER BY cnt DESC, item_name_key ASC;

-- 4) Enforce NOT NULL + UNIQUE only when there are no collisions
IF NOT EXISTS (
    SELECT 1
    FROM (
        SELECT item_name_key, COUNT(*) AS cnt
        FROM dbo.ErpSampleTrackerItems
        GROUP BY item_name_key
        HAVING COUNT(*) > 1
    ) c
)
BEGIN
    -- Set any remaining NULL keys (shouldn't happen) to normalized item_name
    UPDATE dbo.ErpSampleTrackerItems
    SET item_name_key =
        UPPER(
            LTRIM(RTRIM(
                REPLACE(
                    REPLACE(
                        REPLACE(
                            REPLACE(item_name, CHAR(9), ' '),
                        '  ', ' '),
                    '  ', ' '),
                '  ', ' ')
            ))
        )
    WHERE item_name_key IS NULL;

    ALTER TABLE dbo.ErpSampleTrackerItems
    ALTER COLUMN item_name_key NVARCHAR(100) NOT NULL;
    PRINT 'Altered item_name_key to NOT NULL.';

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_ErpSampleTrackerItems_item_name_key')
    BEGIN
        CREATE UNIQUE INDEX ux_ErpSampleTrackerItems_item_name_key
            ON dbo.ErpSampleTrackerItems(item_name_key);
        PRINT 'Created unique index ux_ErpSampleTrackerItems_item_name_key.';
    END
    ELSE
    BEGIN
        PRINT 'Unique index ux_ErpSampleTrackerItems_item_name_key already exists.';
    END
END
ELSE
BEGIN
    PRINT 'Collisions found. Resolve collisions first, then re-run this script to enforce NOT NULL + UNIQUE.';
END

