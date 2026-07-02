
-- Generic CMS-managed taxonomy for eras, worlds, states, entity types, etc.
CREATE TABLE IF NOT EXISTS public.admin_taxonomy (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL,
  key          text NOT NULL,
  label_ar     text NOT NULL,
  label_en     text,
  description  text,
  sort_order   integer NOT NULL DEFAULT 0,
  enabled      boolean NOT NULL DEFAULT true,
  archived     boolean NOT NULL DEFAULT false,
  color        text,
  icon         text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid,
  updated_by   uuid,
  UNIQUE (type, key)
);

GRANT SELECT ON public.admin_taxonomy TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.admin_taxonomy TO authenticated;
GRANT ALL ON public.admin_taxonomy TO service_role;

ALTER TABLE public.admin_taxonomy ENABLE ROW LEVEL SECURITY;

-- Anyone can read enabled, non-archived rows (taxonomy powers public UI).
CREATE POLICY "taxonomy_public_read_enabled"
  ON public.admin_taxonomy FOR SELECT
  USING (enabled = true AND archived = false);

-- Editors/admins can read everything (including archived/disabled).
CREATE POLICY "taxonomy_editor_read_all"
  ON public.admin_taxonomy FOR SELECT
  TO authenticated
  USING (public.is_content_editor());

-- Editors can write.
CREATE POLICY "taxonomy_editor_insert"
  ON public.admin_taxonomy FOR INSERT
  TO authenticated
  WITH CHECK (public.is_content_editor());

CREATE POLICY "taxonomy_editor_update"
  ON public.admin_taxonomy FOR UPDATE
  TO authenticated
  USING (public.is_content_editor())
  WITH CHECK (public.is_content_editor());

-- Only admins/managers can hard-delete (prefer archive).
CREATE POLICY "taxonomy_admin_delete"
  ON public.admin_taxonomy FOR DELETE
  TO authenticated
  USING (public.is_content_admin());

CREATE INDEX IF NOT EXISTS admin_taxonomy_type_sort_idx
  ON public.admin_taxonomy (type, sort_order, key);

CREATE TRIGGER admin_taxonomy_touch
  BEFORE UPDATE ON public.admin_taxonomy
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed initial taxonomy (idempotent).
INSERT INTO public.admin_taxonomy (type, key, label_ar, label_en, sort_order, metadata) VALUES
  -- Eras (chronological order matches CANONICAL_ERA_ORDER)
  ('era','prophetic','العهد النبوي','Prophetic Era',10,'{"years":"570 – 632 م"}'),
  ('era','seerah','السيرة النبوية','Seerah',15,'{"years":"570 – 632 م","alias_of":"prophetic"}'),
  ('era','rashidun','الخلافة الراشدة','Rashidun Caliphate',20,'{"years":"632 – 661 م"}'),
  ('era','umayyad','الدولة الأموية','Umayyad Caliphate',30,'{"years":"661 – 750 م"}'),
  ('era','andalus','الأندلس','Al-Andalus',40,'{"years":"711 – 1492 م"}'),
  ('era','taifa','عصر ملوك الطوائف','Taifa Kingdoms',45,'{"years":"1031 – 1091 م"}'),
  ('era','abbasid','الدولة العباسية','Abbasid Caliphate',50,'{"years":"750 – 1258 م"}'),
  ('era','buyid','العصر البويهي','Buyid Era',55,'{"years":"934 – 1062 م"}'),
  ('era','fatimid','الدولة الفاطمية','Fatimid Caliphate',58,'{"years":"909 – 1171 م"}'),
  ('era','seljuk','السلاجقة','Seljuk Empire',60,'{"years":"1037 – 1194 م"}'),
  ('era','byzantine','العصر البيزنطي','Byzantine Era',63,'{"years":"330 – 1453 م"}'),
  ('era','crusades','عصر الحروب الصليبية','Crusades',65,'{"years":"1096 – 1291 م"}'),
  ('era','zengid','العصر الزنكي','Zengid Era',67,'{"years":"1127 – 1250 م"}'),
  ('era','ayyubid','الأيوبيون','Ayyubid Dynasty',70,'{"years":"1171 – 1260 م"}'),
  ('era','mongols','الغزو المغولي','Mongol Invasion',75,'{"years":"1219 – 1335 م"}'),
  ('era','mamluk','المماليك','Mamluk Sultanate',80,'{"years":"1250 – 1517 م"}'),
  ('era','timurid','العصر التيموري','Timurid Era',85,'{"years":"1370 – 1507 م"}'),
  ('era','ottoman','الدولة العثمانية','Ottoman Empire',90,'{"years":"1299 – 1924 م"}'),
  ('era','modern','التاريخ العربي الحديث','Modern Era',100,'{"years":"1798 – اليوم"}'),

  -- Worlds (player-facing hubs)
  ('world','prophetic','العهد النبوي','Prophetic',10,'{"glyph":"🌙"}'),
  ('world','rashidun','الخلافة الراشدة','Rashidun',20,'{"glyph":"🕋"}'),
  ('world','umayyad','الدولة الأموية','Umayyad',30,'{"glyph":"🏛️"}'),
  ('world','andalus','الأندلس','Andalus',40,'{"glyph":"🕌"}'),
  ('world','abbasid','الدولة العباسية','Abbasid',50,'{"glyph":"📚"}'),
  ('world','seljuk','السلاجقة','Seljuk',60,'{"glyph":"🏹"}'),
  ('world','zengid','الدولة الزنكية','Zengid',70,'{"glyph":"🛡️"}'),
  ('world','ayyubid-state','الدولة الأيوبية','Ayyubid State',80,'{"glyph":"⚔️"}'),
  ('world','mamluk-sultanate','دولة المماليك','Mamluk Sultanate',90,'{"glyph":"🗡️"}'),
  ('world','ottoman','الدولة العثمانية','Ottoman',100,'{"glyph":"🌘"}'),

  -- Canonical state slugs (aliases live in metadata.aliases[])
  ('state','umayyad','الدولة الأموية','Umayyad State',10,'{"aliases":["umayyads","umayyad-caliphate","umayyad-state"]}'),
  ('state','abbasid','الدولة العباسية','Abbasid State',20,'{"aliases":["abbasids","abbasid-caliphate","abbasid-state"]}'),
  ('state','andalus','الأندلس','Andalus State',30,'{"aliases":["al-andalus","andalus-state"]}'),
  ('state','rashidun','الخلافة الراشدة','Rashidun State',40,'{"aliases":["rashidun-caliphate"]}'),
  ('state','seljuk','السلاجقة','Seljuk State',50,'{"aliases":["seljuks","seljuk-empire","seljuk-state"]}'),
  ('state','zengid','الدولة الزنكية','Zengid State',60,'{"aliases":["zengids"]}'),
  ('state','ayyubid','الدولة الأيوبية','Ayyubid State',70,'{"aliases":["ayyubid-state","ayyubid-sultanate"]}'),
  ('state','mamluk','دولة المماليك','Mamluk State',80,'{"aliases":["mamluks","mamluk-sultanate"]}'),
  ('state','ottoman','الدولة العثمانية','Ottoman State',90,'{"aliases":["ottomans","ottoman-empire","ottoman-state"]}'),
  ('state','fatimid','الدولة الفاطمية','Fatimid State',100,'{"aliases":["fatimids","fatimid-caliphate"]}'),
  ('state','prophetic','العهد النبوي','Prophetic State',110,'{}'),

  -- Entity types (mirrors SUPABASE_ENABLED_TYPES)
  ('entity_type','figure','شخصية','Figure',10,'{}'),
  ('entity_type','city','مدينة','City',20,'{}'),
  ('entity_type','battle','معركة','Battle',30,'{}'),
  ('entity_type','state','دولة','State',40,'{}'),
  ('entity_type','landmark','معلم','Landmark',50,'{}'),
  ('entity_type','artifact','أثر','Artifact',60,'{}'),
  ('entity_type','event','حدث','Event',70,'{}'),
  ('entity_type','scholar','عالم','Scholar',80,'{}')
ON CONFLICT (type, key) DO NOTHING;
