-- Replace stable_delta_uuid to avoid the uuid-ossp extension dependency.
-- Synthesizes a deterministic UUID (variant/version bits set) from an MD5
-- of the caller-supplied key with a project-specific salt. Same input →
-- same UUID, forever.
CREATE OR REPLACE FUNCTION public.stable_delta_uuid(p_key text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT (
    substr(h, 1, 8)  || '-' ||
    substr(h, 9, 4)  || '-5' ||
    substr(h, 13, 3) || '-' ||
    -- Force RFC 4122 variant bits (10xx) in the first nibble of clock_seq.
    (case
       when substr(h,17,1) in ('0','1','2','3','4','5','6','7') then '8'
       when substr(h,17,1) in ('8','9','a','b') then substr(h,17,1)
       else 'a'
     end) || substr(h, 18, 3) || '-' ||
    substr(h, 21, 12)
  )::uuid
  FROM (SELECT md5('irth.stories.v1:' || p_key) AS h) s
$$;
