-- Re-enable and unarchive 10 entities that are still referenced by published campaign unlocks
-- but were collaterally archived by the previous integrity sweep.
WITH raw AS (
  SELECT DISTINCT u#>>'{}' AS v
  FROM admin_campaigns ac, jsonb_path_query(ac.data, 'strict $.**.unlocks[*]') u
), refs AS (
  SELECT split_part(v, ':', 1) AS type, split_part(v, ':', 2) AS slug FROM raw WHERE v LIKE '%:%'
), targets AS (
  SELECT e.id
  FROM refs r
  JOIN encyclopedia_entities e ON e.slug=r.slug AND e.entity_type=r.type
  WHERE e.enabled=false
)
UPDATE encyclopedia_entities e
SET enabled = true,
    metadata = (e.metadata - 'archived' - 'archived_at' - 'archived_reason'),
    updated_at = now()
FROM targets t
WHERE e.id = t.id;