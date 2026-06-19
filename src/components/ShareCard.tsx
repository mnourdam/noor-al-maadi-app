import { useEffect, useRef, useState } from "react";
import { Share2, Download, MessageCircle, Send } from "lucide-react";
import type { ProfileState } from "@/lib/profile";
import { derivePublicStats } from "@/lib/social";

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
    drawCard(c, { username, ...stats, referralCode: referralCode ?? "" });
    setDataUrl(c.toDataURL("image/png"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, profile.points, profile.streak, profile.dinars, profile.campaignsCompleted.length, profile.artifactsFound.length, referralCode]);

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
    streak: number; favorite_state_id: string | null; referralCode: string;
  },
) {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const W = c.width, H = c.height;

  // Background: dark navy gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b1228");
  bg.addColorStop(1, "#060a18");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Gold border
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 6;
  roundRect(ctx, 24, 24, W - 48, H - 48, 36);
  ctx.stroke();

  // Decorative gold glow
  const glow = ctx.createRadialGradient(W / 2, 220, 20, W / 2, 220, 320);
  glow.addColorStop(0, "rgba(212,175,55,0.35)");
  glow.addColorStop(1, "rgba(212,175,55,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.direction = "rtl";
  ctx.textAlign = "center";

  // Brand
  ctx.fillStyle = "#d4af37";
  ctx.font = "bold 38px system-ui";
  ctx.fillText("إرث", W / 2, 110);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "20px system-ui";
  ctx.fillText("بطاقة الهوية التاريخية", W / 2, 150);

  // Username
  ctx.fillStyle = "#fff";
  ctx.font = "bold 56px system-ui";
  ctx.fillText(s.username, W / 2, 260);

  // Title
  ctx.fillStyle = "#d4af37";
  ctx.font = "28px system-ui";
  ctx.fillText(s.title ?? "مستكشف التاريخ", W / 2, 310);

  // Level badge
  ctx.beginPath();
  ctx.arc(W / 2, 430, 80, 0, Math.PI * 2);
  const lg = ctx.createLinearGradient(W / 2 - 80, 350, W / 2 + 80, 510);
  lg.addColorStop(0, "#d4af37");
  lg.addColorStop(1, "#a07c1c");
  ctx.fillStyle = lg;
  ctx.fill();
  ctx.fillStyle = "#0b1228";
  ctx.font = "bold 56px system-ui";
  ctx.fillText(String(s.level), W / 2, 450);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "20px system-ui";
  ctx.fillText("المستوى", W / 2, 540);

  // Stats grid
  const rows: [string, string][] = [
    ["نقاط الخبرة", s.xp.toString()],
    ["الحملات المكتملة", s.campaigns_completed.toString()],
    ["الآثار المجموعة", s.artifacts_collected.toString()],
    ["اكتشاف الموسوعة", `${s.discovery_pct}%`],
    ["السلسلة اليومية", `🔥 ${s.streak}`],
    ["الدولة المفضلة", s.favorite_state_id || "—"],
  ];
  let y = 620;
  ctx.font = "22px system-ui";
  for (const [label, value] of rows) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.textAlign = "right";
    ctx.fillText(label, W - 70, y);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.fillText(value, 70, y);
    y += 50;
  }

  // Footer CTA
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "bold 24px system-ui";
  ctx.fillText("انضم إلى رحلتك التاريخية في إرث", W / 2, H - 110);
  if (s.referralCode) {
    ctx.fillStyle = "#d4af37";
    ctx.font = "bold 28px system-ui";
    ctx.fillText(s.referralCode, W / 2, H - 70);
  }
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