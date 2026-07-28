CREATE OR REPLACE FUNCTION public.admin_validate_activity_shape(v_act jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_issues JSONB := '[]'::jsonb;
  v_type TEXT := v_act->>'type';
  v_id TEXT := COALESCE(v_act->>'id','∅');
  v_opts INT := CASE WHEN jsonb_typeof(v_act->'options')='array' THEN jsonb_array_length(v_act->'options') ELSE 0 END;
  v_order INT := CASE WHEN jsonb_typeof(v_act->'correctOrder')='array' THEN jsonb_array_length(v_act->'correctOrder') ELSE 0 END;
  v_pairs INT := CASE WHEN jsonb_typeof(v_act->'pairs')='array' THEN jsonb_array_length(v_act->'pairs') ELSE 0 END;
  v_has_correct BOOLEAN := (v_act ? 'correctAnswer') AND jsonb_typeof(v_act->'correctAnswer') <> 'null';
BEGIN
  IF v_type = 'multiple_choice' OR (v_type = 'reading_then_question' AND v_opts > 0) THEN
    IF v_opts < 2 THEN
      v_issues := v_issues || jsonb_build_object('code','activity.missing_options','message','سؤال اختيار من متعدد بدون خيارات كافية','activity_id',v_id);
    END IF;
    IF NOT v_has_correct THEN
      v_issues := v_issues || jsonb_build_object('code','activity.missing_correct_answer','message','سؤال اختيار من متعدد بدون إجابة صحيحة','activity_id',v_id);
    END IF;
  ELSIF v_type = 'true_false' THEN
    IF NOT v_has_correct THEN
      v_issues := v_issues || jsonb_build_object('code','activity.missing_correct_answer','message','سؤال صح/خطأ بدون إجابة صحيحة','activity_id',v_id);
    END IF;
  ELSIF v_type = 'arrange_events' THEN
    IF v_order < 2 THEN
      v_issues := v_issues || jsonb_build_object('code','activity.missing_correct_order','message','نشاط ترتيب الأحداث بدون ترتيب صحيح','activity_id',v_id);
    END IF;
  ELSIF v_type = 'decision_choice' THEN
    IF v_opts < 2 THEN
      v_issues := v_issues || jsonb_build_object('code','activity.missing_options','message','نشاط القرار بدون خيارات','activity_id',v_id);
    END IF;
  ELSIF v_type = 'match_pairs' THEN
    IF v_pairs < 2 THEN
      v_issues := v_issues || jsonb_build_object('code','activity.missing_pairs','message','نشاط المطابقة بدون أزواج كافية','activity_id',v_id);
    END IF;
  ELSIF v_type = 'fill_blank' THEN
    IF NOT v_has_correct OR COALESCE(TRIM(v_act->>'correctAnswer'),'') = '' THEN
      v_issues := v_issues || jsonb_build_object('code','activity.missing_correct_answer','message','نشاط أكمل الفراغ بدون إجابة صحيحة','activity_id',v_id);
    END IF;
  ELSIF v_type = 'reflection_prompt' THEN
    IF (v_act->>'reflectionMode') = 'choose' AND v_opts < 2 THEN
      v_issues := v_issues || jsonb_build_object('code','activity.missing_options','message','سؤال تأملي بنمط الاختيار بدون خيارات','activity_id',v_id);
    END IF;
  ELSIF v_type = 'reading_then_question' THEN
    IF COALESCE(TRIM(v_act->>'contextText'),'') = '' THEN
      v_issues := v_issues || jsonb_build_object('code','activity.missing_reading_text','message','نشاط قراءة بدون نص قراءة','activity_id',v_id);
    END IF;
  END IF;
  RETURN v_issues;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_validate_activity_shape(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_validate_campaign_payload(v_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_issues JSONB := '[]'::jsonb;
  v_chapters JSONB;
  v_ch JSONB; v_act JSONB;
  v_ids TEXT[];
  v_act_ids TEXT[];
  v_i INT; v_j INT;
  v_id TEXT;
  v_types TEXT[] := ARRAY['reading_then_question','multiple_choice','true_false','arrange_events','decision_choice','match_pairs','fill_blank','reflection_prompt'];
  v_edges JSONB;
  v_visited TEXT[];
  v_stack TEXT[];
  v_cur TEXT; v_next TEXT;
BEGIN
  IF v_data IS NULL OR jsonb_typeof(v_data) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'issues', jsonb_build_array(jsonb_build_object('code','campaign.invalid','message','payload not an object')));
  END IF;
  IF COALESCE(v_data->>'id','') = '' THEN
    v_issues := v_issues || jsonb_build_object('code','campaign.missing_id','message','معرّف الحملة مفقود');
  END IF;
  IF COALESCE(v_data->>'title','') = '' THEN
    v_issues := v_issues || jsonb_build_object('code','campaign.missing_title','message','عنوان الحملة مفقود');
  END IF;
  v_chapters := v_data->'chapters';
  IF v_chapters IS NULL OR jsonb_typeof(v_chapters) <> 'array' OR jsonb_array_length(v_chapters) = 0 THEN
    v_issues := v_issues || jsonb_build_object('code','campaign.no_chapters','message','لا توجد فصول في الحملة');
    RETURN jsonb_build_object('ok', jsonb_array_length(v_issues)=0, 'issues', v_issues);
  END IF;

  v_ids := ARRAY[]::TEXT[];
  v_i := 0;
  FOR v_ch IN SELECT * FROM jsonb_array_elements(v_chapters) LOOP
    v_id := v_ch->>'id';
    IF COALESCE(v_id,'') = '' THEN
      v_issues := v_issues || jsonb_build_object('code','chapter.missing_id','message','فصل بدون معرّف','chapter_index',v_i);
    ELSIF v_id = ANY(v_ids) THEN
      v_issues := v_issues || jsonb_build_object('code','chapter.duplicate_id','message','معرّف فصل مكرر: '||v_id,'chapter_id',v_id);
    ELSE
      v_ids := array_append(v_ids, v_id);
    END IF;
    IF COALESCE(v_ch->>'title','') = '' THEN
      v_issues := v_issues || jsonb_build_object('code','chapter.missing_title','message','فصل بدون عنوان','chapter_id',v_id);
    END IF;
    IF (v_ch->>'unlockRequirement') = v_id AND v_id IS NOT NULL THEN
      v_issues := v_issues || jsonb_build_object('code','chapter.self_unlock','message','فصل يشترط نفسه للفتح','chapter_id',v_id);
    END IF;
    v_act_ids := ARRAY[]::TEXT[];
    v_j := 0;
    IF (v_ch->'activities') IS NOT NULL AND jsonb_typeof(v_ch->'activities')='array' THEN
      FOR v_act IN SELECT * FROM jsonb_array_elements(v_ch->'activities') LOOP
        IF COALESCE(v_act->>'id','') = '' THEN
          v_issues := v_issues || jsonb_build_object('code','activity.missing_id','message','نشاط بدون معرّف','chapter_id',v_id,'activity_index',v_j);
        ELSIF v_act->>'id' = ANY(v_act_ids) THEN
          v_issues := v_issues || jsonb_build_object('code','activity.duplicate_id','message','معرّف نشاط مكرر: '||(v_act->>'id'),'chapter_id',v_id);
        ELSE
          v_act_ids := array_append(v_act_ids, v_act->>'id');
        END IF;
        IF NOT ((v_act->>'type') = ANY(v_types)) THEN
          v_issues := v_issues || jsonb_build_object('code','activity.invalid_type','message','نوع نشاط غير معروف: '||COALESCE(v_act->>'type','∅'),'activity_id',v_act->>'id');
        ELSE
          v_issues := v_issues || public.admin_validate_activity_shape(v_act);
        END IF;
        IF COALESCE(v_act->>'prompt','') = '' AND (v_act->>'type') <> 'reflection_prompt' THEN
          v_issues := v_issues || jsonb_build_object('code','activity.missing_prompt','message','نشاط بدون سؤال','activity_id',v_act->>'id');
        END IF;
        IF (v_act ? 'xpReward') AND (v_act->>'xpReward')::NUMERIC < 0 THEN
          v_issues := v_issues || jsonb_build_object('code','activity.negative_reward','message','مكافأة سالبة','activity_id',v_act->>'id');
        END IF;
        v_j := v_j + 1;
      END LOOP;
    END IF;
    v_i := v_i + 1;
  END LOOP;

  v_edges := '[]'::jsonb;
  FOR v_ch IN SELECT * FROM jsonb_array_elements(v_chapters) LOOP
    v_next := v_ch->>'unlockRequirement';
    IF v_next IS NOT NULL AND v_next <> '' AND NOT (v_next = ANY(v_ids)) THEN
      v_issues := v_issues || jsonb_build_object('code','chapter.missing_prerequisite','message','فصل مرجعه غير موجود: '||v_next,'chapter_id',v_ch->>'id');
    END IF;
    IF v_next IS NOT NULL AND v_next <> '' AND v_next <> (v_ch->>'id') THEN
      v_edges := v_edges || jsonb_build_object('from', v_ch->>'id', 'to', v_next);
    END IF;
  END LOOP;
  FOREACH v_cur IN ARRAY v_ids LOOP
    v_stack := ARRAY[v_cur];
    v_visited := ARRAY[]::TEXT[];
    WHILE array_length(v_stack,1) > 0 LOOP
      v_next := v_stack[array_length(v_stack,1)];
      v_stack := v_stack[1:array_length(v_stack,1)-1];
      IF v_next = ANY(v_visited) THEN CONTINUE; END IF;
      v_visited := array_append(v_visited, v_next);
      FOR v_ch IN SELECT value FROM jsonb_array_elements(v_edges) WHERE (value->>'from') = v_next LOOP
        IF (v_ch->>'to') = v_cur THEN
          v_issues := v_issues || jsonb_build_object('code','chapter.unlock_cycle','message','حلقة مغلقة في شرط الفتح تشمل: '||v_cur);
          EXIT;
        END IF;
        v_stack := array_append(v_stack, v_ch->>'to');
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', jsonb_array_length(v_issues)=0, 'issues', v_issues);
END;
$function$;