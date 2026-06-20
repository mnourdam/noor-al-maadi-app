import { useEffect, useRef, useState } from "react";
import { Share2, Download, MessageCircle, Send } from "lucide-react";
import type { ProfileState } from "@/lib/profile";
import { derivePublicStats } from "@/lib/social";
import { getAvatar } from "@/lib/avatars";

/**
 * بطاقة الهوية التاريخية — Shareable Card
 * Renders a portrait PNG via canvas (no extra deps) and offers native + social share.
 */
export function ShareCard({ profile, username, referralCode }: {
  profile: ProfileState;
  username: string;
  referralCode?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const stats = derivePublicStats(profile);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    drawCard(c, { username, ...stats, avatarGlyph: getAvatar(profile.avatarId).glyph, referralCode: referralCode ?? "" });
    setDataUrl(c.toDataURL("image/png"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, profile.points, profile.streak, profile.dinars, profile.campaignsCompleted.length, profile.artifactsFound.length, profile.avatarId, referralCode]);

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

function drawCard(
  c: HTMLCanvasElement,
  s: {
    username: string; title: string | null; level: number; xp: number;
    campaigns_completed: number; artifacts_collected: number; discovery_pct: number;
    streak: number; favorite_state_id: string | null; referralCode: string; avatarGlyph: string;
  },
) {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const W = c.width, H = c.height;

  // ===== Background =====
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b1228");
  bg.addColorStop(1, "#060a18");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Outer gold frame
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 4;
  roundRect(ctx, 24, 24, W - 48, H - 48, 36);
  ctx.stroke();

  // Inner thin frame
  ctx.strokeStyle = "rgba(212,175,55,0.35)";
  ctx.lineWidth = 1;
  roundRect(ctx, 40, 40, W - 80, H - 80, 28);
  ctx.stroke();

  ctx.direction = "rtl";

  // ===== Header / brand =====
  ctx.textAlign = "left";
  ctx.fillStyle = "#d4af37";
  ctx.font = "bold 34px system-ui";
  ctx.fillText("إرث", 70, 100);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "18px system-ui";
  ctx.fillText("Irth · بطاقة الهوية التاريخية", 70, 128);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(212,175,55,0.85)";
  ctx.font = "16px system-ui";
  ctx.fillText("irth-app.lovable.app", W - 70, 110);

  // ===== Avatar disc =====
  const cx = W / 2;
  const ay = 280;
  // gold glow
  const glow = ctx.createRadialGradient(cx, ay, 10, cx, ay, 170);
  glow.addColorStop(0, "rgba(212,175,55,0.45)");
  glow.addColorStop(1, "rgba(212,175,55,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, ay - 170, W, 340);

  ctx.beginPath();
  ctx.arc(cx, ay, 105, 0, Math.PI * 2);
  const ag = ctx.createLinearGradient(cx - 100, ay - 100, cx + 100, ay + 100);
  ag.addColorStop(0, "#1a223d");
  ag.addColorStop(1, "#0b1228");
  ctx.fillStyle = ag;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#d4af37";
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "110px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji'";
  ctx.fillStyle = "#d4af37";
  ctx.fillText(s.avatarGlyph, cx, ay + 8);
  ctx.textBaseline = "alphabetic";

  // ===== Username + title =====
  ctx.fillStyle = "#fff";
  ctx.font = "bold 48px system-ui";
  ctx.fillText(truncate(ctx, s.username, W - 160), cx, ay + 175);

  ctx.fillStyle = "#d4af37";
  ctx.font = "22px system-ui";
  ctx.fillText(truncate(ctx, s.title ?? "مستكشف التاريخ", W - 200), cx, ay + 215);

  // ===== Level pill =====
  const pillW = 220, pillH = 56;
  const px = cx - pillW / 2;
  const py = ay + 250;
  roundRect(ctx, px, py, pillW, pillH, pillH / 2);
  const lg = ctx.createLinearGradient(px, py, px + pillW, py);
  lg.addColorStop(0, "#d4af37");
  lg.addColorStop(1, "#a07c1c");
  ctx.fillStyle = lg;
  ctx.fill();
  ctx.fillStyle = "#0b1228";
  ctx.font = "bold 26px system-ui";
  ctx.fillText(`المستوى ${s.level}`, cx, py + 38);

  // ===== Stats grid (2 columns × 4 rows) =====
  const stats: [string, string][] = [
    ["نقاط الخبرة", s.xp.toLocaleString("en-US")],
    ["السلسلة اليومية", `🔥 ${s.streak.toLocaleString("en-US")}`],
    ["الحملات المكتملة", s.campaigns_completed.toLocaleString("en-US")],
    ["الآثار المجموعة", s.artifacts_collected.toLocaleString("en-US")],
    ["اكتشاف الموسوعة", `${s.discovery_pct}%`],
    ["الدولة المفضلة", s.favorite_state_id || "—"],
  ];
  const gx = 70;
  const gw = W - 140;
  const colW = (gw - 16) / 2;
  const rowH = 90;
  const gy = ay + 340;
  for (let i = 0; i < stats.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const rx = gx + col * (colW + 16);
    const ry = gy + row * (rowH + 12);
    roundRect(ctx, rx, ry, colW, rowH, 18);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
    ctx.strokeStyle = "rgba(212,175,55,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "18px system-ui";
    ctx.fillText(stats[i][0], rx + colW / 2, ry + 32);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 30px system-ui";
    ctx.fillText(truncate(ctx, stats[i][1], colW - 24), rx + colW / 2, ry + 68);
  }

  // ===== Footer =====
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "bold 22px system-ui";
  ctx.fillText("انضم إلى رحلتك التاريخية في إرث", cx, H - 110);
  if (s.referralCode) {
    ctx.fillStyle = "#d4af37";
    ctx.font = "bold 26px system-ui";
    ctx.fillText(`رمز الدعوة · ${s.referralCode}`, cx, H - 72);
  }
}

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