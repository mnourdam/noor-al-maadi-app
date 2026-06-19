
CREATE OR REPLACE FUNCTION public.gen_referral_code()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
BEGIN
  LOOP
    code := 'IRTH-';
    FOR i IN 1..6 LOOP
      code := code || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = code);
  END LOOP;
  RETURN code;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.gen_referral_code() FROM PUBLIC, anon;
