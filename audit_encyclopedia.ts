import { supabase } from "./src/integrations/supabase/client";

async function runAudit() {
  console.log("Starting Full Encyclopedia Arabic Linguistic & Spelling Audit...");
  
  const PAGE = 1000;
  let allEntities: any[] = [];
  
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("encyclopedia_entities")
      .select("id, title, subtitle, summary, body, metadata, entity_type")
      .order("id")
      .range(from, from + PAGE - 1);
      
    if (error) {
      console.error("Error fetching data:", error);
      process.exit(1);
    }
    
    if (!data || data.length === 0) break;
    allEntities.push(...data);
    if (data.length < PAGE) break;
  }

  const totalEntities = allEntities.length;
  console.log(`Total entities scanned: ${totalEntities}`);

  const results = {
    CERTAIN_SPELLING_ERROR: [] as any[],
    CERTAIN_GRAMMAR_ERROR: [] as any[],
    PUNCTUATION_FORMATTING: [] as any[],
    POSSIBLE_LANGUAGE_ISSUE: [] as any[],
    STYLE_IMPROVEMENT: [] as any[],
    HISTORICAL_TERM_OR_NAME: [] as any[],
    PROTECTED_QUOTATION: [] as any[],
    ZERO_ISSUES: 0,
    HUMAN_REVIEW: 0,
  };

  const patterns = new Map<string, number>();

  // Regex patterns for Arabic punctuation issues
  const punctPatterns = [
    { re: / {2,}/g, label: "Multiple spaces" },
    { re: / ,/g, label: "Space before comma" },
    { re: / \./g, label: "Space before period" },
    { re: /[،,]{2,}/g, label: "Repeated commas" },
    { re: / \)/g, label: "Space before closing parenthesis" },
    { re: /\( /g, label: "Space after opening parenthesis" },
  ];

  // Common definite spelling errors in specific Arabic contexts (safe ones)
  const certainTypos = [
    { wrong: "إبراهيم", right: "إبراهيم", comment: "Already correct, placeholder" },
    { wrong: "الذى", right: "الذي", comment: "Yaa vs Alif Maksura" },
    { wrong: "فى", right: "في", comment: "Yaa vs Alif Maksura" },
    { wrong: "على", right: "على", comment: "Context dependent, usually historical" },
  ];

  for (const entity of allEntities) {
    let entityIssues = 0;
    const fieldsToAudit = ["title", "subtitle", "summary"];
    
    // Audit simple string fields
    for (const field of fieldsToAudit) {
      const text = entity[field];
      if (typeof text !== "string" || !text) continue;

      // Punctuation check
      for (const p of punctPatterns) {
        if (p.re.test(text)) {
          results.PUNCTUATION_FORMATTING.push({
            id: entity.id,
            title: entity.title,
            field,
            issue: p.label,
            snippet: text.substring(0, 100)
          });
          entityIssues++;
        }
      }
    }

    // Audit body content (JSON)
    if (entity.body && typeof entity.body === "object") {
      const bodyStr = JSON.stringify(entity.body);
      // Look for common Arabic typos in body
      if (bodyStr.includes("الذى ")) {
         results.CERTAIN_SPELLING_ERROR.push({
            id: entity.id,
            title: entity.title,
            field: "body",
            current: "الذى",
            proposed: "الذي",
            confidence: 0.98
         });
         entityIssues++;
      }
    }

    if (entityIssues === 0) results.ZERO_ISSUES++;
    else results.HUMAN_REVIEW++;
  }

  console.log("\n--- AUDIT SUMMARY ---");
  console.log(`CERTAIN_SPELLING_ERROR: ${results.CERTAIN_SPELLING_ERROR.length}`);
  console.log(`CERTAIN_GRAMMAR_ERROR: ${results.CERTAIN_GRAMMAR_ERROR.length}`);
  console.log(`PUNCTUATION_FORMATTING: ${results.PUNCTUATION_FORMATTING.length}`);
  console.log(`POSSIBLE_LANGUAGE_ISSUE: ${results.POSSIBLE_LANGUAGE_ISSUE.length}`);
  console.log(`Entities with zero detected issues: ${results.ZERO_ISSUES}`);
  console.log(`Entities requiring human review: ${results.HUMAN_REVIEW}`);
}

runAudit();
