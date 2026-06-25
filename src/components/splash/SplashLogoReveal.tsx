// ============================================================
// Irth Opening Sequence — Logo
// ------------------------------------------------------------
// Renders the official transparent-PNG logo as-is. No container,
// no background, no halo — only a soft drop-shadow glow.
// ============================================================

export function SplashLogoReveal() {
  return (
    <img
      src="/assets/splash/irth-logo.png"
      alt="Irth"
      width={128}
      height={128}
      className="splash-logo-img"
      style={{ filter: "drop-shadow(0 0 28px rgba(212,175,90,0.45))" }}
    />
  );
}
