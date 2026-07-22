import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import QRCode from "qrcode";
import { Share2, Download, Send, Copy } from "lucide-react";
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
import {
  buildReferralUrl,
  buildPublicProfileUrl,
} from "@/lib/share/publicOrigin";
import {
  shareImage,
  downloadImage,
  copyToClipboard,
} from "@/lib/share/shareService";

/**
 * بطاقة الهوية التاريخية — Shareable Card
 *
 * Renders a 720×1080 portrait PNG via canvas: player emblem, display name,
 * stats block, decoration slots, and a scannable QR code that encodes the
 * exact referral URL shown in the referral tab. All share/download actions
 * flow through the centralized share service so behaviour is identical
 * across surfaces.
 */
export function ShareCard({
  profile,
  username,
  displayNameSources,
  referralCode,
  decorations = [],
}: {
  profile: ProfileState;
  username: string;
  /** Sources for the centralized display-name resolver. Preferred over `username`. */
  displayNameSources?: DisplayNameSources;
  referralCode?: string | null;
  decorations?: string[];
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

  const referralUrl = useMemo(
    () => (referralCode ? buildReferralUrl(referralCode) : null),
    [referralCode],
  );
  const profileUrl = useMemo(
    () => buildPublicProfileUrl(username),
    [username],
  );

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    let cancelled = false;
    setReady(false);
    (async () => {
      // Wait for web fonts to settle so Arabic text measures/renders correctly.
      try { await (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready; } catch { /* ignore */ }
      const [logoImg, emblemImg, qrImg] = await Promise.all([
        loadImage("/irth-icon.png").catch(() => null),
        loadImage(svgDataUrl(renderToStaticMarkup(<AvatarArt id={avatar.id} />))).catch(() => null),
        referralUrl ? loadQr(referralUrl).catch(() => null) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      drawCard(c, {
        displayName,
        username,
        ...stats,
        emblemImg,
        logoImg,
        qrImg,
        rarity: avatar.rarity,
        avatarName: avatar.name,
        referralCode: referralCode ?? "",
        decorations,
      });
      setReady(true);
    })().catch(() => { setReady(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName, username, profile.points, profile.streak, profile.dinars,
      profile.campaignsCompleted.length, profile.artifactsFound.length,
      profile.avatarId, referralCode, referralUrl, decorations.join(",")]);

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
      fallbackUrl: profileUrl ?? referralUrl,
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

  async function onCopyLink() {
    const url = referralUrl ?? profileUrl;
    if (!url) { toast.error("الرابط غير متاح حاليًا"); return; }
    const ok = await copyToClipboard(url);
    if (ok) toast.success("تم نسخ الرابط");
    else toast.error("تعذّر النسخ");
  }

  // Only render icons that route through valid platform share URLs. Every
  // icon uses a consistent lucide vector at a fixed size to avoid the
  // stretched-raster problem the previous grid had.
  const enc = encodeURIComponent;
  const platforms: { key: string; label: string; href: string; icon: React.ReactNode }[] = [];
  if (referralUrl) {
    const msg = `${shareText}\n${referralUrl}`;
    platforms.push({ key: "wa", label: "واتساب", href: `https://wa.me/?text=${enc(msg)}`, icon: <PlatformGlyph>W</PlatformGlyph> });
    platforms.push({ key: "tg", label: "تيليغرام", href: `https://t.me/share/url?url=${enc(referralUrl)}&text=${enc(shareText)}`, icon: <Send className="size-4" /> });
    platforms.push({ key: "x", label: "X", href: `https://twitter.com/intent/tweet?text=${enc(shareText)}&url=${enc(referralUrl)}`, icon: <PlatformGlyph>X</PlatformGlyph> });
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-gold/30 bg-black/40 p-2">
        <canvas
          ref={canvasRef}
          width={720}
          height={1080}
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
          <Share2 className="size-4" /> مشاركة
        </button>
        <button
          onClick={onDownload}
          disabled={!ready}
          className="flex items-center justify-center gap-2 rounded-xl border border-gold/30 bg-surface py-2.5 text-sm disabled:opacity-50"
        >
          <Download className="size-4" /> تنزيل
        </button>
      </div>

      {(referralUrl || profileUrl) && (
        <button
          onClick={onCopyLink}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-surface py-2 text-[12px] text-muted-foreground"
        >
          <Copy className="size-3.5" /> نسخ رابط الدعوة
        </button>
      )}

      {platforms.length > 0 && (
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          {platforms.map((p) => (
            <a
              key={p.key}
              href={p.href}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-surface py-2 text-muted-foreground hover:bg-surface/80"
            >
              <span className="grid size-6 place-items-center rounded-full bg-gold/10 text-gold">{p.icon}</span>
              {p.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// Uniform small square glyph so single-letter brand marks share the same
// visual weight as lucide icons in the row.
function PlatformGlyph({ children }: { children: React.ReactNode }) {
  return <span className="text-[12px] font-bold leading-none">{children}</span>;
}

// ───────────────────────────────────────────────────────────────────────
// Canvas drawing
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
  title: string | null; level: number; xp: number;
  campaigns_completed: number; artifacts_collected: number; discovery_pct: number;
  streak: number; favorite_state_id: string | null; referralCode: string;
  emblemImg: HTMLImageElement | null;
  logoImg: HTMLImageElement | null;
  qrImg: HTMLImageElement | null;
  rarity: AvatarRarity; avatarName: string;
  decorations: string[];
}

function drawCard(c: HTMLCanvasElement, s: CardData) {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const W = c.width, H = c.height;
  const accent = RARITY_ACCENT[s.rarity];

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b1228");
  bg.addColorStop(1, "#060a18");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const vg = ctx.createRadialGradient(W / 2, 380, 10, W / 2, 380, 380);
  vg.addColorStop(0, "rgba(212,175,55,0.18)");
  vg.addColorStop(1, "rgba(212,175,55,0)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  roundRect(ctx, 24, 24, W - 48, H - 48, 36);
  ctx.stroke();
  ctx.strokeStyle = "rgba(212,175,55,0.35)";
  ctx.lineWidth = 1;
  roundRect(ctx, 40, 40, W - 80, H - 80, 28);
  ctx.stroke();

  ctx.direction = "rtl";
  ctx.textBaseline = "alphabetic";

  // Header
  const logoSize = 72;
  const logoX = 64, logoY = 64;
  if (s.logoImg?.complete && s.logoImg.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 4, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(212,175,55,0.6)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 18;
    ctx.drawImage(s.logoImg, logoX, logoY, logoSize, logoSize);
    ctx.restore();
  }
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "16px system-ui";
  ctx.fillText("بطاقة الهوية التاريخية", logoX + logoSize + 16, logoY + 34);
  ctx.fillStyle = "rgba(212,175,55,0.85)";
  ctx.font = "bold 18px system-ui";
  ctx.fillText("Irth · إرث", logoX + logoSize + 16, logoY + 58);

  // Avatar disc
  const cx = W / 2, ay = 340, ringR = 130;
  const halo = ctx.createRadialGradient(cx, ay, 20, cx, ay, ringR + 60);
  halo.addColorStop(0, hexAlpha(accent, 0.35));
  halo.addColorStop(1, hexAlpha(accent, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(cx - ringR - 80, ay - ringR - 80, (ringR + 80) * 2, (ringR + 80) * 2);

  ctx.beginPath();
  ctx.arc(cx, ay, 108, 0, Math.PI * 2);
  const ag = ctx.createLinearGradient(cx - 100, ay - 100, cx + 100, ay + 100);
  ag.addColorStop(0, "#1a223d");
  ag.addColorStop(1, "#0b1228");
  ctx.fillStyle = ag;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, ay, 98, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(212,175,55,0.5)";
  ctx.stroke();

  if (s.emblemImg?.complete && s.emblemImg.naturalWidth > 0) {
    const emSize = 160;
    ctx.drawImage(s.emblemImg, cx - emSize / 2, ay - emSize / 2, emSize, emSize);
  }

  // Rarity ribbon
  const rarityText = RARITY_LABEL[s.rarity];
  ctx.font = "600 14px system-ui";
  const rw = ctx.measureText(rarityText).width + 28;
  const rx = cx - rw / 2, ry = ay + 118;
  roundRect(ctx, rx, ry, rw, 24, 12);
  ctx.fillStyle = hexAlpha(accent, 0.18);
  ctx.fill();
  ctx.strokeStyle = hexAlpha(accent, 0.7);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  ctx.fillText(rarityText, cx, ry + 17);

  // Display name (never the raw username when a display name exists) +
  // secondary handle. Auto-fit so long Arabic names never overflow.
  ctx.fillStyle = "#fff";
  fitText(ctx, s.displayName, cx, ay + 200, W - 160, 46, 28, "bold", "system-ui");

  ctx.fillStyle = "#d4af37";
  ctx.font = "22px system-ui";
  const secondary = s.username && s.username !== s.displayName ? `@${s.username}` : (s.title ?? "مستكشف التاريخ");
  ctx.fillText(truncate(ctx, secondary, W - 200), cx, ay + 236);

  // Level pill
  const pillW = 220, pillH = 52;
  const px = cx - pillW / 2, py = ay + 264;
  roundRect(ctx, px, py, pillW, pillH, pillH / 2);
  const lg = ctx.createLinearGradient(px, py, px + pillW, py);
  lg.addColorStop(0, "#d4af37");
  lg.addColorStop(1, "#a07c1c");
  ctx.fillStyle = lg;
  ctx.fill();
  ctx.fillStyle = "#0b1228";
  ctx.font = "bold 24px system-ui";
  ctx.fillText(`المستوى ${s.level}`, cx, py + 35);

  // Stats grid
  const statsRows: [string, string][] = [
    ["نقاط الخبرة", s.xp.toLocaleString("en-US")],
    ["السلسلة اليومية", `${s.streak.toLocaleString("en-US")} يوم`],
    ["الحملات المكتملة", s.campaigns_completed.toLocaleString("en-US")],
    ["الآثار المجموعة", s.artifacts_collected.toLocaleString("en-US")],
    ["اكتشاف الموسوعة", `${s.discovery_pct}%`],
    ["الدولة المفضلة", s.favorite_state_id || "—"],
  ];
  const gx = 70;
  const gw = W - 140;
  const colW = (gw - 16) / 2;
  const rowH = 78;
  const gy = ay + 340;
  for (let i = 0; i < statsRows.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const rxs = gx + col * (colW + 16);
    const rys = gy + row * (rowH + 12);
    roundRect(ctx, rxs, rys, colW, rowH, 18);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
    ctx.strokeStyle = "rgba(212,175,55,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "16px system-ui";
    ctx.fillText(statsRows[i][0], rxs + colW / 2, rys + 28);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 26px system-ui";
    ctx.fillText(truncate(ctx, statsRows[i][1], colW - 24), rxs + colW / 2, rys + 60);
  }

  // ===== QR code + referral stamp =====
  // Square white-plate QR with generous quiet zone — no logo or decorative
  // shape covers the QR modules. Positioned lower-right, mirrored by a
  // stamp on the lower-left so the layout stays balanced. Skipped if we
  // don't have a public referral URL to encode.
  const footerY = H - 240;
  if (s.qrImg?.complete && s.qrImg.naturalWidth > 0) {
    const qrSize = 168;
    const qrPad = 16;
    const qrX = W - 70 - qrSize - qrPad;
    const qrY = footerY;
    // White plate (quiet zone).
    roundRect(ctx, qrX - qrPad, qrY - qrPad, qrSize + qrPad * 2, qrSize + qrPad * 2, 14);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = hexAlpha(accent, 0.5);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Preserve the QR aspect ratio — never stretch.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s.qrImg, qrX, qrY, qrSize, qrSize);
    ctx.imageSmoothingEnabled = true;
    // Caption
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "13px system-ui";
    ctx.fillText("امسح للانضمام", qrX + qrSize / 2, qrY + qrSize + 32);
  }

  // Decoration slots (mirrored on left of the QR)
  const slotCount = 5;
  const slotSize = 36;
  const slotGap = 12;
  const slotsCol = 70;
  const slotsTop = footerY;
  for (let i = 0; i < slotCount; i++) {
    const ys = slotsTop + i * (slotSize + slotGap);
    ctx.beginPath();
    ctx.arc(slotsCol + slotSize / 2, ys + slotSize / 2, slotSize / 2, 0, Math.PI * 2);
    const filled = i < s.decorations.length;
    ctx.fillStyle = filled ? hexAlpha(accent, 0.15) : "rgba(255,255,255,0.025)";
    ctx.fill();
    ctx.strokeStyle = filled ? hexAlpha(accent, 0.7) : "rgba(212,175,55,0.18)";
    ctx.lineWidth = filled ? 1.5 : 1;
    ctx.setLineDash(filled ? [] : [2, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Footer tagline + code stamp
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "bold 22px system-ui";
  ctx.fillText("انضم إلى رحلتك التاريخية في إرث", cx, H - 78);
  if (s.referralCode) {
    const stampW = 260, stampH = 40;
    const stx = cx - stampW / 2, sty = H - 60;
    roundRect(ctx, stx, sty, stampW, stampH, 10);
    ctx.fillStyle = "rgba(212,175,55,0.1)";
    ctx.fill();
    ctx.strokeStyle = "rgba(212,175,55,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#d4af37";
    ctx.font = "bold 18px system-ui";
    ctx.fillText(`رمز الدعوة · ${s.referralCode}`, cx, sty + 27);
  }
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

/** Draw text centred at (x,y), shrinking the font-size step-by-step until
 *  it fits within maxWidth. Guarantees long Arabic names never overflow. */
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

async function loadQr(url: string): Promise<HTMLImageElement> {
  // Medium error-correction. `margin` in the `qrcode` library is in QR
  // modules, so 4 is exactly the ISO/IEC 18004 quiet-zone requirement.
  // Scale is in pixels-per-module — keep the QR module-aligned so it never
  // gets scaled with interpolation on the card canvas.
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 4,
    scale: 8,
    color: { dark: "#0b1228", light: "#ffffff" },
  });
  return loadImage(dataUrl);
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
