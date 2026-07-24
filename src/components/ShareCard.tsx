import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Share2, Download } from "lucide-react";
import { toast } from "sonner";
import type { ProfileState } from "@/lib/profile";
import { derivePublicStats } from "@/lib/social";
import { getAvatar, RARITY_LABEL, type AvatarRarity } from "@/lib/avatars";
import { AvatarArt } from "./AvatarArt";
import {
  resolveDisplayName,
  sanitizeFilenameHandle,
  type DisplayNameSources,
} from "@/lib/share/displayName";
import { shareImage, downloadImage } from "@/lib/share/shareService";

/**
 * بطاقة الهوية التاريخية — Historical Identity Card
 *
 * Phase 2 (Referrals removal): the card is now a pure "player journey"
 * summary. No QR, no referral code, no invite text, no public URL. The
 * exported PNG is a shareable social image (1080×1350, 4:5 portrait) that
 * simply presents the player's Irth stats.
 *
 * Canonical data sources (see report):
 *   - level, xp, dinars, streak, campaigns/artifacts/discovery → derivePublicStats(profile)
 *   - display name / username → resolveDisplayName + provided username
 *   - achievements count + top 3 → passed via `achievements` prop from caller
 *
 * The on-screen preview scales responsively; the exported pixels are
 * always 1080×1350 for deterministic social output.
 */

export interface IdentityCardAchievement {
  id: string;
  label: string;
}

export function ShareCard({
  profile,
  username,
  displayNameSources,
  investigationsCompleted,
  achievements,
}: {
  profile: ProfileState;
  username: string;
  /** Sources for the centralized display-name resolver. Preferred over `username`. */
  displayNameSources?: DisplayNameSources;
  /** Canonical count of completed investigations (from profile domain). */
  investigationsCompleted?: number;
  /** Canonical achievement summary (total + up to 3 top achievement labels). */
  achievements?: { total: number; top: IdentityCardAchievement[] };
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const stats = derivePublicStats(profile);
  const avatar = getAvatar(profile.avatarId);

  const displayName = useMemo(
    () => resolveDisplayName({
      ...(displayNameSources ?? {}),
      username: displayNameSources?.username ?? username,
    }),
    [displayNameSources, username],
  );

  const invCount = investigationsCompleted ?? profile.investigationsCompleted?.length ?? 0;
  const achTotal = achievements?.total ?? 0;
  const topAchievements = (achievements?.top ?? []).slice(0, 3);
  const generatedOn = useMemo(
    () => new Date().toLocaleDateString("ar", { year: "numeric", month: "long", day: "numeric" }),
    [],
  );

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
        title: stats.title,
        level: stats.level,
        xp: stats.xp,
        dinars: stats.dinars,
        streak: stats.streak,
        campaigns_completed: stats.campaigns_completed,
        artifacts_collected: stats.artifacts_collected,
        discovery_pct: stats.discovery_pct,
        investigations_completed: invCount,
        achievements_total: achTotal,
        top_achievements: topAchievements,
        generatedOn,
        emblemImg,
        logoImg,
        rarity: avatar.rarity,
        avatarName: avatar.name,
      });
      setReady(true);
    })().catch(() => { setReady(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName, username, profile.points, profile.streak, profile.dinars,
      profile.campaignsCompleted.length, profile.artifactsFound.length,
      profile.investigationsCompleted?.length, profile.avatarId,
      achTotal, topAchievements.map((a) => a.id).join(","), generatedOn]);

  const filenameBase = `irth-identity-${sanitizeFilenameHandle(username)}`;
  const shareText = `${displayName} — بطاقتي التاريخية في إرث\nالمستوى ${stats.level} · ${stats.xp} XP`;

  async function onShare() {
    const blob = await canvasToBlob(canvasRef.current);
    if (!blob) { toast.error("البطاقة لم تكتمل بعد — حاول بعد لحظة"); return; }
    await shareImage({
      jobId: `identity-card-share-${username}`,
      blob,
      filename: `${filenameBase}.png`,
      text: shareText,
      title: "بطاقتي في إرث",
    });
  }

  async function onDownload() {
    const blob = await canvasToBlob(canvasRef.current);
    if (!blob) { toast.error("البطاقة لم تكتمل بعد — حاول بعد لحظة"); return; }
    await downloadImage({
      jobId: `identity-card-download-${username}`,
      blob,
      filename: `${filenameBase}.png`,
    });
  }

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
          disabled={!ready}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-gold py-2.5 text-sm font-bold text-primary-foreground shadow-gold disabled:opacity-50"
        >
          <Share2 className="size-4" /> مشاركة كصورة
        </button>
        <button
          onClick={onDownload}
          disabled={!ready}
          className="flex items-center justify-center gap-2 rounded-xl border border-gold/30 bg-surface py-2.5 text-sm disabled:opacity-50"
        >
          <Download className="size-4" /> تحميل كصورة
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Canvas drawing — 1080 × 1350, 4:5 social portrait
// ───────────────────────────────────────────────────────────────────────

const RARITY_ACCENT: Record<AvatarRarity, string> = {
  common:    "#d4af37",
  uncommon:  "#34d399",
  rare:      "#38bdf8",
  epic:      "#a78bfa",
  legendary: "#f5d062",
};

interface CardData {
  displayName: string;
  username: string;
  title: string | null;
  level: number;
  xp: number;
  dinars: number;
  streak: number;
  campaigns_completed: number;
  artifacts_collected: number;
  discovery_pct: number;
  investigations_completed: number;
  achievements_total: number;
  top_achievements: IdentityCardAchievement[];
  generatedOn: string;
  emblemImg: HTMLImageElement | null;
  logoImg: HTMLImageElement | null;
  rarity: AvatarRarity;
  avatarName: string;
}

function drawCard(c: HTMLCanvasElement, s: CardData) {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const W = c.width, H = c.height;
  const accent = RARITY_ACCENT[s.rarity];

  // Deep navy → parchment vignette background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b1228");
  bg.addColorStop(1, "#050818");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const vg = ctx.createRadialGradient(W / 2, 480, 20, W / 2, 480, 520);
  vg.addColorStop(0, "rgba(212,175,55,0.16)");
  vg.addColorStop(1, "rgba(212,175,55,0)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // Elegant double border (parchment-document feel)
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

  // Header: Irth mark + title
  const logoSize = 96;
  const logoX = 96, logoY = 96;
  if (s.logoImg?.complete && s.logoImg.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(212,175,55,0.6)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 20;
    ctx.drawImage(s.logoImg, logoX, logoY, logoSize, logoSize);
    ctx.restore();
  }
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "22px system-ui";
  ctx.fillText("بطاقة الهوية التاريخية", logoX + logoSize + 24, logoY + 44);
  ctx.fillStyle = "rgba(212,175,55,0.9)";
  ctx.font = "bold 24px system-ui";
  ctx.fillText("Irth · إرث", logoX + logoSize + 24, logoY + 78);

  // Avatar disc, centred
  const cx = W / 2, ay = 380;
  const halo = ctx.createRadialGradient(cx, ay, 30, cx, ay, 240);
  halo.addColorStop(0, hexAlpha(accent, 0.35));
  halo.addColorStop(1, hexAlpha(accent, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(cx - 260, ay - 260, 520, 520);

  ctx.beginPath();
  ctx.arc(cx, ay, 148, 0, Math.PI * 2);
  const ag = ctx.createLinearGradient(cx - 140, ay - 140, cx + 140, ay + 140);
  ag.addColorStop(0, "#1a223d");
  ag.addColorStop(1, "#0b1228");
  ctx.fillStyle = ag;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, ay, 134, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(212,175,55,0.5)";
  ctx.stroke();

  if (s.emblemImg?.complete && s.emblemImg.naturalWidth > 0) {
    const emSize = 220;
    ctx.drawImage(s.emblemImg, cx - emSize / 2, ay - emSize / 2, emSize, emSize);
  }

  // Rarity ribbon
  const rarityText = RARITY_LABEL[s.rarity];
  ctx.font = "600 18px system-ui";
  const rw = ctx.measureText(rarityText).width + 40;
  const rx = cx - rw / 2, ry = ay + 158;
  roundRect(ctx, rx, ry, rw, 30, 14);
  ctx.fillStyle = hexAlpha(accent, 0.18);
  ctx.fill();
  ctx.strokeStyle = hexAlpha(accent, 0.7);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  ctx.fillText(rarityText, cx, ry + 21);

  // Display name + secondary handle
  ctx.fillStyle = "#fff";
  fitText(ctx, s.displayName, cx, ay + 260, W - 220, 58, 36, "bold", "system-ui");

  ctx.fillStyle = "#d4af37";
  ctx.font = "26px system-ui";
  const secondary = s.username && s.username !== s.displayName
    ? `@${s.username}`
    : (s.title ?? "مستكشف التاريخ");
  ctx.fillText(truncate(ctx, secondary, W - 260), cx, ay + 302);

  // Level pill
  const pillW = 280, pillH = 62;
  const px = cx - pillW / 2, py = ay + 336;
  roundRect(ctx, px, py, pillW, pillH, pillH / 2);
  const lg = ctx.createLinearGradient(px, py, px + pillW, py);
  lg.addColorStop(0, "#d4af37");
  lg.addColorStop(1, "#a07c1c");
  ctx.fillStyle = lg;
  ctx.fill();
  ctx.fillStyle = "#0b1228";
  ctx.font = "bold 30px system-ui";
  ctx.fillText(`المستوى ${s.level}`, cx, py + 42);

  // Primary stats grid (3 columns × 2 rows)
  const primaryRows: [string, string][] = [
    ["نقاط الخبرة", s.xp.toLocaleString("en-US")],
    ["الدنانير", s.dinars.toLocaleString("en-US")],
    ["اكتشاف الموسوعة", `${s.discovery_pct}%`],
    ["الحملات المكتملة", s.campaigns_completed.toLocaleString("en-US")],
    ["التحقيقات", s.investigations_completed.toLocaleString("en-US")],
    ["الآثار المجموعة", s.artifacts_collected.toLocaleString("en-US")],
  ];
  const gx = 96;
  const gw = W - 192;
  const cols = 3;
  const colW = (gw - 32) / cols;
  const rowH = 92;
  const gy = ay + 428;
  for (let i = 0; i < primaryRows.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const rxs = gx + col * (colW + 16);
    const rys = gy + row * (rowH + 14);
    roundRect(ctx, rxs, rys, colW, rowH, 20);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
    ctx.strokeStyle = "rgba(212,175,55,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "18px system-ui";
    ctx.fillText(primaryRows[i][0], rxs + colW / 2, rys + 34);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 30px system-ui";
    ctx.fillText(truncate(ctx, primaryRows[i][1], colW - 24), rxs + colW / 2, rys + 72);
  }

  // Achievements block (optional — only if we have data)
  const achY = gy + 2 * (rowH + 14) + 24;
  if (s.achievements_total > 0 || s.top_achievements.length > 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(212,175,55,0.9)";
    ctx.font = "bold 22px system-ui";
    ctx.fillText(`الإنجازات · ${s.achievements_total.toLocaleString("en-US")}`, cx, achY);

    if (s.top_achievements.length > 0) {
      const ax = 96;
      const aw = W - 192;
      const acolW = (aw - 32) / Math.max(1, Math.min(3, s.top_achievements.length));
      const ah = 70;
      const ayTop = achY + 24;
      for (let i = 0; i < s.top_achievements.length; i++) {
        const ac = s.top_achievements[i];
        const rxs = ax + i * (acolW + 16);
        roundRect(ctx, rxs, ayTop, acolW, ah, 16);
        ctx.fillStyle = "rgba(212,175,55,0.08)";
        ctx.fill();
        ctx.strokeStyle = "rgba(212,175,55,0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 20px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(truncate(ctx, ac.label, acolW - 24), rxs + acolW / 2, ayTop + 44);
      }
    }
  }

  // Streak line
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "20px system-ui";
  ctx.fillText(
    `السلسلة اليومية · ${s.streak.toLocaleString("en-US")} يوم`,
    cx,
    H - 148,
  );

  // Footer: tagline + generated date
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "bold 26px system-ui";
  ctx.fillText("رحلة عبر التاريخ الإسلامي", cx, H - 108);

  ctx.fillStyle = "rgba(212,175,55,0.75)";
  ctx.font = "16px system-ui";
  ctx.fillText(`صدرت في ${s.generatedOn}`, cx, H - 76);
}

// ───────────────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────────────

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
