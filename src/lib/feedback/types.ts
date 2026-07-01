import { Bug, BookOpen, Lightbulb, Landmark, Heart, HelpCircle, type LucideIcon } from "lucide-react";

export type FeedbackCategory =
  | "bug"
  | "history_correction"
  | "improvement"
  | "content_suggestion"
  | "general"
  | "question";

export type FeedbackStatus = "new" | "review" | "planned" | "fixed" | "closed";

export interface FeedbackContext {
  route?: string;
  title?: string;
  slug?: string;
  entity_id?: string;
  encyclopedia_entity_id?: string;
  campaign_id?: string;
  atlas_entity_id?: string;
  investigation_id?: string;
  museum_item_id?: string;
  app_version?: string;
  platform?: string;
  locale?: string;
  [k: string]: unknown;
}

export interface FeedbackIssue {
  id: string;
  reporter_id: string | null;
  device_id: string | null;
  category: FeedbackCategory;
  title: string;
  description: string;
  status: FeedbackStatus;
  context: FeedbackContext;
  assigned_to: string | null;
  last_reply_at: string | null;
  last_reply_by: "player" | "admin" | null;
  player_unread: boolean;
  admin_unread: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeedbackMessage {
  id: string;
  issue_id: string;
  author_id: string | null;
  author_role: "player" | "admin";
  body: string;
  is_internal: boolean;
  attachments: unknown[];
  created_at: string;
}

export interface CategoryDef {
  key: FeedbackCategory;
  label: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
  accentBg: string;
}

export const FEEDBACK_CATEGORIES: CategoryDef[] = [
  { key: "bug",                 label: "الإبلاغ عن مشكلة",       hint: "عطل أو سلوك غير متوقع", icon: Bug,        accent: "text-rose-200",    accentBg: "bg-rose-500/15" },
  { key: "history_correction",  label: "تصحيح معلومة تاريخية",   hint: "تصويب معلومة داخل المحتوى", icon: BookOpen,   accent: "text-amber-200",   accentBg: "bg-amber-500/15" },
  { key: "improvement",         label: "اقتراح تطوير",           hint: "فكرة لتحسين تجربة إرث", icon: Lightbulb,  accent: "text-sky-200",     accentBg: "bg-sky-500/15" },
  { key: "content_suggestion",  label: "اقتراح حملة أو محتوى جديد", hint: "شخصية، مدينة، معركة، حملة", icon: Landmark,   accent: "text-emerald-200", accentBg: "bg-emerald-500/15" },
  { key: "general",             label: "ملاحظات عامة",           hint: "انطباع أو تعليق مفتوح", icon: Heart,      accent: "text-pink-200",    accentBg: "bg-pink-500/15" },
  { key: "question",            label: "سؤال أو استفسار",         hint: "استفسار حول ميزة أو محتوى", icon: HelpCircle, accent: "text-violet-200",  accentBg: "bg-violet-500/15" },
];

export const CATEGORY_MAP: Record<FeedbackCategory, CategoryDef> =
  Object.fromEntries(FEEDBACK_CATEGORIES.map((c) => [c.key, c])) as Record<FeedbackCategory, CategoryDef>;

export const STATUS_LABELS: Record<FeedbackStatus, { label: string; dot: string; chip: string }> = {
  new:     { label: "جديد",         dot: "bg-emerald-400", chip: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30" },
  review:  { label: "قيد المراجعة", dot: "bg-amber-400",   chip: "bg-amber-500/15 text-amber-200 border-amber-500/30" },
  planned: { label: "مخطط له",     dot: "bg-sky-400",     chip: "bg-sky-500/15 text-sky-200 border-sky-500/30" },
  fixed:   { label: "تم التنفيذ",   dot: "bg-violet-400",  chip: "bg-violet-500/15 text-violet-200 border-violet-500/30" },
  closed:  { label: "مغلق",        dot: "bg-slate-400",   chip: "bg-slate-500/15 text-slate-200 border-slate-500/30" },
};
