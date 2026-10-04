import { Parallax } from "@/components/fx/Parallax";

/**
 * 全幅主视觉：新艾利都夜街（纯 SVG / CSS 绘制，无外链图）
 * 层次：天空网点 → 半调月盘 / 飞艇 / 高架轻轨(视差远) → 远景楼群 → 彩旗电线 → 中景楼与霓虹灯牌(视差中)
 *       → 路灯/店面/路面车灯拖影(视差近) → 雨丝 → 暗角
 * dim 为门禁页使用：整体压暗，让表单更突出
 */
export function HeroCanvas({ dim = false }: { dim?: boolean }) {
  /* 彩旗：沿一根从 (0,300) 到 (1440,250) 的直电线等距挂 26 面，四色循环 */
  const flagColors = ["#f0a35e", "#3de0d0", "#f1ebdc", "#ff5c7a"];
  const flags = Array.from({ length: 26 }, (_, i) => {
    const x = 10 + i * 56;
    const y = 300 - (50 * x) / 1440;
    return { x, y, color: flagColors[i % 4] };
  });

  return (
    <Parallax className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden
      >
        <defs>
          {/* 天空 */}
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#080b11" />
            <stop offset="36%" stopColor="#0c1420" />
            <stop offset="66%" stopColor="#102029" />
            <stop offset="100%" stopColor="#0a0e14" />
          </linearGradient>
          {/* 天顶那层偏紫的夜色，压住原本发空的上三分之一 */}
          <linearGradient id="skyTop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2b1733" stopOpacity="0.45" />
            <stop offset="60%" stopColor="#1a1430" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#0a0e14" stopOpacity="0" />
          </linearGradient>
          {/* 远处城市天际的余光 */}
          <radialGradient id="skyglow" cx="0.5" cy="0.72" r="0.64">
            <stop offset="0%" stopColor="#1f968e" stopOpacity="0.4" />
            <stop offset="55%" stopColor="#13303a" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#0a0e14" stopOpacity="0" />
          </radialGradient>
          {/* 探照灯光束 */}
          <linearGradient id="beam" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#9fe8e0" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#9fe8e0" stopOpacity="0" />
          </linearGradient>
          {/* 路面 */}
          <linearGradient id="road" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b1017" />
            <stop offset="100%" stopColor="#05070a" />
          </linearGradient>
          {/* 窗格：冷光 / 暖光 / 熄灯遮罩 */}
          <pattern id="winA" width="14" height="18" patternUnits="userSpaceOnUse">
            <rect x="3" y="4" width="5" height="7" fill="#9fe8e0" opacity="0.3" />
          </pattern>
          <pattern id="winB" width="16" height="20" patternUnits="userSpaceOnUse">
            <rect x="4" y="5" width="5" height="6" fill="#ffd39a" opacity="0.28" />
            <rect x="11" y="12" width="3" height="5" fill="#9fe8e0" opacity="0.16" />
          </pattern>
          <pattern id="winOff" width="46" height="58" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="18" height="22" fill="#0b1119" />
            <rect x="26" y="30" width="20" height="18" fill="#0b1119" />
          </pattern>
          {/* 半调网点 */}
          <pattern id="dots" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="1.5" fill="#ffffff" opacity="0.14" />
          </pattern>
          <pattern id="dotsCyan" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="3.5" cy="3.5" r="1.6" fill="#3de0d0" opacity="0.55" />
          </pattern>
          {/* 贴身楼体上的细网点 */}
          <pattern id="dotsFaint" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="3.5" cy="3.5" r="1.1" fill="#ffffff" opacity="0.06" />
          </pattern>
          {/* 半调月盘用的琥珀网点 */}
          <pattern id="dotsMoon" width="9" height="9" patternUnits="userSpaceOnUse">
            <circle cx="4.5" cy="4.5" r="2.2" fill="#f0a35e" opacity="0.32" />
          </pattern>
          {/* 轻轨车窗分格 */}
          <pattern id="trainWin" width="12" height="10" patternUnits="userSpaceOnUse">
            <rect x="9" y="0" width="3" height="10" fill="#121c27" />
          </pattern>
          {/* 车灯拖影：头灯暖白 / 尾灯红 */}
          <linearGradient id="trailWarm" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffe7c2" stopOpacity="0" />
            <stop offset="70%" stopColor="#ffe7c2" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="trailRed" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ff5c7a" stopOpacity="0.95" />
            <stop offset="30%" stopColor="#ff5c7a" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ff5c7a" stopOpacity="0" />
          </linearGradient>
          {/* 顶部网点渐隐 */}
          <linearGradient id="fadeDown" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="topFade">
            <rect width="1440" height="420" fill="url(#fadeDown)" />
          </mask>
          {/* 霓虹发光 */}
          <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glowBig" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          {/* 湿路反光的模糊 */}
          <filter id="wet" x="-20%" y="-20%" width="140%" height="160%">
            <feGaussianBlur stdDeviation="7 2" />
          </filter>
          <linearGradient id="reflFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="reflMask">
            <rect x="0" y="700" width="1440" height="200" fill="url(#reflFade)" />
          </mask>
          {/* 路灯光锥 */}
          <radialGradient id="lamp" cx="0.5" cy="0" r="0.75">
            <stop offset="0%" stopColor="#ffc98a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffc98a" stopOpacity="0" />
          </radialGradient>
          {/* 暗角 */}
          <radialGradient id="vignette" cx="0.5" cy="0.55" r="0.78">
            <stop offset="55%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.72" />
          </radialGradient>
        </defs>

        {/* 天空 */}
        <rect width="1440" height="900" fill="url(#sky)" />
        <rect width="1440" height="520" fill="url(#skyTop)" />
        <rect width="1440" height="900" fill="url(#skyglow)" />
        <rect width="1440" height="420" fill="url(#dots)" mask="url(#topFade)" />

        {/* 天空层：半调月盘 / 飞艇 / 高架轻轨（填满原本空着的上三分之一） */}
        <g className="plx-far">
          {/* 探照灯：两道从天际扫上来的光束 */}
          <polygon points="470,640 372,120 436,120" fill="url(#beam)" />
          <polygon points="1160,640 1248,140 1196,140" fill="url(#beam)" opacity="0.8" />

          {/* 半调月盘：挪到左上，撑住标题上方那块天 */}
          <circle cx="338" cy="235" r="205" fill="#f0a35e" opacity="0.07" />
          <circle cx="338" cy="235" r="205" fill="url(#dotsMoon)" opacity="0.85" />
          <circle cx="338" cy="235" r="205" fill="none" stroke="#f0a35e" strokeWidth="2" opacity="0.26" />
          <circle cx="338" cy="235" r="228" fill="none" stroke="#f0a35e" strokeWidth="1" strokeDasharray="4 12" opacity="0.2" />

          {/* 飞艇：VOL.01（压在月盘前面飞过） */}
          <g className="blimp">
            <polygon points="214,168 176,154 182,188 216,184" fill="#121c27" stroke="#263546" strokeWidth="1.5" />
            <ellipse cx="300" cy="176" rx="96" ry="30" fill="#121c27" stroke="#263546" strokeWidth="1.5" />
            <ellipse cx="300" cy="176" rx="96" ry="30" fill="url(#dots)" opacity="0.6" />
            <path d="M206 176 H394" stroke="#f0a35e" strokeWidth="1" opacity="0.35" />
            <rect x="280" y="204" width="40" height="10" fill="#0b1119" stroke="#263546" strokeWidth="1" />
            <text
              x="300"
              y="184"
              textAnchor="middle"
              fontSize="22"
              fill="#f0a35e"
              letterSpacing="4"
              style={{ fontFamily: "var(--font-latin)" }}
            >
              VOL.01
            </text>
            <circle className="neon-flicker-2" cx="396" cy="176" r="2.5" fill="#ff5c7a" />
          </g>

          {/* 高架轻轨：从 (-20,230) 到 (1460,182)，列车在远景楼群之后穿过 */}
          <g stroke="#121c27" strokeWidth="6">
            <path d="M240 222 V380" />
            <path d="M640 209 V320" />
            <path d="M1040 196 V330" />
          </g>
          <path d="M-20 230 L1460 182" stroke="#162230" strokeWidth="9" />
          <path d="M-20 230 L1460 182" stroke="#3de0d0" strokeWidth="1" strokeDasharray="10 18" opacity="0.3" />
          {/* 驶过的列车：外层做位移动画，内层先下移到轨道高度再按坡度旋转 */}
          <g className="rail-train">
            <g transform="translate(0 70) rotate(-1.86)">
              <circle cx="-4" cy="148" r="3" fill="#ff5c7a" opacity="0.9" />
              <g fill="#121c27" stroke="#263546" strokeWidth="1">
                <rect x="0" y="136" width="90" height="20" rx="3" />
                <rect x="96" y="136" width="90" height="20" rx="3" />
                <rect x="192" y="136" width="90" height="20" rx="3" />
              </g>
              <g fill="#9fe8e0" opacity="0.6">
                <rect x="6" y="141" width="78" height="8" />
                <rect x="102" y="141" width="78" height="8" />
                <rect x="198" y="141" width="78" height="8" />
              </g>
              <g fill="url(#trainWin)">
                <rect x="6" y="141" width="78" height="8" />
                <rect x="102" y="141" width="78" height="8" />
                <rect x="198" y="141" width="78" height="8" />
              </g>
              <circle cx="286" cy="148" r="3.5" fill="#ffc98a" filter="url(#glow)" />
            </g>
          </g>
        </g>

        {/* 远景楼群 */}
        <g className="plx-far">
          {/* 超远塔群：顶到画面上沿，天际线不再是一条平的空白 */}
          <g fill="#0b1119">
            <rect x="60" y="120" width="52" height="300" />
            <rect x="386" y="60" width="46" height="360" />
            <polygon points="432,60 462,96 462,420 432,420" />
            <rect x="660" y="92" width="64" height="340" />
            <rect x="868" y="46" width="40" height="380" />
            <rect x="1232" y="110" width="58" height="320" />
            <rect x="1378" y="70" width="44" height="350" />
          </g>
          <g stroke="#172230" strokeWidth="2">
            <path d="M86 120 V58" />
            <path d="M888 46 V0" />
            <path d="M1400 70 V22" />
          </g>
          <g fill="#ff5c7a" className="neon-flicker">
            <circle cx="86" cy="54" r="2.4" />
            <circle cx="1400" cy="18" r="2.4" />
          </g>
          <g opacity="0.5">
            <rect x="386" y="80" width="46" height="330" fill="url(#winA)" />
            <rect x="660" y="112" width="64" height="300" fill="url(#winB)" />
            <rect x="1232" y="130" width="58" height="280" fill="url(#winA)" />
            <rect x="0" y="40" width="1440" height="400" fill="url(#winOff)" opacity="0.95" />
          </g>

          <g fill="#0f161f">
            <rect x="-20" y="330" width="120" height="400" />
            <rect x="110" y="290" width="90" height="440" />
            <rect x="210" y="350" width="70" height="380" />
            <rect x="300" y="250" width="110" height="480" />
            <rect x="430" y="310" width="80" height="420" />
            <rect x="520" y="200" width="60" height="530" />
            <rect x="590" y="300" width="130" height="430" />
            <rect x="740" y="260" width="90" height="470" />
            <rect x="850" y="340" width="120" height="390" />
            <rect x="990" y="230" width="70" height="500" />
            <rect x="1070" y="300" width="110" height="430" />
            <rect x="1200" y="270" width="90" height="460" />
            <rect x="1300" y="330" width="160" height="400" />
          </g>
          {/* 远景窗光 */}
          <g opacity="0.75">
            <rect x="110" y="300" width="90" height="300" fill="url(#winA)" />
            <rect x="300" y="262" width="110" height="340" fill="url(#winB)" />
            <rect x="520" y="212" width="60" height="400" fill="url(#winA)" />
            <rect x="590" y="312" width="130" height="300" fill="url(#winB)" />
            <rect x="740" y="272" width="90" height="330" fill="url(#winA)" />
            <rect x="990" y="242" width="70" height="380" fill="url(#winB)" />
            <rect x="1070" y="312" width="110" height="300" fill="url(#winA)" />
            <rect x="1200" y="282" width="90" height="340" fill="url(#winB)" />
            <rect x="0" y="200" width="1440" height="530" fill="url(#winOff)" opacity="0.9" />
          </g>
          {/* 楼顶航空灯 */}
          <g fill="#ff5c7a" className="neon-flicker-2">
            <circle cx="550" cy="196" r="2.2" />
            <circle cx="1025" cy="226" r="2.2" />
            <circle cx="355" cy="246" r="1.8" />
          </g>
          {/* 远处高架 */}
          <path
            d="M-20 640 L1460 600"
            stroke="#162230"
            strokeWidth="10"
          />
          <path
            d="M-20 640 L1460 600"
            stroke="#3de0d0"
            strokeWidth="1"
            strokeDasharray="14 22"
            opacity="0.35"
          />
        </g>

        {/* 电线 */}
        <g fill="none" stroke="#1b2633" strokeWidth="1.6" opacity="0.9">
          <path d="M-20 240 Q 360 330 760 262 T 1460 300" />
          <path d="M-20 262 Q 420 360 820 286 T 1460 322" />
          <path d="M180 120 Q 640 250 1120 150 T 1460 210" strokeWidth="1.2" />
        </g>

        {/* 周年彩旗：一根直电线挂满四色小三角旗 */}
        <g className="plx-mid">
          <path d="M0 300 L1440 250" stroke="#1b2633" strokeWidth="1.5" />
          <g stroke="#05070a" strokeWidth="0.8" opacity="0.9">
            {flags.map((f, i) => (
              <polygon
                key={i}
                points={`${f.x},${f.y} ${f.x + 16},${f.y - 0.4} ${f.x + 8},${f.y + 18}`}
                fill={f.color}
                opacity={f.color === "#f1ebdc" ? 0.75 : 0.9}
              />
            ))}
          </g>
        </g>

        {/* 中景：近楼 + 霓虹灯牌 */}
        <g className="plx-mid">
          <g fill="#0b1119" stroke="#172230" strokeWidth="1.5">
            <rect x="40" y="380" width="260" height="340" />
            <rect x="560" y="400" width="340" height="320" />
            <rect x="1080" y="340" width="300" height="380" />
          </g>
          {/* 楼体边缘高光 */}
          <g stroke="#263546" strokeWidth="1">
            <path d="M300 380 V720" />
            <path d="M560 400 V720" />
            <path d="M1380 340 V720" />
          </g>
          {/* 窗 */}
          <g opacity="0.55">
            <rect x="60" y="400" width="220" height="150" fill="url(#winB)" />
            <rect x="590" y="480" width="280" height="140" fill="url(#winA)" />
            <rect x="1100" y="360" width="260" height="170" fill="url(#winB)" />
            <rect x="0" y="340" width="1440" height="400" fill="url(#winOff)" opacity="0.85" />
          </g>

          {/* 竖灯牌 1（青） */}
          <g className="neon-flicker" filter="url(#glow)">
            <path
              d="M232 396 H296 L296 630 L288 640 H232 Z"
              fill="#0b1119"
              stroke="#3de0d0"
              strokeWidth="2"
            />
            <g fill="#3de0d0">
              <rect x="246" y="414" width="36" height="8" />
              <rect x="246" y="432" width="22" height="8" />
              <rect x="258" y="450" width="24" height="8" />
              <rect x="246" y="482" width="36" height="8" />
              <rect x="246" y="500" width="36" height="8" />
              <rect x="246" y="532" width="14" height="30" />
              <rect x="268" y="532" width="14" height="30" />
              <rect x="246" y="578" width="36" height="8" />
              <rect x="246" y="596" width="36" height="8" />
            </g>
          </g>

          {/* 横灯牌（琥珀）+ 斑马带 */}
          <g filter="url(#glow)">
            <path
              d="M600 420 H880 L870 492 H600 Z"
              fill="#0b1119"
              stroke="#f0a35e"
              strokeWidth="2"
            />
            <g fill="#f0a35e">
              <rect x="616" y="438" width="40" height="34" />
              <rect x="668" y="438" width="14" height="34" />
              <rect x="690" y="438" width="30" height="14" />
              <rect x="690" y="458" width="30" height="14" />
              <rect x="732" y="438" width="14" height="34" />
              <rect x="756" y="438" width="36" height="14" />
              <rect x="756" y="458" width="36" height="14" />
              <rect x="806" y="438" width="44" height="34" opacity="0.6" />
            </g>
          </g>
          <g transform="translate(600 500)">
            <path
              d="M0 0 H270 L266 14 H0 Z"
              fill="#f0a35e"
              opacity="0.85"
            />
            <path
              d="M0 0 H270 L266 14 H0 Z"
              fill="url(#hazardSvg)"
            />
          </g>

          {/* 广告牌：网点 + 斜带 */}
          <g>
            <rect x="1110" y="372" width="230" height="130" fill="#0f1822" stroke="#263546" strokeWidth="1.5" />
            <rect x="1110" y="372" width="230" height="130" fill="url(#dotsCyan)" opacity="0.5" />
            <path d="M1110 502 L1340 372 L1340 420 L1180 502 Z" fill="#f0a35e" opacity="0.85" />
            <path d="M1110 460 L1200 372 L1240 372 L1110 500 Z" fill="#0a0e14" opacity="0.9" />
            <rect x="1130" y="392" width="60" height="10" fill="#eef3f9" opacity="0.8" />
            <rect x="1130" y="410" width="36" height="10" fill="#eef3f9" opacity="0.5" />
          </g>

          {/* 竖灯牌 2（信号红） */}
          <g className="neon-flicker-2" filter="url(#glow)">
            <path
              d="M1116 520 H1166 V700 H1124 L1116 690 Z"
              fill="#0b1119"
              stroke="#ff5c7a"
              strokeWidth="2"
            />
            <g fill="#ff5c7a">
              <rect x="1128" y="538" width="26" height="8" />
              <rect x="1128" y="556" width="26" height="8" />
              <rect x="1128" y="586" width="10" height="26" />
              <rect x="1144" y="586" width="10" height="26" />
              <rect x="1128" y="628" width="26" height="8" />
              <rect x="1128" y="646" width="16" height="8" />
            </g>
          </g>
        </g>

        {/* 画框两侧的贴身楼：从画面上沿直落到地面，把街夹成一条巷子 */}
        <g className="plx-near">
          {/* 左侧 */}
          <rect x="-40" y="0" width="188" height="792" fill="#080d13" stroke="#1b2633" strokeWidth="2" />
          <rect x="-40" y="0" width="188" height="792" fill="url(#dotsFaint)" />
          <g opacity="0.42">
            <rect x="-20" y="60" width="150" height="620" fill="url(#winB)" />
            <rect x="-40" y="0" width="188" height="792" fill="url(#winOff)" opacity="0.92" />
          </g>
          <g stroke="#121c27" strokeWidth="3">
            <path d="M-40 236 H148" />
            <path d="M-40 452 H148" />
          </g>
          {/* 外挂楼梯 */}
          <g stroke="#121c27" strokeWidth="4" fill="none">
            <path d="M112 236 V452" />
            <path d="M148 300 H112 M148 348 H112 M148 396 H112" />
          </g>
          {/* 侧挑琥珀灯牌 */}
          <g filter="url(#glow)">
            <rect x="148" y="188" width="78" height="30" fill="#0b1119" stroke="#f0a35e" strokeWidth="2" />
            <g fill="#f0a35e">
              <rect x="158" y="198" width="22" height="10" />
              <rect x="186" y="198" width="10" height="10" />
              <rect x="202" y="198" width="16" height="10" />
            </g>
          </g>

          {/* 右侧 */}
          <rect x="1322" y="0" width="160" height="770" fill="#080d13" stroke="#1b2633" strokeWidth="2" />
          <rect x="1322" y="0" width="160" height="770" fill="url(#dotsFaint)" />
          <g opacity="0.4">
            <rect x="1336" y="80" width="130" height="600" fill="url(#winA)" />
            <rect x="1322" y="0" width="160" height="770" fill="url(#winOff)" opacity="0.92" />
          </g>
          <g stroke="#121c27" strokeWidth="3">
            <path d="M1322 300 H1482" />
            <path d="M1322 520 H1482" />
          </g>
          {/* 侧挑青色竖牌 */}
          <g className="neon-flicker" filter="url(#glow)">
            <rect x="1286" y="120" width="34" height="200" fill="#0b1119" stroke="#3de0d0" strokeWidth="2" />
            <g fill="#3de0d0">
              <rect x="1296" y="140" width="16" height="22" />
              <rect x="1296" y="176" width="16" height="22" />
              <rect x="1296" y="212" width="16" height="22" />
              <rect x="1296" y="248" width="16" height="22" />
              <rect x="1296" y="284" width="16" height="22" />
            </g>
          </g>
        </g>

        {/* 近景：店面 / 路灯 / 路面 */}
        <g className="plx-near">
          {/* 路面 */}
          <rect x="0" y="700" width="1440" height="200" fill="url(#road)" />
          {/* 路缘与车道线 */}
          <path d="M0 702 H1440" stroke="#1d2a38" strokeWidth="3" />
          <path d="M0 760 L1440 740" stroke="#eef3f9" strokeWidth="2" strokeDasharray="40 36" opacity="0.14" />
          <path d="M0 830 L1440 812" stroke="#f0a35e" strokeWidth="1.5" opacity="0.18" />
          {/* 路缘斑马带 */}
          <rect x="0" y="704" width="1440" height="6" fill="#f0a35e" opacity="0.35" />
          <rect x="0" y="704" width="1440" height="6" fill="url(#hazardSvg)" />
          {/* 斑马线（左下，透视斜切） */}
          <g fill="#eef3f9" opacity="0.1">
            <path d="M80 900 L130 780 L160 780 L110 900 Z" />
            <path d="M160 900 L210 780 L240 780 L190 900 Z" />
            <path d="M240 900 L290 780 L320 780 L270 900 Z" />
            <path d="M320 900 L370 780 L400 780 L350 900 Z" />
          </g>
          {/* 路面漆字：六分街（透视斜切） */}
          <text
            x="1200"
            y="866"
            textAnchor="middle"
            fontSize="112"
            fill="#eef3f9"
            opacity="0.055"
            letterSpacing="12"
            transform="skewX(-28)"
            style={{ fontFamily: "var(--font-latin)" }}
          >
            SIXTH ST
          </text>
          {/* 路面导向箭头 */}
          <g fill="#eef3f9" opacity="0.08">
            <polygon points="880,790 980,786 980,778 1010,790 980,802 980,794 880,798" />
            <polygon points="1180,824 1250,821 1250,814 1276,824 1250,834 1250,827 1180,830" />
          </g>
          {/* 井盖 */}
          <ellipse cx="560" cy="800" rx="28" ry="7" fill="#0b1119" stroke="#1d2a38" strokeWidth="2" />
          <ellipse cx="560" cy="800" rx="18" ry="4" fill="none" stroke="#1d2a38" strokeWidth="1" />
          {/* 车灯拖影：头灯向右，尾灯向左 */}
          <g className="car-trail">
            <rect x="0" y="768" width="360" height="4" rx="2" fill="url(#trailWarm)" />
            <rect x="0" y="762" width="360" height="16" rx="8" fill="url(#trailWarm)" opacity="0.18" />
          </g>
          <g className="car-trail-rev">
            <rect x="0" y="812" width="300" height="3" rx="1.5" fill="url(#trailRed)" />
            <rect x="0" y="806" width="300" height="14" rx="7" fill="url(#trailRed)" opacity="0.18" />
          </g>

          {/* 湿路反光：灯牌颜色倒映 */}
          <g mask="url(#reflMask)" filter="url(#wet)">
            <rect x="236" y="700" width="56" height="160" fill="#3de0d0" opacity="0.5" />
            <rect x="600" y="700" width="270" height="110" fill="#f0a35e" opacity="0.35" />
            <rect x="1118" y="700" width="46" height="150" fill="#ff5c7a" opacity="0.45" />
            <rect x="40" y="700" width="200" height="90" fill="#ffc98a" opacity="0.22" />
            <rect x="1080" y="700" width="60" height="120" fill="#ffc98a" opacity="0.3" />
          </g>

          {/* 左侧店面：雨棚斑马条 + 暖光窗 */}
          <g>
            <rect x="40" y="560" width="200" height="140" fill="#0c131b" stroke="#172230" strokeWidth="1.5" />
            <rect x="60" y="600" width="160" height="100" fill="#ffc98a" opacity="0.14" />
            <rect x="60" y="600" width="160" height="100" fill="url(#winB)" opacity="0.9" />
            <rect x="60" y="600" width="160" height="100" fill="none" stroke="#2a3a4d" strokeWidth="1" />
            <path d="M30 556 H250 L236 590 H44 Z" fill="#f0a35e" />
            <path d="M30 556 H250 L236 590 H44 Z" fill="url(#hazardSvg)" />
            <rect x="68" y="568" width="60" height="4" fill="#05070a" opacity="0.6" />
          </g>

          {/* 右侧自动贩卖机 */}
          <g filter="url(#glow)">
            <rect x="1084" y="604" width="44" height="96" fill="#0c131b" stroke="#3de0d0" strokeWidth="1.5" />
            <rect x="1092" y="614" width="28" height="44" fill="#3de0d0" opacity="0.65" />
            <rect x="1092" y="668" width="28" height="4" fill="#ffc98a" />
            <rect x="1092" y="678" width="28" height="4" fill="#ffc98a" opacity="0.6" />
          </g>

          {/* 路灯 */}
          <g>
            <rect x="366" y="430" width="4" height="270" fill="#1b2633" />
            <path d="M368 432 H408" stroke="#1b2633" strokeWidth="4" />
            <rect x="398" y="426" width="22" height="8" fill="#ffc98a" />
            <ellipse cx="409" cy="434" rx="150" ry="300" fill="url(#lamp)" opacity="0.45" />
          </g>
          <g>
            <rect x="1000" y="470" width="4" height="230" fill="#1b2633" />
            <path d="M1002 472 H962" stroke="#1b2633" strokeWidth="4" />
            <rect x="950" y="466" width="22" height="8" fill="#ffc98a" />
            <ellipse cx="961" cy="474" rx="130" ry="260" fill="url(#lamp)" opacity="0.4" />
          </g>
          {/* 灯下的光斑 */}
          <ellipse cx="409" cy="704" rx="120" ry="12" fill="#ffc98a" opacity="0.14" filter="url(#glowBig)" />
          <ellipse cx="961" cy="704" rx="110" ry="12" fill="#ffc98a" opacity="0.12" filter="url(#glowBig)" />
        </g>

        {/* 暗角 */}
        <rect width="1440" height="900" fill="url(#vignette)" />

        {/* SVG 内斑马条图案（放在最后定义也能被引用） */}
        <defs>
          <pattern id="hazardSvg" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width="10" height="20" fill="#05070a" opacity="0.9" />
          </pattern>
        </defs>
      </svg>

      {/* 雨丝 */}
      <div className="rain" />

      {/* 门禁页压暗 */}
      {dim ? <div className="absolute inset-0 bg-[rgba(8,11,16,0.5)]" /> : null}

      {/* 底部融入页面底色 */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[var(--bg-deep)] to-transparent" />
    </Parallax>
  );
}
