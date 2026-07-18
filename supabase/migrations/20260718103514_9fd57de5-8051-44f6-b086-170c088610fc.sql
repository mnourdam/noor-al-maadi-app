CREATE OR REPLACE FUNCTION public.purchase_heart()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_dinars int;
  v_hearts int;
  v_cost constant int := 20;
  v_max constant int := 5;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;

  SELECT dinars, hearts INTO v_dinars, v_hearts
    FROM public.profiles WHERE id = v_uid FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'failed', 'reason', 'no_profile');
  END IF;

  IF v_hearts >= v_max THEN
    RETURN jsonb_build_object('status', 'hearts_full', 'hearts', v_hearts, 'dinars', v_dinars);
  END IF;

  IF v_dinars < v_cost THEN
    RETURN jsonb_build_object('status', 'insufficient_dinars', 'hearts', v_hearts, 'dinars', v_dinars);
  END IF;

  UPDATE public.profiles
    SET dinars = dinars - v_cost,
        hearts = LEAST(v_max, hearts + 1),
        updated_at = now()
    WHERE id = v_uid
    RETURNING dinars, hearts INTO v_dinars, v_hearts;

  RETURN jsonb_build_object(
    'status', 'purchased',
    'hearts', v_hearts,
    'dinars', v_dinars,
    'cost', v_cost
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.purchase_heart() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purchase_heart() FROM anon;
GRANT EXECUTE ON FUNCTION public.purchase_heart() TO authenticated;