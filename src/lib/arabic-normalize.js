// Shared Arabic name normalization used by:
//   • encyclopedia duplicate detection (admin.canonical-duplicates)
//   • encyclopedia admin save-flow (admin.encyclopedia) to warn before
//     creating duplicates of existing canonical entities
//   • future import pipelines that need to reuse canonical entities
//
// Conservative by design — never destructively rewrites the display title,
// only produces a normalized "match key".
const AR_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
// Common Islamic honorifics + abbreviations that follow person names.
// We strip these only for matching, never from the displayed name.
const HONORIFICS = [
    /\bرضي\s*الله\s*عنه(?:م|ا|ما)?\b/g,
    /\bرحمه\s*الله(?:\s*تعالى)?\b/g,
    /\bرحمها\s*الله(?:\s*تعالى)?\b/g,
    /\bعليه\s*السلام\b/g,
    /\bعليها\s*السلام\b/g,
    /\bعليهم(?:ا)?\s*السلام\b/g,
    /\bصلى\s*الله\s*عليه\s*و?سلم\b/g,
    /\bحفظه\s*الله\b/g,
    /\bسبحانه\s*و?تعالى\b/g,
    // common abbreviations
    /\(ر\.?ض\)?\.?/g,
    /\(رضي?\)?/g,
    /\(ص\)\.?/g,
    /\(صلى الله عليه وسلم\)/g,
    /\(ع\)\.?/g,
];
const BATTLE_PREFIXES = ["معركة ", "غزوة ", "موقعة ", "وقعة "];
/** Strip honorifics from a display string while preserving the rest. */
export function stripHonorifics(input) {
    let s = input || "";
    for (const re of HONORIFICS)
        s = s.replace(re, " ");
    return s.replace(/\s+/g, " ").trim();
}
/**
 * Normalized match key for an Arabic name/title.
 * Strips diacritics, tatweel, honorifics, common battle prefixes,
 * folds alef/ya/ta-marbuta variants, lowercases ASCII, collapses spaces.
 */
export function normalizeArabicName(input) {
    let s = stripHonorifics(input || "").replace(AR_DIACRITICS, "");
    s = s
        .replace(/[إأآا\u0671]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه")
        .replace(/ؤ/g, "و")
        .replace(/ئ/g, "ي")
        .replace(/\u0621/g, ""); // hamza
    s = s.toLowerCase();
    s = s.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    for (const p of BATTLE_PREFIXES)
        if (s.startsWith(p))
            s = s.slice(p.length);
    if (s.startsWith("ال") && s.length > 4)
        s = s.slice(2);
    return s;
}
/** Normalized slug match key. */
export function normalizeSlugKey(s) {
    return (s || "")
        .toLowerCase()
        .replace(/^(battle-of-|battle-|the-)/, "")
        .replace(/[^a-z0-9]+/g, "");
}
/** Collect every searchable string from an entity (title + aliases + metadata.also_known_as). */
export function entityNameKeys(args) {
    const out = new Set();
    if (args.title)
        out.add(normalizeArabicName(args.title));
    if (args.subtitle)
        out.add(normalizeArabicName(args.subtitle));
    const m = args.metadata ?? {};
    const aliasArrays = [m.aliases, m.also_known_as, m.alt_names, m.names];
    for (const arr of aliasArrays) {
        if (Array.isArray(arr))
            for (const a of arr)
                if (typeof a === "string")
                    out.add(normalizeArabicName(a));
    }
    out.delete("");
    return Array.from(out);
}
