# Stories Content Contract v2 — Notes

## Correction: `scene_index` sequentiality

An earlier audit statement was imprecise. The corrected wording is:

> `UNIQUE(story_id, scene_index)` guarantees uniqueness, but it does **not**
> by itself guarantee a sequential 0-based series.
>
> The 0-based sequential contract is enforced through:
>
> - Importer validation (`admin_import_stories_v2_apply` / `_preview`)
> - Admin scene ordering (`admin_reorder_story_scenes`)
> - Publish validation (`admin_validate_story_publish`)
> - Contract tests (`tests/stories/*`)
>
> The database uniqueness constraint is unchanged.
