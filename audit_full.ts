import { supabase } from "./src/integrations/supabase/client";

async function runAudit() {
  const PAGE = 1000;
  let allEntities: any[] = [];
  
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("encyclopedia_entities")
      .select("id, title, subtitle, summary, body, metadata, entity_type")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    allEntities.push(...data);
    if (data.length < PAGE) break;
  }

  const results = {
    CERTAIN_SPELLING: [] as any[],
    GRAMMAR: [] as any[],
    PUNCTUATION: [] as any[],
    POSSIBLE: [] as any[],
    HISTORICAL: 0,
    QUOTATION: 0,
    TOTAL_FIELDS: 0,
    ZERO_ISSUES: 0
  };

  const commonPatterns = new Map<string, number>();

  // Helper to extract all visible text from body JSON
  function extractText(obj: any): string[] {
    if (typeof obj === 'string') return [obj];
    if (Array.isArray(obj)) return obj.flatMap(extractText);
    if (obj && typeof obj === 'object') {
      return Object.entries(obj).flatMap(([k, v]) => {
        if (['id', 'slug', 'image_url', 'type', 'metadata', 'created_at', 'updated_at'].includes(k)) return [];
        return extractText(v);
      });
    }
    return [];
  }

  for (const e of allEntities) {
    let eIssues = 0;
    const texts = [e.title, e.subtitle, e.summary, ...extractText(e.body)].filter(t => typeof t === 'string' && t.length > 0);
    results.TOTAL_FIELDS += texts.length;

    for (const t of texts) {
      // 1. Punctuation checks
      if (/ {2,}/.test(t)) { 
        results.PUNCTUATION.push({ id: e.id, title: e.title, issue: "Multiple spaces", snippet: t.match(/.{0,20} {2,}.{0,20}/)?.[0] });
        eIssues++;
      }
      if (/[،,]\S/.test(t)) {
        results.PUNCTUATION.push({ id: e.id, title: e.title, issue: "No space after comma", snippet: t.match(/.{0,20}[،,]\S.{0,20}/)?.[0] });
        eIssues++;
      }
      if (/\s[،,.]/.test(t)) {
        results.PUNCTUATION.push({ id: e.id, title: e.title, issue: "Space before punctuation", snippet: t.match(/.{0,20}\s[،,.].{0,20}/)?.[0] });
        eIssues++;
      }

      // 2. Spelling patterns (Strict)
      // "الذى" -> "الذي" (if at end of word or before space, and not historical)
      if (/الذى(\s|$)/.test(t)) {
        results.CERTAIN_SPELLING.push({ id: e.id, title: e.title, current: "الذى", proposed: "الذي", confidence: 0.96 });
        eIssues++;
      }
      if (/فى(\s|$)/.test(t)) {
        results.CERTAIN_SPELLING.push({ id: e.id, title: e.title, current: "فى", proposed: "في", confidence: 0.96 });
        eIssues++;
      }
      
      // 3. Historical/Religious detection
      if (t.includes("ﷺ") || t.includes("رضي الله عنه") || t.includes("عز وجل")) {
        results.QUOTATION++;
      }
    }
    if (eIssues === 0) results.ZERO_ISSUES++;
  }

  console.log(JSON.stringify({
    scanned: allEntities.length,
    fields: results.TOTAL_FIELDS,
    spelling: results.CERTAIN_SPELLING.length,
    punctuation: results.PUNCTUATION.length,
    zero: results.ZERO_ISSUES,
    quotations: results.QUOTATION,
    samples: {
        spelling: results.CERTAIN_SPELLING.slice(0, 5),
        punctuation: results.PUNCTUATION.slice(0, 5)
    }
  }, null, 2));
}

runAudit();
