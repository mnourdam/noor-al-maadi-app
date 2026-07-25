// ============================================================
// بطاقة الهوية التاريخية — Historical Identity Card
// ------------------------------------------------------------
// Phase 7 redesign: transformed from a dense analytics dashboard
// into a focused, museum-grade identity card that reads like a
// personal historical passport instead of a stats grid.
//
// Canonical data policy (see Phase 7 spec):
//   - EVERY number displayed comes from a canonical source
//     resolved by the caller. This component never falls back
//     to legacy profile arrays (storiesRead, timelinesCompleted,
//     missionsCompleted, seasonPoints, referral fields).
//   - Empty bio / empty favorite state / zero achievements are
//     hidden — never replaced with "غير محدد" placeholders.
//   - Zero XP / Dinars / Level / progress counts ARE shown
//     honestly for new accounts.
//
// Canvas: 1080 × 1350, PNG, RTL. Waits on `document.fonts.ready`
// and image loads before drawing, so the exported bitmap matches
// the on-screen preview.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ProfileState } from "@/lib/profile";
import { levelFor } from "@/lib/app-constants";
import { RARITY_LABEL } from "@/lib/avatars";
import type { EmblemRarity } from "@/lib/emblems";
import {
  resolveDisplayName,
  sanitizeFilenameHandle,
  type DisplayNameSources,
} from "@/lib/share/displayName";
import { downloadImage } from "@/lib/share/shareService";


// ─── Public types ──────────────────────────────────────────────────────

export interface IdentityCardAchievement {
  id: string;
  label: string;
  /** Achievement rarity from canonical registry. Drives Top-3 ordering. */
  rarity?: "common" | "rare" | "epic" | "legendary";
  /** ISO string when the player earned this achievement. */
  unlockedAt?: string | null;
  /** Definition sort order (tiebreaker). */
  sortOrder?: number;
}

export interface ShareCardProps {
  profile: ProfileState;
  username: string;
  /** Sources for the centralized display-name resolver. */
  displayNameSources?: DisplayNameSources;

  /** Stable user id — used to derive the IRTH-XXXXXX card number. */
  userId?: string | null;

  // Canonical counters resolved by the caller. Passing `undefined`
  // means "unknown yet"; the card renders a `—` placeholder.
  campaignsCompleted?: number;
  investigationsCompleted?: number;
  storiesCompleted?: number;
  museumCount?: number;

  /** Full earned achievement list. Top 3 chosen by rarity → recency. */
  achievements?: IdentityCardAchievement[];

  /** Human-readable favorite state (Arabic name). Hide section when empty. */
  favoriteStateName?: string | null;

  /** ISO string — real account join date (e.g. `profiles.join_date`). Hide section when null/guest. */
  joinDate?: string | null;

  /** Optional pre-computed specialization (Arabic label + world slug). */
  specialization?: { label_ar: string; key: string | null } | null;
}


// ─── Component ─────────────────────────────────────────────────────────

export function ShareCard(props: ShareCardProps) {
  const {
    profile,
    username,
    displayNameSources,
    userId,
    campaignsCompleted,
    investigationsCompleted,
    storiesCompleted,
    museumCount,
    achievements,
    favoriteStateName,
    joinDate,
    specialization,
  } = props;


  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<"share" | "download" | null>(null);

  const lvl = levelFor(profile.points);
  const activeTitle =
    profile.titlesEarned?.[profile.titlesEarned.length - 1] ?? lvl.title ?? null;

  const displayName = useMemo(
    () => resolveDisplayName({
      ...(displayNameSources ?? {}),
      username: displayNameSources?.username ?? username,
    }),
    [displayNameSources, username],
  );

  // Deterministic IRTH-XXXXXX number, stable per account.
  const cardNumber = useMemo(
    () => `IRTH-${stableIdCode(userId || username || displayName || "guest")}`,
    [userId, username, displayName],
  );

  // Top 3 achievements: rarity DESC → unlockedAt DESC → sortOrder ASC.
  const topAchievements = useMemo(() => {
    const list = (achievements ?? []).slice();
    list.sort((a, b) => {
      const dr = rarityRank(b.rarity) - rarityRank(a.rarity);
      if (dr !== 0) return dr;
      const ta = a.unlockedAt ? Date.parse(a.unlockedAt) : 0;
      const tb = b.unlockedAt ? Date.parse(b.unlockedAt) : 0;
      if (tb !== ta) return tb - ta;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
    return list.slice(0, 3);
  }, [achievements]);
  const achievementsTotal = achievements?.length ?? 0;

  // Join date — Hijri (Umm al-Qura) + Gregorian in Arabic. Western digits.
  const joinDateHijri = useMemo(() => {
    if (!joinDate) return null;
    const d = new Date(joinDate);
    if (Number.isNaN(d.getTime())) return null;
    try {
      const raw = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
        day: "numeric", month: "long", year: "numeric",
      }).format(d);
      const western = raw.replace(/[\u0660-\u0669]/g, (ch) => String("٠١٢٣٤٥٦٧٨٩".indexOf(ch)));
      // Strip AH marker variants and re-append a clean " هـ".
      const cleaned = western.replace(/\s*(هـ\.?|هـ|AH)\s*$/u, "").trim();
      return `${cleaned} هـ`;
    } catch {
      return null;
    }
  }, [joinDate]);
  const joinDateGregorian = useMemo(() => {
    if (!joinDate) return null;
    const d = new Date(joinDate);
    if (Number.isNaN(d.getTime())) return null;
    try {
      const raw = d.toLocaleDateString("ar-EG", { year: "numeric", month: "long" });
      return raw.replace(/[\u0660-\u0669]/g, (ch) => String("٠١٢٣٤٥٦٧٨٩".indexOf(ch)));
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }, [joinDate]);
  const joinDateLabel = joinDateGregorian; // kept for drawKey stability

  const bio = (profile.bio ?? "").trim();
  const favState = (favoriteStateName ?? "").trim();
  const specLabel = (specialization?.label_ar ?? "").trim();
  const specKey = specialization?.key ?? null;

  // Level curve values — DIRECTLY from levelFor(); never recomputed.
  const levelProgressPct = Math.max(0, Math.min(1, lvl.progress ?? 0));
  const levelToNext = Math.max(0, Math.floor(lvl.toNext ?? 0));
  const atMaxLevel = lvl.next === null;

  const drawKey = [
    displayName, username, cardNumber, activeTitle ?? "",
    lvl.level, profile.points, profile.dinars ?? 0, profile.streak ?? 0,
    campaignsCompleted ?? -1, museumCount ?? -1,
    investigationsCompleted ?? -1, storiesCompleted ?? -1,
    achievementsTotal, topAchievements.map((a) => a.id).join(","),
    bio, favState, specLabel, specKey ?? "",
    profile.avatarId ?? "", joinDateLabel ?? "",
    levelProgressPct.toFixed(3), levelToNext, atMaxLevel ? 1 : 0,
  ].join("|");

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    let cancelled = false;
    setReady(false);
    (async () => {
      try { await (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready; } catch { /* ignore */ }
      // Prefer the bundled offline Premium raster (1024) — same origin,
      // no CDN wait. If a specific legacy id has no raster, the resolver
      // maps it to the closest frozen Premium emblem.
      const { DEFAULT_PREMIUM_EMBLEM_ID, resolveProfileEmblem, getEmblemRecord, localEmblemPath, pickAssetUrl } = await import("@/lib/emblems");
      const resolved = resolveProfileEmblem(profile.avatarId);
      const fallback = getEmblemRecord(DEFAULT_PREMIUM_EMBLEM_ID);
      const localUrl = localEmblemPath(resolved.record.id, 1024);
      const premiumUrl =
        localUrl ??
        pickAssetUrl(resolved.record, 1024, "webp") ??
        (fallback ? localEmblemPath(fallback.id, 1024) : null) ??
        (fallback ? pickAssetUrl(fallback, 1024, "webp") : null);
      const [logoImg, emblemImg] = await Promise.all([
        loadImage("/irth-icon.png").catch(() => null),
        (premiumUrl
          ? loadImage(premiumUrl).catch(() => null)
          : Promise.resolve(null)
        ),
      ]);
      if (cancelled) return;
      drawCard(c, {
        displayName,
        username,
        cardNumber,
        title: activeTitle,
        level: lvl.level,
        levelProgressPct,
        levelToNext,
        atMaxLevel,
        xp: profile.points,
        dinars: profile.dinars ?? 0,
        streak: profile.streak ?? 0,
        campaignsCompleted,
        museumCount,
        investigationsCompleted,
        storiesCompleted,
        achievementsTotal,
        topAchievements,
        bio,
        favoriteStateName: favState,
        specializationLabel: specLabel,
        specializationKey: specKey,
        joinDateHijri,
        joinDateGregorian,
        emblemImg,
        logoImg,
        rarity: resolved.record.rarity,
      });
      setReady(true);
    })().catch(() => { setReady(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey]);


  const filenameBase = `irth-identity-${sanitizeFilenameHandle(username || cardNumber)}`;
  const shareText =
    `${displayName} — بطاقتي التاريخية في إرث\n` +
    `المستوى ${lvl.level} · ${profile.points.toLocaleString("en-US")} XP`;

  const onShare = useCallback(async () => {
    if (!ready || busy) return;
    setBusy("share");
    // Hard watchdog: no matter what the share pipeline does, the UI must
    // never stay stuck on "Preparing…". After 20s force a graceful reset.
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      setBusy(null);
    };
    const watchdog = setTimeout(() => {
      if (!released) {
        toast.error("تعذّرت المشاركة — حاول مجددًا");
        release();
      }
    }, 20_000);
    try {
      const blob = await canvasToBlob(canvasRef.current);
      if (!blob) { toast.error("تعذر تجهيز البطاقة، حاول مجددًا"); return; }
      const res = await shareImage({
        jobId: `identity-card-share-${cardNumber}`,
        blob,
        filename: `${filenameBase}.png`,
        text: `هذه رحلتي عبر التاريخ الإسلامي في تطبيق إرث\n${shareText}`,
        title: "بطاقة هويتي التاريخية في إرث",
      });
      if (res.status === "downloaded") {
        toast.success("المشاركة المباشرة غير مدعومة، تم تنزيل الصورة بدلًا من ذلك");
      }
    } catch (err) {
      console.warn("[share-card] share failed", err);
      toast.error("تعذّرت المشاركة — حاول مجددًا");
    } finally {
      clearTimeout(watchdog);
      release();
    }
  }, [ready, busy, cardNumber, filenameBase, shareText]);

  const onDownload = useCallback(async () => {
    if (!ready || busy) return;
    setBusy("download");
    try {
      const blob = await canvasToBlob(canvasRef.current);
      if (!blob) { toast.error("تعذر تجهيز البطاقة، حاول مجددًا"); return; }
      const res = await downloadImage({
        jobId: `identity-card-download-${cardNumber}`,
        blob,
        filename: `${filenameBase}.png`,
      });
      if (res.status === "downloaded") {
        toast.success("تم تنزيل البطاقة ✓");
      } else if (res.status === "failed") {
        toast.error("تعذر تجهيز البطاقة، حاول مجددًا");
      }
    } finally {
      setBusy(null);
    }
  }, [ready, busy, cardNumber, filenameBase]);

  const disabled = !ready || busy !== null;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-gold/30 bg-black/40 p-2">
        <canvas
          ref={canvasRef}
          width={1080}
          height={1920}
          className="block w-full rounded-xl"
          aria-label="بطاقة الهوية التاريخية"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onShare}
          disabled={disabled}
          aria-busy={busy === "share"}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-gold py-2.5 text-sm font-bold text-primary-foreground shadow-gold disabled:opacity-50"
        >
          {busy === "share" ? (
            <><Loader2 className="size-4 animate-spin" /> جاري تجهيز البطاقة…</>
          ) : (
            <><Share2 className="size-4" /> مشاركة كصورة</>
          )}
        </button>
        <button
          onClick={onDownload}
          disabled={disabled}
          aria-busy={busy === "download"}
          className="flex items-center justify-center gap-2 rounded-xl border border-gold/30 bg-surface py-2.5 text-sm disabled:opacity-50"
        >
          {busy === "download" ? (
            <><Loader2 className="size-4 animate-spin" /> جاري تجهيز البطاقة…</>
          ) : (
            <><Download className="size-4" /> تحميل كصورة</>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Canvas drawing — 1080×1920, museum identity document (Phase 10) ──

const RARITY_ACCENT: Record<EmblemRarity, string> = {
  common:    "#d4af37",
  rare:      "#7dd3fc",
  epic:      "#a78bfa",
  legendary: "#f5d062",
};

/** Achievement rarity ranking for Top-3 sort (legendary highest). */
function rarityRank(r?: IdentityCardAchievement["rarity"]): number {
  switch (r) {
    case "legendary": return 4;
    case "epic":      return 3;
    case "rare":      return 2;
    case "common":    return 1;
    default:          return 0;
  }
}

/** Deterministic 6-char base36 code from a stable identifier. */
function stableIdCode(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  }
  const code = h.toString(36).toUpperCase();
  return (code + "000000").slice(0, 6);
}

// (Historical footer quotes intentionally removed in Phase 10.1 — the
// bottom of the card is reserved for Specialization → medals → branding.)

interface CardData {
  displayName: string;
  username: string;
  cardNumber: string;
  title: string | null;
  level: number;
  levelProgressPct: number;
  levelToNext: number;
  atMaxLevel: boolean;
  xp: number;
  dinars: number;
  streak: number;
  campaignsCompleted?: number;
  museumCount?: number;
  investigationsCompleted?: number;
  storiesCompleted?: number;
  achievementsTotal: number;
  topAchievements: IdentityCardAchievement[];
  bio: string;
  favoriteStateName: string;
  specializationLabel: string;
  specializationKey: string | null;
  joinDateHijri: string | null;
  joinDateGregorian: string | null;
  emblemImg: HTMLImageElement | null;
  logoImg: HTMLImageElement | null;
  rarity: EmblemRarity;
}

function drawCard(c: HTMLCanvasElement, s: CardData) {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const W = c.width, H = c.height;
  const accent = RARITY_ACCENT[s.rarity];
  const gold = "#d4af37";
  const goldSoft = "#f5d062";
  const family = '"IBM Plex Sans Arabic", "Cairo", "Amiri", ui-sans-serif, system-ui, sans-serif';

  // ── Museum background: deep navy with warm halo ─────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0a1226");
  bg.addColorStop(0.55, "#070d1f");
  bg.addColorStop(1, "#04081a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Warm marble halo behind the emblem
  const halo = ctx.createRadialGradient(W / 2, 760, 40, W / 2, 760, 780);
  halo.addColorStop(0, "rgba(212,175,55,0.10)");
  halo.addColorStop(0.55, "rgba(212,175,55,0.03)");
  halo.addColorStop(1, "rgba(212,175,55,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // Subtle marble grain
  ctx.save();
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 60; i++) {
    const y = 120 + (i * (H - 240)) / 60;
    ctx.strokeStyle = i % 2 === 0 ? "rgba(212,175,55,0.4)" : "rgba(180,190,220,0.25)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(60, y + (i % 3));
    ctx.lineTo(W - 60, y - (i % 5));
    ctx.stroke();
  }
  ctx.restore();

  // Elegant double frame
  ctx.strokeStyle = hexAlpha(gold, 0.7);
  ctx.lineWidth = 3;
  roundRect(ctx, 40, 40, W - 80, H - 80, 40);
  ctx.stroke();
  ctx.strokeStyle = hexAlpha(gold, 0.22);
  ctx.lineWidth = 1;
  roundRect(ctx, 64, 64, W - 128, H - 128, 32);
  ctx.stroke();

  ctx.direction = "rtl";
  ctx.textBaseline = "alphabetic";

  // ═══ HEADER (0 – 220) ═══════════════════════════════════════════════
  const headerY = 130;
  const logoSize = 64;
  const logoCX = W - 130;
  if (s.logoImg?.complete && s.logoImg.naturalWidth > 0) {
    ctx.drawImage(s.logoImg, logoCX - logoSize / 2, headerY - logoSize / 2, logoSize, logoSize);
  }
  // Arabic title right-aligned next to logo
  ctx.textAlign = "right";
  ctx.fillStyle = "#f4ecd6";
  ctx.font = `600 26px ${family}`;
  ctx.fillText("بطاقة الهوية التاريخية", logoCX - logoSize / 2 - 20, headerY - 4);
  ctx.fillStyle = hexAlpha(gold, 0.72);
  ctx.font = `400 18px ${family}`;
  ctx.fillText("Historical Identity Card", logoCX - logoSize / 2 - 20, headerY + 26);

  // Card number, left side
  ctx.textAlign = "left";
  ctx.fillStyle = hexAlpha(gold, 0.55);
  ctx.font = `400 13px ${family}`;
  ctx.fillText("رقم البطاقة", 100, headerY - 4);
  ctx.fillStyle = goldSoft;
  ctx.font = `600 22px "IBM Plex Mono", ui-monospace, monospace`;
  ctx.fillText(s.cardNumber, 100, headerY + 24);

  // Divider under header
  drawHairline(ctx, 100, 210, W - 200, hexAlpha(gold, 0.28));

  // ═══ EMBLEM PEDESTAL (hero) ═════════════════════════════════════════
  const cx = W / 2;
  const emCY = 610;
  const emRadius = 210;

  // Pedestal — showcase plinth beneath the emblem
  const pedTopY = emCY + emRadius - 20;
  const pedBotY = emCY + emRadius + 110;

  // Subtle pedestal reflection — draw the emblem inverted, faded, clipped
  // to a trapezoid mirroring the plinth top so it feels like polished stone.
  if (s.emblemImg?.complete && s.emblemImg.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    trapezoid(ctx, cx - 240, pedTopY, 480, cx - 290, pedBotY, 580);
    ctx.clip();
    ctx.globalAlpha = 0.14;
    ctx.translate(cx, pedTopY);
    ctx.scale(1, -0.55);
    const reflSize = 300;
    ctx.drawImage(s.emblemImg, -reflSize / 2, -reflSize + 30, reflSize, reflSize);
    ctx.restore();
    // Fade mask over reflection
    const fade = ctx.createLinearGradient(0, pedTopY, 0, pedBotY);
    fade.addColorStop(0, "rgba(10,15,30,0.0)");
    fade.addColorStop(0.55, "rgba(10,15,30,0.55)");
    fade.addColorStop(1, "rgba(10,15,30,0.95)");
    ctx.save();
    ctx.beginPath();
    trapezoid(ctx, cx - 240, pedTopY, 480, cx - 290, pedBotY, 580);
    ctx.clip();
    ctx.fillStyle = fade;
    ctx.fillRect(cx - 300, pedTopY, 600, pedBotY - pedTopY);
    ctx.restore();
  }

  // Plinth ground shadow
  const shadow = ctx.createRadialGradient(cx, pedBotY + 10, 10, cx, pedBotY + 10, 320);
  shadow.addColorStop(0, "rgba(0,0,0,0.55)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadow;
  ctx.fillRect(cx - 340, pedBotY - 40, 680, 200);

  // Pedestal outline (subtle rim only — face is now transparent to show reflection)
  ctx.strokeStyle = hexAlpha(gold, 0.35);
  ctx.lineWidth = 1;
  trapezoid(ctx, cx - 240, pedTopY, 480, cx - 290, pedBotY, 580);
  ctx.stroke();
  // Pedestal top gold rim
  ctx.fillStyle = hexAlpha(gold, 0.9);
  ctx.fillRect(cx - 250, pedTopY - 4, 500, 4);
  ctx.fillStyle = hexAlpha(goldSoft, 0.4);
  ctx.fillRect(cx - 250, pedTopY, 500, 1);

  // Emblem disc backing
  const disc = ctx.createRadialGradient(cx, emCY - 30, 20, cx, emCY, emRadius);
  disc.addColorStop(0, "rgba(255,240,200,0.10)");
  disc.addColorStop(1, "rgba(10,15,30,0)");
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(cx, emCY, emRadius + 40, 0, Math.PI * 2);
  ctx.fill();

  // Museum ring around emblem
  ctx.beginPath();
  ctx.arc(cx, emCY, emRadius, 0, Math.PI * 2);
  ctx.strokeStyle = hexAlpha(accent, 0.9);
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, emCY, emRadius - 12, 0, Math.PI * 2);
  ctx.strokeStyle = hexAlpha(gold, 0.35);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Emblem itself — hero, transparent PNG
  if (s.emblemImg?.complete && s.emblemImg.naturalWidth > 0) {
    const emSize = 340;
    ctx.drawImage(s.emblemImg, cx - emSize / 2, emCY - emSize / 2, emSize, emSize);
  }

  // Rarity ribbon on the pedestal front
  const rarityText = RARITY_LABEL[s.rarity];
  ctx.font = `600 20px ${family}`;
  const rw = ctx.measureText(rarityText).width + 56;
  const ry = pedTopY + 34;
  roundRect(ctx, cx - rw / 2, ry, rw, 40, 20);
  ctx.fillStyle = "rgba(10,15,30,0.7)";
  ctx.fill();
  ctx.fillStyle = hexAlpha(accent, 0.18);
  ctx.fill();
  ctx.strokeStyle = hexAlpha(accent, 0.7);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  ctx.fillText(rarityText, cx, ry + 28);

  // ═══ PLAYER IDENTITY ════════════════════════════════════════════════
  let cursor = 1040;
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  fitText(ctx, s.displayName, cx, cursor, W - 260, 56, 36, "700", family);
  cursor += 52;

  if (s.title) {
    ctx.fillStyle = goldSoft;
    ctx.font = `600 22px ${family}`;
    ctx.fillText(truncate(ctx, s.title, W - 280), cx, cursor);
    cursor += 34;
  }
  if (s.username && s.username !== s.displayName) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = `400 20px ${family}`;
    ctx.fillText(truncate(ctx, `@${s.username}`, W - 280), cx, cursor);
    cursor += 26;
  }

  // Divider
  cursor += 34;
  drawHairline(ctx, 180, cursor, W - 360, hexAlpha(gold, 0.22));
  cursor += 44;

  // ═══ LEVEL SECTION ═════════════════════════════════════════════════
  const lvlPadX = 130;
  const lvlW = W - 2 * lvlPadX;

  ctx.textAlign = "right";
  ctx.fillStyle = hexAlpha(gold, 0.7);
  ctx.font = `600 16px ${family}`;
  ctx.fillText("المستوى", W - lvlPadX, cursor);

  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = `700 34px ${family}`;
  ctx.fillText(String(s.level), lvlPadX, cursor + 4);
  cursor += 28;

  const barY = cursor + 16;
  const barH = 12;
  roundRect(ctx, lvlPadX, barY, lvlW, barH, barH / 2);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fill();
  ctx.strokeStyle = hexAlpha(gold, 0.22);
  ctx.lineWidth = 1;
  ctx.stroke();

  const pct = s.atMaxLevel ? 1 : s.levelProgressPct;
  const fillW = Math.max(0, Math.min(lvlW, lvlW * pct));
  if (fillW > 0) {
    roundRect(ctx, lvlPadX + lvlW - fillW, barY, fillW, barH, barH / 2);
    const bg2 = ctx.createLinearGradient(lvlPadX, barY, lvlPadX + lvlW, barY);
    bg2.addColorStop(0, "#a07c1c");
    bg2.addColorStop(1, goldSoft);
    ctx.fillStyle = bg2;
    ctx.fill();
  }

  cursor = barY + barH + 28;
  ctx.textAlign = "right";
  ctx.fillStyle = goldSoft;
  ctx.font = `600 18px ${family}`;
  ctx.fillText(`${Math.round(pct * 100)}%`, W - lvlPadX, cursor);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = `400 16px ${family}`;
  const tail = s.atMaxLevel
    ? "بلغتَ أعلى المستويات"
    : `متبقّي ${s.levelToNext.toLocaleString("en-US")} نقطة للمستوى التالي`;
  ctx.fillText(tail, lvlPadX, cursor);
  cursor += 40;
  drawHairline(ctx, 180, cursor, W - 360, hexAlpha(gold, 0.18));
  cursor += 56;

  // ═══ STATISTICS (icon-based, 2×3 grid — enlarged icons) ═════════════
  const stats: Array<{ kind: StatIcon; label: string; value: string }> = [
    { kind: "dinars",   label: "الدنانير",     value: s.dinars.toLocaleString("en-US") },
    { kind: "museum",   label: "المقتنيات",   value: countOrDash(s.museumCount) },
    { kind: "campaign", label: "الحملات",      value: countOrDash(s.campaignsCompleted) },
    { kind: "loupe",    label: "التحقيقات",    value: countOrDash(s.investigationsCompleted) },
    { kind: "book",     label: "القصص",         value: countOrDash(s.storiesCompleted) },
    { kind: "trophy",   label: "الإنجازات",    value: s.achievementsTotal.toLocaleString("en-US") },
  ];
  const gridPadX = 100;
  const gridW = W - 2 * gridPadX;
  const cellW = gridW / 3;
  const cellH = 180;
  for (let i = 0; i < stats.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cxs = gridPadX + col * cellW + cellW / 2;
    const cys = cursor + row * cellH;
    drawStatIcon(ctx, stats[i].kind, cxs, cys + 14, gold);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = `700 32px ${family}`;
    ctx.fillText(truncate(ctx, stats[i].value, cellW - 20), cxs, cys + 110);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `400 16px ${family}`;
    ctx.fillText(stats[i].label, cxs, cys + 140);
  }
  cursor += 2 * cellH + 20;

  // ═══ BOTTOM: Specialization → divider → medals → branding ═══════════
  // Nothing else lives here. Bio / favorite state / join date / quote
  // are intentionally omitted to let the bottom breathe (Phase 10 spec).

  if (s.specializationLabel) {
    ctx.font = `700 26px ${family}`;
    const valueW = ctx.measureText(s.specializationLabel).width;
    const chipW = Math.min(W - 260, Math.max(380, valueW + 120));
    const chipH = 104;
    const chipX = cx - chipW / 2, chipY = cursor;
    roundRect(ctx, chipX, chipY, chipW, chipH, 22);
    const cg = ctx.createLinearGradient(chipX, chipY, chipX + chipW, chipY + chipH);
    cg.addColorStop(0, "#4a3717");
    cg.addColorStop(0.5, "#8a6a24");
    cg.addColorStop(1, "#4a3717");
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = goldSoft;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    roundRect(ctx, chipX + 6, chipY + 6, chipW - 12, chipH - 12, 18);
    ctx.strokeStyle = hexAlpha(goldSoft, 0.5);
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,240,200,0.7)";
    ctx.font = `400 14px ${family}`;
    ctx.fillText("العالم التاريخي الأكثر نشاطاً", cx, chipY + 32);
    ctx.fillStyle = "#fff8e0";
    ctx.font = `700 28px ${family}`;
    ctx.fillText(truncate(ctx, s.specializationLabel, chipW - 40), cx, chipY + 74);
    cursor += chipH + 44;
  }

  // Thin divider
  drawHairline(ctx, 220, cursor, W - 440, hexAlpha(gold, 0.28));
  cursor += 46;

  // Top 3 medals (museum medals with ornate rim, embossed star, ribbon)
  if (s.topAchievements.length > 0) {
    const medalR = 54;
    const medalGap = 48;
    const medalCount = Math.min(3, s.topAchievements.length);
    const totalW = medalCount * (medalR * 2) + (medalCount - 1) * medalGap;
    const startX = cx - totalW / 2 + medalR;
    for (let i = 0; i < medalCount; i++) {
      const ac = s.topAchievements[i];
      const mx = startX + i * (medalR * 2 + medalGap);
      const my = cursor + medalR + 8;
      drawMedal(ctx, mx, my, medalR, accent, gold, i + 1);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.font = `500 13px ${family}`;
      const label = truncate(ctx, ac.label, medalR * 2 + medalGap - 4);
      ctx.fillText(label, mx, my + medalR + 28);
    }
    cursor += medalR * 2 + 70;
  }

  // ═══ IRTH BRANDING (footer) ═════════════════════════════════════════
  const brandY = H - 96;
  if (s.logoImg?.complete && s.logoImg.naturalWidth > 0) {
    const bs = 40;
    ctx.drawImage(s.logoImg, cx - bs / 2, brandY - bs, bs, bs);
  }
  ctx.textAlign = "center";
  ctx.fillStyle = goldSoft;
  ctx.font = `700 26px ${family}`;
  ctx.fillText("إرث", cx, brandY + 32);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = `400 13px ${family}`;
  ctx.fillText("Irth · Historical Identity", cx, brandY + 54);
}

// ─── Drawing helpers ─────────────────────────────────────────────────

type StatIcon = "dinars" | "museum" | "campaign" | "loupe" | "book" | "trophy";

function drawStatIcon(
  ctx: CanvasRenderingContext2D,
  kind: StatIcon,
  cx: number, cy: number,
  gold: string,
) {
  ctx.save();
  ctx.strokeStyle = gold;
  ctx.fillStyle = hexAlpha(gold, 0.12);
  ctx.lineWidth = 2;
  const r = 36;
  // Soft round backdrop
  ctx.beginPath();
  ctx.arc(cx, cy + 8, r + 10, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fill();
  ctx.strokeStyle = hexAlpha(gold, 0.35);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = gold;
  ctx.fillStyle = gold;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Scale glyphs uniformly to match enlarged backdrop
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1.28, 1.28);
  ctx.translate(-cx, -cy);
  switch (kind) {
    case "dinars": {
      // Coin: outer ring + inner star mark
      ctx.beginPath();
      ctx.arc(cx, cy + 6, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy + 6, 14, 0, Math.PI * 2);
      ctx.stroke();
      // Central dot
      ctx.beginPath();
      ctx.arc(cx, cy + 6, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "museum": {
      // Three columns with base
      const bx = cx - 22, by = cy - 14, bw = 44, bh = 40;
      ctx.beginPath();
      ctx.moveTo(bx, by + 2);
      ctx.lineTo(cx, by - 8);
      ctx.lineTo(bx + bw, by + 2);
      ctx.stroke();
      // Columns
      for (let i = 0; i < 3; i++) {
        const x = bx + 6 + i * 16;
        ctx.beginPath();
        ctx.moveTo(x, by + 6);
        ctx.lineTo(x, by + bh - 4);
        ctx.stroke();
      }
      // Base
      ctx.beginPath();
      ctx.moveTo(bx - 2, by + bh);
      ctx.lineTo(bx + bw + 2, by + bh);
      ctx.stroke();
      break;
    }
    case "campaign": {
      // Scroll
      const x = cx - 20, y = cy - 14;
      ctx.beginPath();
      ctx.moveTo(x + 4, y);
      ctx.lineTo(x + 34, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 4, y + 4, 4, Math.PI * 0.5, Math.PI * 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 8);
      ctx.lineTo(x + 4, y + 32);
      ctx.arc(x + 8, y + 36, 4, Math.PI, Math.PI * 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 12, y + 8);
      ctx.lineTo(x + 32, y + 8);
      ctx.moveTo(x + 12, y + 18);
      ctx.lineTo(x + 32, y + 18);
      ctx.moveTo(x + 12, y + 28);
      ctx.lineTo(x + 26, y + 28);
      ctx.stroke();
      break;
    }
    case "loupe": {
      ctx.beginPath();
      ctx.arc(cx - 4, cy + 2, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 6, cy + 12);
      ctx.lineTo(cx + 18, cy + 24);
      ctx.stroke();
      break;
    }
    case "book": {
      const x = cx - 22, y = cy - 14;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 40);
      ctx.lineTo(x + 44, y + 40);
      ctx.lineTo(x + 44, y);
      ctx.moveTo(x + 22, y + 2);
      ctx.lineTo(x + 22, y + 40);
      ctx.stroke();
      // Lines
      for (let i = 0; i < 3; i++) {
        const yy = y + 10 + i * 10;
        ctx.beginPath();
        ctx.moveTo(x + 4, yy);
        ctx.lineTo(x + 18, yy);
        ctx.moveTo(x + 26, yy);
        ctx.lineTo(x + 40, yy);
        ctx.stroke();
      }
      break;
    }
    case "trophy": {
      const x = cx, y = cy - 14;
      // Cup
      ctx.beginPath();
      ctx.moveTo(x - 14, y);
      ctx.lineTo(x + 14, y);
      ctx.lineTo(x + 12, y + 20);
      ctx.quadraticCurveTo(x, y + 30, x - 12, y + 20);
      ctx.closePath();
      ctx.stroke();
      // Handles
      ctx.beginPath();
      ctx.moveTo(x - 14, y + 4);
      ctx.quadraticCurveTo(x - 24, y + 12, x - 14, y + 18);
      ctx.moveTo(x + 14, y + 4);
      ctx.quadraticCurveTo(x + 24, y + 12, x + 14, y + 18);
      ctx.stroke();
      // Stem + base
      ctx.beginPath();
      ctx.moveTo(x, y + 30);
      ctx.lineTo(x, y + 38);
      ctx.moveTo(x - 10, y + 42);
      ctx.lineTo(x + 10, y + 42);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
  ctx.restore();
}

function drawMedal(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  accent: string, gold: string,
  rank: number,
) {
  ctx.save();

  // Drop shadow beneath the medal (museum lighting)
  const sh = ctx.createRadialGradient(cx, cy + r * 0.9, 4, cx, cy + r * 0.9, r * 1.4);
  sh.addColorStop(0, "rgba(0,0,0,0.55)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(cx - r * 1.6, cy, r * 3.2, r * 1.6);

  // Fabric ribbon — trapezoid with folded shadow
  const ribbonTop = cy - r - 26;
  const ribbonBase = cy - r + 4;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.7, ribbonTop);
  ctx.lineTo(cx - r * 0.3, ribbonBase);
  ctx.lineTo(cx + r * 0.3, ribbonBase);
  ctx.lineTo(cx + r * 0.7, ribbonTop);
  ctx.closePath();
  const ribbonG = ctx.createLinearGradient(cx - r, ribbonTop, cx + r, ribbonBase);
  ribbonG.addColorStop(0, hexAlpha(accent, 0.55));
  ribbonG.addColorStop(0.5, hexAlpha(accent, 0.95));
  ribbonG.addColorStop(1, hexAlpha(accent, 0.55));
  ctx.fillStyle = ribbonG;
  ctx.fill();
  // Center fold line
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, ribbonTop);
  ctx.lineTo(cx, ribbonBase);
  ctx.stroke();

  // Outer bezel (dark rim for depth)
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.fillStyle = "#2a1c07";
  ctx.fill();

  // Medal disc — brushed gold radial
  const grad = ctx.createRadialGradient(cx - r / 2.5, cy - r / 2.5, 2, cx, cy, r);
  grad.addColorStop(0, "#fbe38b");
  grad.addColorStop(0.5, "#d4a63a");
  grad.addColorStop(1, "#7a5714");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Outer engraved ring
  ctx.strokeStyle = hexAlpha(gold, 0.95);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Rim dots (12 small studs — museum medal detail)
  ctx.fillStyle = "#3a2809";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * (r - 6);
    const py = cy + Math.sin(a) * (r - 6);
    ctx.beginPath();
    ctx.arc(px, py, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Inner ring
  ctx.beginPath();
  ctx.arc(cx, cy, r - 12, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(58,40,9,0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Embossed 8-point star behind the numeral
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = "rgba(58,40,9,0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * (r - 16), Math.sin(a) * (r - 16));
    ctx.stroke();
  }
  ctx.restore();

  // Highlight sheen
  const sheen = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy);
  sheen.addColorStop(0, "rgba(255,255,255,0.35)");
  sheen.addColorStop(0.4, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 2, Math.PI, Math.PI * 1.6);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();

  // Rank numeral
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#2a1c07";
  ctx.font = `700 ${Math.round(r * 0.7)}px "IBM Plex Sans Arabic", ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(String(rank), cx, cy + 2);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawHairline(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number,
  color: string,
) {
  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, "rgba(212,175,55,0)");
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, "rgba(212,175,55,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, 1);
}

function trapezoid(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, w1: number,
  x2: number, y2: number, w2: number,
) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 + w1, y1);
  ctx.lineTo(x2 + w2, y2);
  ctx.lineTo(x2, y2);
  ctx.closePath();
}



// ─── Utilities ─────────────────────────────────────────────────────────

function countOrDash(n: number | undefined): string {
  return typeof n === "number" ? n.toLocaleString("en-US") : "—";
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
  return t + "…";
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number, maxWidth: number,
  startSize: number, minSize: number,
  weight: string, family: string,
) {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  } while (size > minSize);
  ctx.textAlign = "center";
  ctx.fillText(truncate(ctx, text, maxWidth), x, y);
}

/** Draws wrapped text centered at (x,y). Returns the new y cursor. */
function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const attempt = current ? `${current} ${w}` : w;
    if (ctx.measureText(attempt).width <= maxWidth) {
      current = attempt;
    } else {
      if (current) lines.push(current);
      current = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  // Ellipsis on the last line if truncated
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + "…").width > maxWidth) {
      last = last.slice(0, -1);
    }
    if (words.join(" ") !== lines.join(" ")) last = last + "…";
    lines[maxLines - 1] = last;
  }
  let cy = y;
  for (const line of lines) {
    ctx.fillText(line, x, cy);
    cy += lineHeight;
  }
  return cy;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function canvasToBlob(c: HTMLCanvasElement | null): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!c) return resolve(null);
    try {
      c.toBlob((b) => resolve(b), "image/png", 0.95);
    } catch {
      resolve(null);
    }
  });
}
