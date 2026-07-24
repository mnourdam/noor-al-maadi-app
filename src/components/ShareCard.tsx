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
import { renderToStaticMarkup } from "react-dom/server";
import { Share2, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ProfileState } from "@/lib/profile";
import { levelFor } from "@/lib/app-constants";
import { getAvatar, RARITY_LABEL, type AvatarRarity } from "@/lib/avatars";
import { AvatarArt } from "./AvatarArt";
import {
  resolveDisplayName,
  sanitizeFilenameHandle,
  type DisplayNameSources,
} from "@/lib/share/displayName";
import { shareImage, downloadImage } from "@/lib/share/shareService";

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
  } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<"share" | "download" | null>(null);

  const avatar = getAvatar(profile.avatarId);
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

  const generatedOn = useMemo(
    () => new Date().toLocaleDateString("ar", { year: "numeric", month: "long", day: "numeric" }),
    [],
  );

  const bio = (profile.bio ?? "").trim();
  const favState = (favoriteStateName ?? "").trim();

  const drawKey = [
    displayName, username, cardNumber, activeTitle ?? "",
    lvl.level, profile.points, profile.dinars ?? 0, profile.streak ?? 0,
    campaignsCompleted ?? -1, museumCount ?? -1,
    investigationsCompleted ?? -1, storiesCompleted ?? -1,
    achievementsTotal, topAchievements.map((a) => a.id).join(","),
    bio, favState, profile.avatarId ?? "", generatedOn,
  ].join("|");

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    let cancelled = false;
    setReady(false);
    (async () => {
      try { await (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready; } catch { /* ignore */ }
      const [logoImg, emblemImg] = await Promise.all([
        loadImage("/irth-icon.png").catch(() => null),
        loadImage(svgDataUrl(renderToStaticMarkup(<AvatarArt id={avatar.id} />))).catch(() => null),
      ]);
      if (cancelled) return;
      drawCard(c, {
        displayName,
        username,
        cardNumber,
        title: activeTitle,
        level: lvl.level,
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
        generatedOn,
        emblemImg,
        logoImg,
        rarity: avatar.rarity,
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
    } finally {
      setBusy(null);
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
          height={1350}
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

// ─── Canvas drawing — 1080×1350, 4:5 portrait ──────────────────────────

const RARITY_ACCENT: Record<AvatarRarity, string> = {
  common:    "#d4af37",
  uncommon:  "#c8a233",
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
  // djb2 hash → base36, upper-cased, padded/truncated to 6.
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  }
  const code = h.toString(36).toUpperCase();
  return (code + "000000").slice(0, 6);
}

interface CardData {
  displayName: string;
  username: string;
  cardNumber: string;
  title: string | null;
  level: number;
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
  generatedOn: string;
  emblemImg: HTMLImageElement | null;
  logoImg: HTMLImageElement | null;
  rarity: AvatarRarity;
}

function drawCard(c: HTMLCanvasElement, s: CardData) {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const W = c.width, H = c.height;
  const accent = RARITY_ACCENT[s.rarity];
  const family = 'system-ui, -apple-system, "Segoe UI", "Noto Naskh Arabic", Arial';

  // ── Background: deep navy vignette ───────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b1228");
  bg.addColorStop(1, "#050818");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Restrained cyan halo behind the identity area
  const vg = ctx.createRadialGradient(W / 2, 520, 30, W / 2, 520, 620);
  vg.addColorStop(0, "rgba(125,211,252,0.10)");
  vg.addColorStop(1, "rgba(125,211,252,0)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // Historical pattern strip (subtle geometric dots along the border)
  ctx.save();
  ctx.fillStyle = "rgba(212,175,55,0.06)";
  for (let y = 90; y < H - 60; y += 24) {
    for (let x = 90; x < W - 60; x += 24) {
      const edge = x < 130 || x > W - 130 || y < 130 || y > H - 130;
      if (!edge) continue;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Elegant double frame — outer accent, inner soft gold
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  roundRect(ctx, 36, 36, W - 72, H - 72, 44);
  ctx.stroke();
  ctx.strokeStyle = "rgba(212,175,55,0.32)";
  ctx.lineWidth = 1;
  roundRect(ctx, 60, 60, W - 120, H - 120, 34);
  ctx.stroke();

  ctx.direction = "rtl";
  ctx.textBaseline = "alphabetic";

  // ── Header ──────────────────────────────────────────────────────────
  const logoSize = 84;
  const logoX = 96, logoY = 96;
  if (s.logoImg?.complete && s.logoImg.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(212,175,55,0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.drawImage(s.logoImg, logoX, logoY, logoSize, logoSize);
    ctx.restore();
  }
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `20px ${family}`;
  ctx.fillText("بطاقة الهوية التاريخية", logoX + logoSize + 22, logoY + 40);
  ctx.fillStyle = "rgba(212,175,55,0.9)";
  ctx.font = `bold 22px ${family}`;
  ctx.fillText("Irth · إرث", logoX + logoSize + 22, logoY + 72);

  // Card number, top-right (RTL "opposite corner")
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(212,175,55,0.75)";
  ctx.font = `600 20px ${family}`;
  ctx.fillText(s.cardNumber, W - 96, logoY + 44);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `14px ${family}`;
  ctx.fillText("رقم البطاقة", W - 96, logoY + 68);

  // ── Identity block ──────────────────────────────────────────────────
  const cx = W / 2;
  const ay = 380;

  // Emblem halo
  const halo = ctx.createRadialGradient(cx, ay, 30, cx, ay, 260);
  halo.addColorStop(0, hexAlpha(accent, 0.32));
  halo.addColorStop(1, hexAlpha(accent, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(cx - 280, ay - 280, 560, 560);

  // Avatar disc
  ctx.beginPath();
  ctx.arc(cx, ay, 156, 0, Math.PI * 2);
  const ag = ctx.createLinearGradient(cx - 150, ay - 150, cx + 150, ay + 150);
  ag.addColorStop(0, "#1a223d");
  ag.addColorStop(1, "#0b1228");
  ctx.fillStyle = ag;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, ay, 142, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(212,175,55,0.5)";
  ctx.stroke();

  if (s.emblemImg?.complete && s.emblemImg.naturalWidth > 0) {
    const emSize = 232;
    ctx.drawImage(s.emblemImg, cx - emSize / 2, ay - emSize / 2, emSize, emSize);
  }

  // Rarity ribbon (rank frame)
  const rarityText = RARITY_LABEL[s.rarity];
  ctx.font = `600 18px ${family}`;
  const rw = ctx.measureText(rarityText).width + 44;
  const rx = cx - rw / 2, ry = ay + 166;
  roundRect(ctx, rx, ry, rw, 32, 16);
  ctx.fillStyle = hexAlpha(accent, 0.18);
  ctx.fill();
  ctx.strokeStyle = hexAlpha(accent, 0.7);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  ctx.fillText(rarityText, cx, ry + 22);

  // Display name
  ctx.fillStyle = "#fff";
  fitText(ctx, s.displayName, cx, ay + 274, W - 220, 60, 36, "bold", family);

  // Username (secondary)
  if (s.username && s.username !== s.displayName) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `22px ${family}`;
    ctx.fillText(truncate(ctx, `@${s.username}`, W - 260), cx, ay + 310);
  }

  // Title (rank / role) — canonical active title
  if (s.title) {
    ctx.fillStyle = "#d4af37";
    ctx.font = `600 22px ${family}`;
    ctx.fillText(truncate(ctx, s.title, W - 260), cx, ay + 342);
  }

  // Level pill
  const pillW = 260, pillH = 56;
  const px = cx - pillW / 2, py = ay + 366;
  roundRect(ctx, px, py, pillW, pillH, pillH / 2);
  const lg = ctx.createLinearGradient(px, py, px + pillW, py);
  lg.addColorStop(0, "#d4af37");
  lg.addColorStop(1, "#a07c1c");
  ctx.fillStyle = lg;
  ctx.fill();
  ctx.fillStyle = "#0b1228";
  ctx.font = `bold 26px ${family}`;
  ctx.fillText(`المستوى ${s.level}`, cx, py + 38);

  // ── Main statistics (2×2 grid of 4 primary counters) ────────────────
  const primary: [string, string][] = [
    ["نقاط الخبرة", s.xp.toLocaleString("en-US")],
    ["الدنانير", s.dinars.toLocaleString("en-US")],
    ["الحملات المكتملة", countOrDash(s.campaignsCompleted)],
    ["مقتنيات المتحف", countOrDash(s.museumCount)],
  ];
  const gx = 96;
  const gw = W - 192;
  const colW = (gw - 20) / 2;
  const rowH = 104;
  const gy = ay + 472;
  for (let i = 0; i < primary.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const rxs = gx + col * (colW + 20);
    const rys = gy + row * (rowH + 16);
    roundRect(ctx, rxs, rys, colW, rowH, 22);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
    ctx.strokeStyle = "rgba(212,175,55,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `18px ${family}`;
    ctx.fillText(primary[i][0], rxs + colW / 2, rys + 36);
    ctx.fillStyle = "#fff";
    ctx.font = `bold 36px ${family}`;
    ctx.fillText(truncate(ctx, primary[i][1], colW - 24), rxs + colW / 2, rys + 82);
  }

  // ── Secondary progress line ─────────────────────────────────────────
  const sy = gy + 2 * (rowH + 16) + 20;
  const secondary = [
    ["التحقيقات المنجزة", countOrDash(s.investigationsCompleted)],
    ["القصص المقروءة", countOrDash(s.storiesCompleted)],
    ["الإنجازات", s.achievementsTotal.toLocaleString("en-US")],
  ];
  const scW = (gw - 24) / 3;
  const scH = 66;
  for (let i = 0; i < secondary.length; i++) {
    const rxs = gx + i * (scW + 12);
    roundRect(ctx, rxs, sy, scW, scH, 16);
    ctx.fillStyle = "rgba(125,211,252,0.05)";
    ctx.fill();
    ctx.strokeStyle = "rgba(125,211,252,0.20)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `15px ${family}`;
    ctx.fillText(secondary[i][0], rxs + scW / 2, sy + 26);
    ctx.fillStyle = "#fff";
    ctx.font = `bold 22px ${family}`;
    ctx.fillText(truncate(ctx, secondary[i][1], scW - 20), rxs + scW / 2, sy + 54);
  }

  // ── Personal historical identity (bio + favorite state) ─────────────
  let cursor = sy + scH + 28;
  const hasBio = s.bio.length > 0;
  const hasFav = s.favoriteStateName.length > 0;

  if (hasBio) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(212,175,55,0.85)";
    ctx.font = `600 16px ${family}`;
    ctx.fillText("نبذة", cx, cursor);
    cursor += 22;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `18px ${family}`;
    cursor = drawWrappedText(ctx, s.bio, cx, cursor, W - 240, 26, 3);
    cursor += 10;
  }
  if (hasFav) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(212,175,55,0.85)";
    ctx.font = `600 15px ${family}`;
    ctx.fillText("الدولة المفضلة", cx, cursor);
    cursor += 22;
    ctx.fillStyle = "#fff";
    ctx.font = `bold 20px ${family}`;
    ctx.fillText(truncate(ctx, s.favoriteStateName, W - 240), cx, cursor);
    cursor += 14;
  }

  // ── Top achievements ────────────────────────────────────────────────
  cursor += 10;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(212,175,55,0.9)";
  ctx.font = `bold 20px ${family}`;
  ctx.fillText("أبرز الإنجازات", cx, cursor);
  cursor += 18;
  if (s.topAchievements.length === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `italic 17px ${family}`;
    ctx.fillText("لم تبدأ رحلة الإنجازات بعد", cx, cursor + 22);
    cursor += 44;
  } else {
    const aw = W - 192;
    const cols = Math.min(3, s.topAchievements.length);
    const acolW = (aw - (cols - 1) * 14) / cols;
    const ah = 68;
    const ayTop = cursor + 8;
    for (let i = 0; i < s.topAchievements.length; i++) {
      const ac = s.topAchievements[i];
      const rxs = gx + i * (acolW + 14);
      roundRect(ctx, rxs, ayTop, acolW, ah, 16);
      ctx.fillStyle = "rgba(212,175,55,0.10)";
      ctx.fill();
      ctx.strokeStyle = "rgba(212,175,55,0.40)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = `bold 18px ${family}`;
      ctx.textAlign = "center";
      ctx.fillText(truncate(ctx, ac.label, acolW - 20), rxs + acolW / 2, ayTop + 42);
    }
    cursor = ayTop + ah;
  }

  // ── Footer ──────────────────────────────────────────────────────────
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `18px ${family}`;
  ctx.fillText(
    `السلسلة اليومية · ${s.streak.toLocaleString("en-US")} يوم`,
    cx, H - 132,
  );
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `bold 24px ${family}`;
  ctx.fillText("رحلة عبر التاريخ الإسلامي", cx, H - 96);
  ctx.fillStyle = "rgba(212,175,55,0.75)";
  ctx.font = `15px ${family}`;
  ctx.fillText(`صدرت في ${s.generatedOn}`, cx, H - 68);
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

function svgDataUrl(svg: string): string {
  const wrapped = svg.includes("xmlns")
    ? svg
    : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(wrapped)));
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
