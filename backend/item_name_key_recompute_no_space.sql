-- Sample Tracker Module - Recompute item_name_key (remove ALL whitespace)
-- Microsoft SQL Server
--
-- New strict normalization:
--   item_name_key = UPPER(REPLACE(REPLACE(LTRIM(RTRIM(item_name)), CHAR(9), ''), ' ', ''))
--
-- This makes:
--   iphone14 == iphone 14 == iphone   14
--
-- Safe workflow:
-- 1) Run the collision report below.
-- 2) If collisions exist, merge/resolve them first (combine quantities, keep one row).
-- 3) Re-run this script; it will update keys only if there are no collisions.

SET NOCOUNT ON;

IF COL_LENGTH('dbo.ErpSampleTrackerItems', 'item_name_key') IS NULL
BEGIN
    PRINT 'ERROR: Column dbo.ErpSampleTrackerItems.item_name_key does not exist. Run backend/item_name_key_upgrade.sql first.';
    RETURN;
END

PRINT 'Collision report for STRICT no-whitespace key:';
WITH computed AS (
    SELECT
        id,
        item_name,
        UPPER(REPLACE(REPLACE(LTRIM(RTRIM(item_name)), CHAR(9), ''), ' ', '')) AS computed_key
    FROM dbo.ErpSampleTrackerItems
)
SELECT computed_key AS item_name_key, COUNT(*) AS cnt
FROM computed
GROUP BY computed_key
HAVING COUNT(*) > 1
ORDER BY cnt DESC, computed_key ASC;

IF EXISTS (
    WITH computed AS (
        SELECT UPPER(REPLACE(REPLACE(LTRIM(RTRIM(item_name)), CHAR(9), ''), ' ', '')) AS computed_key
        FROM dbo.ErpSampleTrackerItems
    )
    SELECT 1
    FROM computed
    GROUP BY computed_key
    HAVING COUNT(*) > 1
)
BEGIN
    PRINT 'Collisions found. Resolve collisions first, then re-run to recompute item_name_key.';
    RETURN;
END

PRINT 'No collisions found. Updating item_name_key...';

UPDATE dbo.ErpSampleTrackerItems
SET item_name_key = UPPER(REPLACE(REPLACE(LTRIM(RTRIM(item_name)), CHAR(9), ''), ' ', ''));

PRINT 'item_name_key recompute complete.';

