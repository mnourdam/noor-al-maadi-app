import { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Share2, Download, MessageCircle, Send } from "lucide-react";
import type { ProfileState } from "@/lib/profile";
import { derivePublicStats } from "@/lib/social";
import { getAvatar, RARITY_LABEL, type AvatarRarity } from "@/lib/avatars";
import { AvatarArt } from "./AvatarArt";

/**
 * بطاقة الهوية التاريخية — Shareable Card
 *
 * One of Irth's primary marketing surfaces. Renders a portrait PNG via
 * canvas (no extra deps), embeds the official Irth logo, the player's
 * vector emblem, and a stats block. The layout reserves space for future
 * badges, medals, and seasonal decorations so we don't have to redesign it.
 *
 * No raw URLs are ever drawn into the image — sharing happens through the
 * Web Share API and platform buttons below the card.
 */
export function ShareCard({ profile, username, referralCode, decorations = [] }: {
  profile: ProfileState;
  username: string;
  referralCode?: string | null;
  /** Future expansion: badge / medal / seasonal-decoration ids. */
  decorations?: string[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const stats = derivePublicStats(profile);
  const avatar = getAvatar(profile.avatarId);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    let cancelled = false;
    (async () => {
      const [logoImg, emblemImg] = await Promise.all([
        loadImage("/irth-icon.png"),
        loadImage(svgDataUrl(renderToStaticMarkup(<AvatarArt id={avatar.id} />))),
      ]);
      if (cancelled) return;
      drawCard(c, {
        username,
        ...stats,
        emblemImg,
        logoImg,
        rarity: avatar.rarity,
        avatarName: avatar.name,
        referralCode: referralCode ?? "",
        decorations,
      });
      setDataUrl(c.toDataURL("image/png"));
    })().catch(() => { /* drawing failed — leave empty canvas */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, profile.points, profile.streak, profile.dinars, profile.campaignsCompleted.length, profile.artifactsFound.length, profile.avatarId, referralCode, decorations.join(",")]);

  const shareText = `بطاقتي التاريخية في إرث — المستوى ${stats.level} • ${stats.xp} XP\nانضم إلى رحلتك التاريخية في إرث`;
  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/auth${referralCode ? `?ref=${referralCode}` : ""}`
    : "";

  async function nativeShare() {
    if (!dataUrl) return;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "irth-card.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText, url: shareUrl });
        return;
      }
      await navigator.share?.({ text: shareText, url: shareUrl });
    } catch { /* user cancelled */ }
  }

  function download() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `irth-${username}.png`;
    a.click();
  }

  const enc = encodeURIComponent;
  const wa = `https://wa.me/?text=${enc(shareText + " " + shareUrl)}`;
  const tg = `https://t.me/share/url?url=${enc(shareUrl)}&text=${enc(shareText)}`;
  const x  = `https://twitter.com/intent/tweet?text=${enc(shareText)}&url=${enc(shareUrl)}`;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${enc(shareUrl)}`;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-gold/30 bg-black/40 p-2">
        <canvas ref={canvasRef} width={720} height={1080} className="block w-full rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={nativeShare} className="flex items-center justify-center gap-2 rounded-xl bg-gradient-gold py-2.5 text-sm font-bold text-primary-foreground shadow-gold">
          <Share2 className="size-4" /> مشاركة
        </button>
        <button onClick={download} className="flex items-center justify-center gap-2 rounded-xl border border-gold/30 bg-surface py-2.5 text-sm">
          <Download className="size-4" /> تنزيل
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2 text-[11px]">
        <a href={wa} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-surface py-2">
          <MessageCircle className="size-4 text-emerald-400" /> واتساب
        </a>
        <a href={tg} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-surface py-2">
          <Send className="size-4 text-sky-400" /> تيليغرام
        </a>
        <a href={x} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-surface py-2">
          <span className="font-bold">X</span>
        </a>
        <a href={fb} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-surface py-2">
          <span className="font-bold text-sky-500">f</span> فيسبوك
        </a>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Canvas drawing
// ───────────────────────────────────────────────────────────────────────

/** Rarity → outer-frame accent colour, mirroring the in-app ring system. */
const RARITY_ACCENT: Record<AvatarRarity, string> = {
  common:    "#d4af37",
  uncommon:  "#34d399",
  rare:      "#38bdf8",
  epic:      "#a78bfa",
  legendary: "#f5d062",
};

interface CardData {
  username: string; title: string | null; level: number; xp: number;
  campaigns_completed: number; artifacts_collected: number; discovery_pct: number;
  streak: number; favorite_state_id: string | null; referralCode: string;
  emblemImg: HTMLImageElement; logoImg: HTMLImageElement;
  rarity: AvatarRarity; avatarName: string;
  decorations: string[];
}

function drawCard(c: HTMLCanvasElement, s: CardData) {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const W = c.width, H = c.height;
  const accent = RARITY_ACCENT[s.rarity];

  // ===== Background =====
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b1228");
  bg.addColorStop(1, "#060a18");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle radial vignette behind the emblem.
  const vg = ctx.createRadialGradient(W / 2, 380, 10, W / 2, 380, 380);
  vg.addColorStop(0, "rgba(212,175,55,0.18)");
  vg.addColorStop(1, "rgba(212,175,55,0)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // Outer rarity-tinted frame
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  roundRect(ctx, 24, 24, W - 48, H - 48, 36);
  ctx.stroke();

  // Inner thin gold frame
  ctx.strokeStyle = "rgba(212,175,55,0.35)";
  ctx.lineWidth = 1;
  roundRect(ctx, 40, 40, W - 80, H - 80, 28);
  ctx.stroke();

  ctx.direction = "rtl";
  ctx.textBaseline = "alphabetic";

  // ===== Header: logo (upper-left) + small caption =====
  const logoSize = 72;
  const logoX = 64;
  const logoY = 64;
  if (s.logoImg.complete && s.logoImg.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 4, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(212,175,55,0.6)";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Soft drop shadow under the mark.
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

  // ===== Avatar disc (centre) =====
  const cx = W / 2;
  const ay = 340;
  const ringR = 130;

  // Rarity halo
  const halo = ctx.createRadialGradient(cx, ay, 20, cx, ay, ringR + 60);
  halo.addColorStop(0, hexAlpha(accent, 0.35));
  halo.addColorStop(1, hexAlpha(accent, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(cx - ringR - 80, ay - ringR - 80, (ringR + 80) * 2, (ringR + 80) * 2);

  // Disc
  ctx.beginPath();
  ctx.arc(cx, ay, 108, 0, Math.PI * 2);
  const ag = ctx.createLinearGradient(cx - 100, ay - 100, cx + 100, ay + 100);
  ag.addColorStop(0, "#1a223d");
  ag.addColorStop(1, "#0b1228");
  ctx.fillStyle = ag;
  ctx.fill();

  // Outer rarity ring + inner gold ring
  ctx.lineWidth = 4;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, ay, 98, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(212,175,55,0.5)";
  ctx.stroke();

  // Emblem SVG inside disc
  const emSize = 160;
  ctx.drawImage(s.emblemImg, cx - emSize / 2, ay - emSize / 2, emSize, emSize);

  // Rarity ribbon below disc
  const rarityText = RARITY_LABEL[s.rarity];
  ctx.font = "600 14px system-ui";
  const rw = ctx.measureText(rarityText).width + 28;
  const rx = cx - rw / 2;
  const ry = ay + 118;
  roundRect(ctx, rx, ry, rw, 24, 12);
  ctx.fillStyle = hexAlpha(accent, 0.18);
  ctx.fill();
  ctx.strokeStyle = hexAlpha(accent, 0.7);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  ctx.fillText(rarityText, cx, ry + 17);

  // ===== Username + title =====
  ctx.fillStyle = "#fff";
  ctx.font = "bold 46px system-ui";
  ctx.fillText(truncate(ctx, s.username, W - 160), cx, ay + 200);

  ctx.fillStyle = "#d4af37";
  ctx.font = "22px system-ui";
  ctx.fillText(truncate(ctx, s.title ?? "مستكشف التاريخ", W - 200), cx, ay + 236);

  // ===== Level pill =====
  const pillW = 220, pillH = 52;
  const px = cx - pillW / 2;
  const py = ay + 264;
  roundRect(ctx, px, py, pillW, pillH, pillH / 2);
  const lg = ctx.createLinearGradient(px, py, px + pillW, py);
  lg.addColorStop(0, "#d4af37");
  lg.addColorStop(1, "#a07c1c");
  ctx.fillStyle = lg;
  ctx.fill();
  ctx.fillStyle = "#0b1228";
  ctx.font = "bold 24px system-ui";
  ctx.fillText(`المستوى ${s.level}`, cx, py + 35);

  // ===== Stats grid (2 × 3) =====
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
  const rowH = 82;
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
    ctx.fillText(statsRows[i][0], rxs + colW / 2, rys + 30);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 28px system-ui";
    ctx.fillText(truncate(ctx, statsRows[i][1], colW - 24), rxs + colW / 2, rys + 62);
  }

  // ===== Decoration slots (future badges / medals / seasonal) =====
  // Always rendered so the card layout stays stable as items get added.
  const slotCount = 5;
  const slotSize = 44;
  const slotGap = 14;
  const slotsW = slotCount * slotSize + (slotCount - 1) * slotGap;
  const sxStart = cx - slotsW / 2;
  const syRow = H - 168;
  for (let i = 0; i < slotCount; i++) {
    const xs = sxStart + i * (slotSize + slotGap);
    ctx.beginPath();
    ctx.arc(xs + slotSize / 2, syRow + slotSize / 2, slotSize / 2, 0, Math.PI * 2);
    const filled = i < s.decorations.length;
    ctx.fillStyle = filled ? hexAlpha(accent, 0.15) : "rgba(255,255,255,0.025)";
    ctx.fill();
    ctx.strokeStyle = filled ? hexAlpha(accent, 0.7) : "rgba(212,175,55,0.18)";
    ctx.lineWidth = filled ? 1.5 : 1;
    ctx.setLineDash(filled ? [] : [2, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ===== Footer =====
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "bold 22px system-ui";
  ctx.fillText("انضم إلى رحلتك التاريخية في إرث", cx, H - 96);
  if (s.referralCode) {
    // Referral stamp — code only, no URL.
    const stampW = 260, stampH = 44;
    const stx = cx - stampW / 2;
    const sty = H - 80;
    roundRect(ctx, stx, sty, stampW, stampH, 10);
    ctx.fillStyle = "rgba(212,175,55,0.1)";
    ctx.fill();
    ctx.strokeStyle = "rgba(212,175,55,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#d4af37";
    ctx.font = "bold 20px system-ui";
    ctx.fillText(`رمز الدعوة · ${s.referralCode}`, cx, sty + 29);
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
  // unicode-safe base64 encoding
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
