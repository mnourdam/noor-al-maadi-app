                                                                    pg_get_functiondef                                                                    
----------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.admin_export_investigations(p_ids uuid[] DEFAULT NULL::uuid[], p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)+
  RETURNS jsonb                                                                                                                                          +
  LANGUAGE plpgsql                                                                                                                                       +
  SECURITY DEFINER                                                                                                                                       +
  SET search_path TO 'public'                                                                                                                            +
 AS $function$                                                                                                                                           +
 DECLARE                                                                                                                                                 +
   v_total integer;                                                                                                                                      +
   v_rows  jsonb;                                                                                                                                        +
 BEGIN                                                                                                                                                   +
   IF NOT public.is_content_admin() THEN                                                                                                                 +
     RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';                                                                                           +
   END IF;                                                                                                                                               +
                                                                                                                                                         +
   SELECT count(*) INTO v_total                                                                                                                          +
     FROM public.investigations                                                                                                                          +
    WHERE (p_ids IS NULL OR id = ANY(p_ids));                                                                                                            +
                                                                                                                                                         +
   SELECT jsonb_agg(t) INTO v_rows                                                                                                                       +
     FROM (                                                                                                                                              +
       SELECT                                                                                                                                            +
         *,                                                                                                                                              +
         CASE WHEN enabled THEN 'enabled' ELSE 'disabled' END as status                                                                                  +
       FROM public.investigations                                                                                                                        +
       WHERE (p_ids IS NULL OR id = ANY(p_ids))                                                                                                          +
       ORDER BY slug ASC                                                                                                                                 +
       LIMIT p_limit                                                                                                                                     +
       OFFSET p_offset                                                                                                                                   +
     ) t;                                                                                                                                                +
                                                                                                                                                         +
   RETURN jsonb_build_object(                                                                                                                            +
     'total', v_total,                                                                                                                                   +
     'rows',  COALESCE(v_rows, '[]'::jsonb)                                                                                                              +
   );                                                                                                                                                    +
 END;                                                                                                                                                    +
 $function$                                                                                                                                              +
 
(1 row)

