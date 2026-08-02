/** 全幅氛围主视觉：都市霓虹剪影（CSS 绘制，无外链图） */
export function HeroCanvas() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="glow-orb absolute -right-24 top-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(61,224,208,0.35),transparent_70%)]" />
      <div className="glow-orb absolute -left-16 bottom-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(240,163,94,0.28),transparent_70%)]" />
      <svg
        className="absolute inset-x-0 bottom-0 h-[55%] w-full opacity-80"
        viewBox="0 0 1200 420"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="skyline" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a2838" />
            <stop offset="100%" stopColor="#0b1118" />
          </linearGradient>
        </defs>
        <rect x="0" y="180" width="1200" height="240" fill="url(#skyline)" />
        <g fill="#152232">
          <rect x="40" y="120" width="70" height="220" />
          <rect x="130" y="90" width="90" height="250" />
          <rect x="240" y="140" width="60" height="200" />
          <rect x="330" y="70" width="110" height="270" />
          <rect x="470" y="110" width="80" height="230" />
          <rect x="580" y="60" width="100" height="280" />
          <rect x="710" y="100" width="70" height="240" />
          <rect x="810" y="80" width="120" height="260" />
          <rect x="960" y="130" width="80" height="210" />
          <rect x="1070" y="95" width="90" height="245" />
        </g>
        <g stroke="#3de0d0" strokeWidth="1.2" opacity="0.55">
          <path d="M130 140 H210" />
          <path d="M330 110 H420" />
          <path d="M580 95 H660" />
          <path d="M810 120 H910" />
        </g>
        <g stroke="#f0a35e" strokeWidth="1" opacity="0.4">
          <path d="M240 180 H290" />
          <path d="M710 150 H760" />
          <path d="M960 170 H1020" />
        </g>
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[var(--bg-deep)] to-transparent" />
    </div>
  );
}
