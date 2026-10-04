/**
 * 前景主体：绳网代理人铃与哲 + 街角茶室「吹水茶室」+ 睡猫机器人
 * 兄妹用用户提供的人像抠图（public/cover/belle-wise.png），按原图宽高比放入，不拉伸。
 * 漫画语言：粗黑描边、半调网点、集中线、斑马警示条、霓虹发光。
 *
 * 画布 660 × 920，地面线 y=812，下面 108 留给湿地倒影。
 * 由远及近三层，各层缩放不同，描边粗细因此自然拉开前后关系：
 *   背景（1.0）— 背光圆盘 + 集中线 + 霓虹塔牌 + 彩灯电线，负责把画面上三分之一填满
 *   中景（0.8）— 茶室整体退远，线变细
 *   主角（1.6）— 铃与哲推近，线变粗，独占画面七成高度
 * 定位交给外层 className（首页 .hero-subject / 门禁 .gate-subject）。
 */
export function StreetSubject({
  className = "",
  dim = false,
}: {
  className?: string;
  /** 门禁页：整体压暗一点，让表单更突出 */
  dim?: boolean;
}) {
  /* 雨棚下沿的小垂片：斑马 / 琥珀交替 */
  const scallops = Array.from({ length: 12 }, (_, i) => i);

  /* 集中线：从主角头顶后方向外放射，内圈留空让背光圆盘透出来 */
  /* 背光圆心落在两人头顶之间 */
  const burstCx = 210;
  const burstCy = 250;
  const rays = Array.from({ length: 30 }, (_, i) => {
    const a = (i / 30) * Math.PI * 2 + 0.17;
    const half = 0.013 + (i % 3) * 0.007;
    const at = (r: number, t: number) =>
      `${(burstCx + Math.cos(a + t) * r).toFixed(1)},${(burstCy + Math.sin(a + t) * r).toFixed(1)}`;
    return {
      points: `${at(286, 0)} ${at(1180, -half)} ${at(1180, half)}`,
      opacity: 0.05 + (i % 4) * 0.022,
    };
  });

  /* 头顶彩灯：挂在一根横跨画面的电线上（坐标取自电线曲线） */
  const bulbs = [
    { x: 132, y: 89, color: "#f0a35e" },
    { x: 213, y: 94, color: "#3de0d0" },
    { x: 297, y: 97, color: "#ff5c7a" },
    { x: 386, y: 94, color: "#f0a35e" },
    { x: 475, y: 87, color: "#3de0d0" },
  ];

  return (
    <svg
      className={className}
      viewBox="0 0 660 920"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden
      style={dim ? { opacity: 0.86 } : undefined}
    >
      <defs>
        {/* 霓虹发光 */}
        <filter id="ss-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* 湿地反光的模糊 */}
        <filter id="ss-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6 2" />
        </filter>
        {/* 斑马警示条 */}
        <pattern
          id="ss-hz"
          width="18"
          height="18"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-45)"
        >
          <rect width="9" height="18" fill="#05070a" opacity="0.92" />
        </pattern>
        {/* 楼体半调网点 */}
        <pattern id="ss-dots" width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="3.5" cy="3.5" r="1.1" fill="#ffffff" opacity="0.07" />
        </pattern>
        {/* 背光圆盘的粗网点 */}
        <pattern id="ss-tone" width="11" height="11" patternUnits="userSpaceOnUse">
          <circle cx="5.5" cy="5.5" r="2.5" fill="#9fe8e0" opacity="0.26" />
        </pattern>
        {/* 背光：主角身后的一团青色夜光 */}
        <radialGradient id="ss-back" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#2aa79c" stopOpacity="0.4" />
          <stop offset="55%" stopColor="#15545c" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#0a0e14" stopOpacity="0" />
        </radialGradient>
        {/* 店内暖光 */}
        <linearGradient id="ss-warm" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffc98a" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#f0a35e" stopOpacity="0.1" />
        </linearGradient>
        {/* 透明伞面 */}
        <radialGradient id="ss-umb" cx="0.5" cy="1" r="0.9">
          <stop offset="0%" stopColor="#3de0d0" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#3de0d0" stopOpacity="0.07" />
        </radialGradient>
        {/* 反光向下渐隐 */}
        <linearGradient id="ss-reflFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="ss-reflMask">
          <rect x="0" y="812" width="660" height="108" fill="url(#ss-reflFade)" />
        </mask>
        {/* 集中线往中心渐隐，免得糊住主角 */}
        <radialGradient id="ss-rayFade" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#000" />
          <stop offset="24%" stopColor="#000" />
          <stop offset="40%" stopColor="#fff" />
          <stop offset="100%" stopColor="#fff" />
        </radialGradient>
        <mask id="ss-rayMask">
          <rect
            x={burstCx - 1180}
            y={burstCy - 1180}
            width="2360"
            height="2360"
            fill="url(#ss-rayFade)"
          />
        </mask>
      </defs>

      {/* ===== 背景层：背光 + 集中线 ===== */}
      <circle cx={burstCx} cy={burstCy} r="330" fill="url(#ss-back)" />
      <g mask="url(#ss-rayMask)">
        {rays.map((r, i) => (
          <polygon key={i} points={r.points} fill="#eef3f9" opacity={r.opacity} />
        ))}
      </g>
      <g>
        <circle cx={burstCx} cy={burstCy} r="296" fill="url(#ss-tone)" opacity="0.5" />
        <circle
          cx={burstCx}
          cy={burstCy}
          r="320"
          fill="none"
          stroke="#3de0d0"
          strokeWidth="1.4"
          strokeDasharray="5 14"
          opacity="0.22"
        />
      </g>

      {/* ===== 背景层：远处霓虹塔牌（把上三分之一撑起来） ===== */}
      <g opacity="0.92">
        <rect x="596" y="30" width="6" height="470" fill="#121c27" />
        <path d="M566 500 H650" stroke="#121c27" strokeWidth="5" />
        <g filter="url(#ss-glow)">
          <rect
            x="564"
            y="62"
            width="70"
            height="432"
            fill="#0b1119"
            stroke="#ff5c7a"
            strokeWidth="2"
          />
          <g className="neon-flicker-2" fill="#ff5c7a" opacity="0.9">
            <rect x="580" y="86" width="38" height="9" />
            <rect x="580" y="104" width="24" height="9" />
            <rect x="594" y="122" width="24" height="9" />
            <rect x="580" y="156" width="38" height="9" />
            <rect x="580" y="174" width="38" height="9" />
            <rect x="580" y="208" width="15" height="32" />
            <rect x="603" y="208" width="15" height="32" />
            <rect x="580" y="262" width="38" height="9" />
            <rect x="580" y="280" width="24" height="9" />
            <rect x="594" y="314" width="24" height="9" />
            <rect x="580" y="332" width="38" height="9" />
            <rect x="580" y="366" width="15" height="30" />
            <rect x="603" y="366" width="15" height="30" />
            <rect x="580" y="420" width="38" height="9" />
            <rect x="580" y="438" width="26" height="9" />
          </g>
        </g>
        <path d="M599 62 V26" stroke="#1a2633" strokeWidth="3" />
        <circle className="ss-blink" cx="599" cy="20" r="5" fill="#ff5c7a" filter="url(#ss-glow)" />
      </g>

      {/* ===== 背景层：头顶彩灯电线 ===== */}
      <path
        d="M-10 66 Q 330 130 670 52"
        fill="none"
        stroke="#1b2633"
        strokeWidth="2.5"
      />
      <g>
        {bulbs.map((b, i) => (
          <g key={i}>
            <path
              d={`M${b.x} ${b.y} V${b.y + 13}`}
              stroke="#1b2633"
              strokeWidth="1.6"
            />
            <circle
              className={i % 2 ? "neon-flicker-2" : "neon-flicker"}
              cx={b.x}
              cy={b.y + 19}
              r="5.5"
              fill={b.color}
              filter="url(#ss-glow)"
              opacity="0.9"
            />
          </g>
        ))}
      </g>

      {/* ===== 地面：水洼 + 路缘 + 湿地倒影 ===== */}
      <ellipse cx="300" cy="824" rx="330" ry="20" fill="#3de0d0" opacity="0.05" />
      <g mask="url(#ss-reflMask)" filter="url(#ss-soft)">
        <rect x="96" y="814" width="200" height="90" fill="#000" opacity="0.45" />
        <rect x="150" y="814" width="16" height="80" fill="#3de0d0" opacity="0.2" />
        <rect x="362" y="814" width="44" height="98" fill="#3de0d0" opacity="0.26" />
        <rect x="420" y="814" width="164" height="72" fill="#f0a35e" opacity="0.2" />
        <rect x="556" y="814" width="96" height="46" fill="#f0a35e" opacity="0.1" />
        <rect x="628" y="814" width="30" height="74" fill="#ff5c7a" opacity="0.28" />
      </g>
      <path d="M0 812 H660" stroke="#1d2a38" strokeWidth="3" />
      <rect x="0" y="812" width="660" height="7" fill="#f0a35e" opacity="0.3" />
      <rect x="0" y="812" width="660" height="7" fill="url(#ss-hz)" />

      {/* ===== 中景：茶室（0.8 倍退远） ===== */}
      <g transform="translate(215 332) scale(0.8)">
        {/* 楼顶空调外机 */}
        <rect x="452" y="236" width="52" height="36" fill="#121c27" stroke="#05070a" strokeWidth="2.5" />
        <g stroke="#1d2a38" strokeWidth="1.5">
          <path d="M460 246 H496" />
          <path d="M460 254 H496" />
          <path d="M460 262 H496" />
        </g>

        {/* 楼顶灯牌 TEA·24H */}
        <rect x="300" y="266" width="4" height="8" fill="#1a2633" />
        <rect x="420" y="266" width="4" height="8" fill="#1a2633" />
        <g filter="url(#ss-glow)">
          <rect x="282" y="218" width="160" height="48" fill="#0b1119" stroke="#f0a35e" strokeWidth="2.5" />
          <text
            x="362"
            y="252"
            textAnchor="middle"
            fontSize="26"
            fill="#f0a35e"
            letterSpacing="3"
            style={{ fontFamily: "var(--font-latin)" }}
          >
            TEA·24H
          </text>
        </g>

        {/* 楼顶的猫 */}
        <g fill="#05070a">
          <path d="M320 272 q-14 -2 -10 -16" stroke="#05070a" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <ellipse cx="333" cy="262" rx="12" ry="11" />
          <circle cx="346" cy="249" r="8" />
          <polygon points="339,243 342,234 346,243" />
          <polygon points="347,243 351,234 354,243" />
        </g>
        <g fill="#3de0d0">
          <circle cx="344" cy="249" r="1.3" />
          <circle cx="349" cy="249" r="1.3" />
        </g>

        {/* 楼体 */}
        <rect x="236" y="272" width="292" height="328" fill="#0e1620" stroke="#05070a" strokeWidth="3" />
        <rect x="236" y="272" width="292" height="328" fill="url(#ss-dots)" />
        <g stroke="#16202c" strokeWidth="1">
          <path d="M240 296 H524" />
          <path d="M240 312 H524" />
        </g>
        <rect x="518" y="272" width="6" height="328" fill="#1a2633" />

        {/* 竖霓虹灯牌：吹水茶室 */}
        <g className="neon-flicker" filter="url(#ss-glow)">
          <rect x="186" y="300" width="50" height="210" fill="#0b1119" stroke="#3de0d0" strokeWidth="2.5" />
          <g
            fill="#3de0d0"
            fontSize="30"
            fontWeight="900"
            textAnchor="middle"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <text x="211" y="352">吹</text>
            <text x="211" y="400">水</text>
            <text x="211" y="448">茶</text>
            <text x="211" y="496">室</text>
          </g>
        </g>

        {/* 雨棚：琥珀 + 斑马 */}
        <polygon points="222,326 540,326 554,370 208,370" fill="#f0a35e" stroke="#05070a" strokeWidth="3" />
        <polygon points="222,326 540,326 554,370 208,370" fill="url(#ss-hz)" />
        {scallops.map((i) => (
          <rect
            key={i}
            x={210 + i * 29}
            y="370"
            width="20"
            height="10"
            fill={i % 2 ? "#05070a" : "#f0a35e"}
            stroke="#05070a"
            strokeWidth="2"
          />
        ))}
        <rect x="236" y="380" width="292" height="14" fill="#05070a" opacity="0.55" />

        {/* 窗口 / 柜台开口 */}
        <rect x="258" y="394" width="196" height="126" fill="url(#ss-warm)" stroke="#05070a" strokeWidth="3" />
        {/* 吊灯 */}
        <path d="M330 394 V410" stroke="#1a2633" strokeWidth="2" />
        <polygon points="318,418 342,418 336,410 324,410" fill="#ffc98a" filter="url(#ss-glow)" />
        {/* 货架 + 饮料瓶 */}
        <path d="M262 436 H450" stroke="#3a2a18" strokeWidth="2" />
        <g stroke="#05070a" strokeWidth="1.5">
          <rect x="270" y="414" width="10" height="22" fill="#3de0d0" opacity="0.9" />
          <rect x="284" y="414" width="10" height="22" fill="#f0a35e" opacity="0.9" />
          <rect x="298" y="414" width="10" height="22" fill="#ff5c7a" opacity="0.9" />
          <rect x="312" y="414" width="10" height="22" fill="#3de0d0" opacity="0.9" />
          <rect x="350" y="414" width="10" height="22" fill="#f0a35e" opacity="0.9" />
          <rect x="364" y="414" width="10" height="22" fill="#eef3f9" opacity="0.9" />
        </g>
        {/* 菜单板 */}
        <rect x="380" y="402" width="66" height="60" fill="#f1ebdc" stroke="#05070a" strokeWidth="2" />
        <g fill="#16181c">
          <rect x="388" y="410" width="42" height="5" />
          <rect x="388" y="420" width="30" height="5" />
          <rect x="388" y="430" width="48" height="5" />
          <rect x="388" y="440" width="24" height="5" />
        </g>
        <circle cx="432" cy="450" r="7" fill="#ff5c7a" />

        {/* 柜台 */}
        <rect x="248" y="520" width="260" height="20" fill="#1a2633" stroke="#05070a" strokeWidth="3" />
        <rect x="248" y="540" width="260" height="60" fill="#0b1119" stroke="#05070a" strokeWidth="3" />
        <rect x="248" y="584" width="260" height="10" fill="#f0a35e" opacity="0.6" />
        <rect x="248" y="584" width="260" height="10" fill="url(#ss-hz)" />
        {/* 柜台贴纸 OPEN */}
        <polygon points="274,552 342,552 338,574 270,574" fill="#f0a35e" />
        <text
          x="306"
          y="569"
          textAnchor="middle"
          fontSize="15"
          fill="#1a0f04"
          letterSpacing="2"
          style={{ fontFamily: "var(--font-latin)" }}
        >
          OPEN
        </text>
        {/* 柜台上的热饮 */}
        <rect x="300" y="500" width="24" height="22" fill="#f1ebdc" stroke="#05070a" strokeWidth="2" />
        <rect x="298" y="496" width="28" height="6" fill="#f0a35e" stroke="#05070a" strokeWidth="2" />
        <path className="ss-steam" d="M312 490 q4 -8 0 -16" stroke="#eef3f9" strokeWidth="1.5" fill="none" opacity="0.6" />

        {/* 门 */}
        <rect x="464" y="392" width="52" height="208" fill="#0b1119" stroke="#05070a" strokeWidth="3" />
        <rect x="472" y="404" width="36" height="70" fill="#ffc98a" opacity="0.2" />
        <rect x="506" y="500" width="4" height="16" fill="#3de0d0" />
        <g filter="url(#ss-glow)">
          <rect x="470" y="486" width="40" height="16" fill="#0b1119" stroke="#ff5c7a" strokeWidth="1.5" />
          <g fill="#ff5c7a">
            <rect x="476" y="492" width="6" height="4" />
            <rect x="485" y="492" width="6" height="4" />
            <rect x="494" y="492" width="10" height="4" />
          </g>
        </g>

        {/* 挂在雨棚角上的红灯笼 */}
        <g className="ss-swing" style={{ transformOrigin: "536px 370px" }}>
          <path d="M536 370 V392" stroke="#1a2633" strokeWidth="2" />
          <g filter="url(#ss-glow)">
            <circle cx="536" cy="407" r="15" fill="#ff5c7a" stroke="#05070a" strokeWidth="2.5" />
            <path d="M521 407 H551" stroke="#05070a" strokeWidth="1" opacity="0.5" />
            <path d="M525 399 H547 M525 415 H547" stroke="#05070a" strokeWidth="1" opacity="0.4" />
          </g>
          <rect x="533" y="422" width="6" height="8" fill="#f0a35e" />
        </g>

        {/* 睡猫机器人 ZZZ喵（坐在柜台上） */}
        <g>
          <path d="M448 512 q22 -4 18 -22" stroke="#05070a" strokeWidth="9" strokeLinecap="round" fill="none" />
          <path d="M448 512 q22 -4 18 -22" stroke="#e6edf5" strokeWidth="5" strokeLinecap="round" fill="none" />
          <polygon points="396,484 402,458 414,478" fill="#e6edf5" stroke="#05070a" strokeWidth="3" strokeLinejoin="round" />
          <polygon points="426,478 438,458 444,484" fill="#e6edf5" stroke="#05070a" strokeWidth="3" strokeLinejoin="round" />
          <polygon points="402,478 404,466 410,476" fill="#f0a35e" />
          <polygon points="430,476 436,466 438,478" fill="#f0a35e" />
          <ellipse cx="420" cy="498" rx="32" ry="26" fill="#e6edf5" stroke="#05070a" strokeWidth="3" />
          <rect x="398" y="516" width="44" height="5" fill="#3de0d0" />
          {/* 屏幕脸：闭眼 + ω 嘴 */}
          <rect x="398" y="486" width="44" height="24" rx="4" fill="#0b1119" stroke="#05070a" strokeWidth="2" />
          <g stroke="#3de0d0" strokeWidth="2.5" strokeLinecap="round" fill="none">
            <path d="M405 497 q5 3 10 0" />
            <path d="M425 497 q5 3 10 0" />
          </g>
          <path d="M416 504 q2 3 4 0 q2 3 4 0" stroke="#3de0d0" strokeWidth="1.5" fill="none" />
          <circle cx="403" cy="505" r="2.2" fill="#ff5c7a" opacity="0.7" />
          <circle cx="437" cy="505" r="2.2" fill="#ff5c7a" opacity="0.7" />
          {/* 天线 */}
          <path d="M420 472 V460" stroke="#05070a" strokeWidth="3" />
          <circle className="ss-blink" cx="420" cy="457" r="4" fill="#ff5c7a" filter="url(#ss-glow)" />
          {/* 前爪 */}
          <ellipse cx="406" cy="522" rx="8" ry="4" fill="#e6edf5" stroke="#05070a" strokeWidth="2" />
          <ellipse cx="434" cy="522" rx="8" ry="4" fill="#e6edf5" stroke="#05070a" strokeWidth="2" />
          {/* 飘起来的 zzz */}
          <g fill="#3de0d0" style={{ fontFamily: "var(--font-latin)" }}>
            <text className="ss-zz ss-zz-1" x="452" y="474" fontSize="16">z</text>
            <text className="ss-zz ss-zz-2" x="462" y="458" fontSize="20">z</text>
            <text className="ss-zz ss-zz-3" x="476" y="438" fontSize="26">Z</text>
          </g>
        </g>
      </g>

      {/* 哲与铃：原图 767×1024。框 286×382 同比例，底边贴地面，右侧停在茶室灯牌之前 */}
      <ellipse cx="215" cy="808" rx="108" ry="9" fill="#000" opacity="0.5" />
      <image
        href="/cover/belle-wise.png"
        x="72"
        y="430"
        width="286"
        height="382"
        preserveAspectRatio="xMidYMax meet"
      />

    </svg>
  );
}
