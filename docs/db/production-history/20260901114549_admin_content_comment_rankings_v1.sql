-- HISTORICAL RECORD — NOT DEPLOYABLE, DO NOT EXECUTE.
-- Production migration version: 20260901114549
-- md5(statement) = 0b7bb14d7d19e7893ad67b514f16ab14  length = 3601
-- Copied verbatim from supabase_migrations.schema_migrations on 2026-09-05.

CREATE OR REPLACE FUNCTION public.admin_content_comment_rankings_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not (
    public.has_role(v_uid, 'owner'::app_role)
    or public.has_role(v_uid, 'admin'::app_role)
    or public.has_role(v_uid, 'editor'::app_role)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  return (
    with merged as (
      select
        c.author_id as user_id,
        case c.anchor_type when 'entity' then 'encyclopedia' else 'story' end as source,
        c.anchor_id::text as anchor_id
      from public.social_comments c
      where c.anchor_type in ('entity','story')

      union all

      select
        r.user_id,
        r.source_type,
        coalesce(r.source_id, r.campaign_id)::text
      from public.user_reflections r
      where r.note is not null and btrim(r.note) <> ''
    ),
    per_user as (
      select
        m.user_id,
        count(*) filter (where m.source = 'campaign') as campaigns,
        -- stories: distinct story anchors, so a comment + reflection on the
        -- same story is a single participation (no double counting)
        count(distinct m.anchor_id) filter (where m.source = 'story') as stories,
        count(*) filter (where m.source = 'encyclopedia') as encyclopedia
      from merged m
      where m.user_id is not null
      group by m.user_id
    ),
    scored as (
      select
        u.*,
        (u.campaigns + u.stories + u.encyclopedia) as total,
        ((u.campaigns > 0)::int + (u.stories > 0)::int + (u.encyclopedia > 0)::int) as kinds,
        least(u.campaigns, u.stories, u.encyclopedia) as balance
      from per_user u
    ),
    enriched as (
      select s.*, p.display_name, p.username, p.avatar_id
      from scored s
      left join public.profiles p on p.id = s.user_id
    ),
    row_json as (
      select e.*, jsonb_build_object(
        'user_id', e.user_id::text,
        'name', e.display_name,
        'username', e.username,
        'avatar_id', e.avatar_id,
        'total', e.total,
        'campaigns', e.campaigns,
        'stories', e.stories,
        'encyclopedia', e.encyclopedia,
        'kinds', e.kinds
      ) as j
      from enriched e
    )
    select jsonb_build_object(
      'ok', true,
      'stats', jsonb_build_object(
        'total', (select coalesce(sum(total),0) from scored),
        'participants', (select count(*) from scored),
        'campaigns', (select coalesce(sum(campaigns),0) from scored),
        'stories_encyclopedia', (select coalesce(sum(stories + encyclopedia),0) from scored)
      ),
      'overall', coalesce((select jsonb_agg(j) from (select j, total from row_json order by total desc, kinds desc limit 10) t), '[]'::jsonb),
      'campaigns', coalesce((select jsonb_agg(j) from (select j from row_json where campaigns > 0 order by campaigns desc, total desc limit 5) t), '[]'::jsonb),
      'stories', coalesce((select jsonb_agg(j) from (select j from row_json where stories > 0 order by stories desc, total desc limit 5) t), '[]'::jsonb),
      'encyclopedia', coalesce((select jsonb_agg(j) from (select j from row_json where encyclopedia > 0 order by encyclopedia desc, total desc limit 5) t), '[]'::jsonb),
      'diverse', coalesce((select jsonb_agg(j) from (select j from row_json where kinds > 1 order by kinds desc, balance desc, total desc limit 5) t), '[]'::jsonb)
    )
  );
end
$function$;

GRANT EXECUTE ON FUNCTION public.admin_content_comment_rankings_v1() TO authenticated;
