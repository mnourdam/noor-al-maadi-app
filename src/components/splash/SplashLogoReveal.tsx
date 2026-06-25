// ============================================================
// Irth Opening Sequence — Logo Reveal
// ------------------------------------------------------------
// Small, deliberately understated component so it can be
// re-themed independently. No spin / no scale gimmicks.
// ============================================================

export function SplashLogoReveal() {
  return (
    <div className="flex flex-col items-center text-center">
      <img
        src="/irth-icon.png"
        alt="إرث"
        width={104}
        height={104}
        className="splash-logo-img drop-shadow-[0_0_30px_rgba(212,175,90,0.45)]"
      />
      <h1
        className="splash-logo-title font-display mt-5 text-[44px] font-bold tracking-[0.18em] text-[#f4e3b8]"
        style={{ textShadow: "0 0 24px rgba(212,175,90,0.35)" }}
      >
        إرث
      </h1>
      <p className="splash-logo-sub mt-3 text-[13px] tracking-[0.32em] text-[#d4af5a]/85">
        رحلة عبر التاريخ الإسلامي
      </p>
    </div>
  );
}
