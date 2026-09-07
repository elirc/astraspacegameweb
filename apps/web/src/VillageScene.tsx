import { useId } from 'react';
const placements: [string, number, number, number, string][] = [
  ['main', 430, 234, 1.55, '#7b6855'],
  ['barracks', 305, 305, 1.05, '#695b4b'],
  ['storage', 539, 293, 1.12, '#796651'],
  ['farm', 655, 330, 0.85, '#a18b64'],
  ['smithy', 412, 364, 0.8, '#62594b'],
  ['market', 504, 402, 0.9, '#877251'],
  ['stable', 243, 235, 0.8, '#85745b'],
  ['wood', 169, 307, 0.8, '#72614d'],
  ['clay', 645, 235, 0.8, '#936b50'],
  ['iron', 664, 143, 0.78, '#736d63'],
  ['wall', 382, 431, 0.65, '#7b7569'],
  ['workshop', 557, 188, 0.72, '#7b6a50'],
];
export function VillageScene({
  onBuilding,
  levels,
}: {
  onBuilding: (key: string) => void;
  levels: Record<string, number>;
}) {
  const id = useId().replace(/:/g, '');
  const trees = Array.from({ length: 96 }, (_, i) => {
    const a = i * 2.39996;
    const radius = 245 + (i % 5) * 15;
    return {
      x: 430 + Math.cos(a) * radius * 1.28,
      y: 260 + Math.sin(a) * radius * 0.64,
      s: 0.6 + (i % 4) * 0.2,
    };
  });
  return (
    <svg
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 860 510"
      className="village-scene"
      role="img"
      aria-label="An illustrated view of your village. Select a building to manage it."
    >
      <defs>
        <linearGradient id={id + 'bg'} x2="0" y2="1">
          <stop stopColor="#d9dfc9" />
          <stop offset="1" stopColor="#b9c6a5" />
        </linearGradient>
        <linearGradient id={id + 'land'} x2="0.5" y2="1">
          <stop stopColor="#cdd2a6" />
          <stop offset="1" stopColor="#aeb98f" />
        </linearGradient>
        <pattern id={id + 'grass'} width="31" height="27" patternUnits="userSpaceOnUse">
          <path d="M5 12l2-3m14 14 2-3m-5-14 1-2" stroke="#899b71" strokeWidth=".8" opacity=".28" />
        </pattern>
        <filter id={id + 'shadow'} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="2" dy="7" stdDeviation="6" floodColor="#394332" floodOpacity=".15" />
        </filter>
      </defs>
      <rect width="860" height="510" fill={`url(#${id}bg)`} />
      <path d="M0 90Q190 160 345 36T860 40V0H0" fill="#b4c3a6" opacity=".55" />
      <path d="M0 465Q180 395 274 458T640 447T860 400V510H0" fill="#91ab89" opacity=".3" />
      <path
        d="M-30 377Q127 356 96 247T181 70T227-20"
        fill="none"
        stroke="#a2bcb6"
        strokeWidth="46"
      />
      <path
        d="M-30 377Q127 356 96 247T181 70T227-20"
        fill="none"
        stroke="#c5d5c6"
        strokeWidth="30"
      />
      <path
        d="M-30 377Q127 356 96 247T181 70T227-20"
        fill="none"
        stroke="#ecedd8"
        strokeWidth="2"
        strokeDasharray="28 20"
        opacity=".6"
      />
      <path d="M169 238L428 95L736 268L463 437Z" fill={`url(#${id}land)`} />
      <rect width="860" height="510" fill={`url(#${id}grass)`} />
      {trees
        .filter((t) => t.y < 250)
        .map((t, i) => (
          <Tree key={i} {...t} />
        ))}
      <g fill="none" strokeLinecap="round">
        <path
          d="M126 278L431 254L470 381L741 372M285 197L325 312L612 199M351 307L565 314M469 381L377 476"
          stroke="#a9a17e"
          strokeWidth="24"
          opacity=".24"
        />
        <path
          d="M126 278L431 254L470 381L741 372M285 197L325 312L612 199M351 307L565 314M469 381L377 476"
          stroke="#ded1a8"
          strokeWidth="17"
        />
        <path d="M126 278L431 254L470 381L741 372" stroke="#eee1bd" strokeWidth="4" opacity=".5" />
      </g>
      <g transform="translate(620 349) rotate(-29)">
        <rect width="116" height="69" fill="#998c56" />
        {Array.from({ length: 9 }, (_, i) => (
          <path
            key={i}
            d={`M${7 + i * 12} 3v63`}
            stroke={i % 2 ? '#bdac68' : '#d0bd75'}
            strokeWidth="7"
          />
        ))}
      </g>
      <g fill="none" opacity=".8" stroke="#766f55" strokeWidth="2">
        <path d="M570 358l75 44 89-51M570 350v15m25-1v17m24-3v16m26-1v17m25-32v17m24-31v17m22-32v17m18-30v16" />
      </g>
      <g fill="none" stroke="#777967" strokeWidth="2">
        <path
          d="M195 219L416 107L713 263L675 307M214 334L388 438M471 445L594 379"
          stroke="#a4a28b"
          strokeWidth="13"
        />
        <path
          d="M195 213L416 101L713 257L675 301M214 328L388 432M471 439L594 373"
          stroke="#d1cbb0"
          strokeWidth="10"
          strokeDasharray="12 4"
        />
      </g>
      {placements
        .sort((a, b) => a[2] - b[2])
        .map(([key, x, y, s, color]) => (
          <g
            key={key}
            transform={`translate(${x} ${y}) scale(${s})`}
            onClick={() => onBuilding(key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onBuilding(key);
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`Manage ${key === 'main' ? 'village headquarters' : key}`}
            className="scene-building"
            filter={`url(#${id}shadow)`}
          >
            <ellipse cy="19" rx="48" ry="19" fill="#536447" opacity=".15" />
            {key === 'main' ? (
              <Castle />
            ) : (
              <House color={color} tower={key === 'iron' || key === 'smithy'} />
            )}
            {key === 'main' && (
              <>
                <path d="M0-104v-37" stroke="#695846" strokeWidth="2" />
                <path d="M1-141l24 5-24 10z" fill="#8d4638" />
              </>
            )}
            <g className="building-label">
              <rect x="-20" y="26" width="40" height="22" rx="11" fill="#faf7eb" stroke="#aba78e" />
              <text y="41" textAnchor="middle" fill="#4c5341" fontSize="12" fontFamily="sans-serif">
                {levels[key] || 0}
              </text>
            </g>
          </g>
        ))}
      {trees
        .filter((t) => t.y >= 250 && (t.x < 210 || t.x > 720 || t.y > 436))
        .map((t, i) => (
          <Tree key={i} {...t} />
        ))}
      <g transform="translate(789 60)" stroke="#616f56" fill="none" opacity=".7">
        <path d="M0-19V19M-19 0H19" />
        <path d="M0-16L-5 1L0-3L5 1z" fill="#616f56" />
        <text
          y="-25"
          fill="#616f56"
          stroke="none"
          textAnchor="middle"
          fontFamily="serif"
          fontSize="12"
        >
          N
        </text>
        <circle r="24" strokeWidth=".6" />
      </g>
      <g fill="#faf8e8" opacity=".65">
        <path
          d="M268 74q5-5 10 0q5-5 10 0M577 68q5-5 10 0q5-5 10 0M590 79q4-4 8 0q4-4 8 0"
          fill="none"
          stroke="#71806b"
          strokeWidth="1.5"
        />
      </g>
    </svg>
  );
}
function House({ color, tower = false }: { color: string; tower?: boolean }) {
  return (
    <>
      <path d="M-38-14L0 5L39-15V20L0 41L-38 20Z" fill="#ccc2a1" />
      <path d="M0 5L39-15V20L0 41Z" fill="#a9a185" />
      <path d="M-46-17L-10-49L44-18L7 14Z" fill={color} />
      <path d="M-46-17L-10-49L-6-12L7 14Z" fill="#94806a" />
      <path d="M-10-49L44-18L7 14L-6-12Z" fill={color} />
      <path d="M-5 7v26m-23-38v29m53-27v27" stroke="#847759" strokeWidth="3" />
      <path d="M9 13l11-6v14l-11 6z" fill="#575b4a" />
      <path d="M-20 15l10 5v15l-10-5z" fill="#726a52" />
      {tower && (
        <>
          <path d="M17-34v-24l11-6 9 5v31l-10 6z" fill="#9c9682" />
          <path d="M17-58l11-6 9 5-11 6z" fill="#c4bda0" />
          <path d="M29-69q-9-15 0-29" fill="none" stroke="#f1eedc" strokeWidth="9" opacity=".55" />
        </>
      )}
    </>
  );
}
function Castle() {
  return (
    <>
      <House color="#796854" />
      <path d="M-30-13v-49L0-78L32-60v52L0 10Z" fill="#cec7af" />
      <path d="M0-78L32-60v52L0 10Z" fill="#ada991" />
      <path d="M-36-65L0-107L39-63L0-44Z" fill="#6e7462" />
      <path d="M0-107L39-63L0-44Z" fill="#555f51" />
      <path d="M-15-43l7 4v17l-7-4zm25 2l8-4v17l-8 4z" fill="#646e5b" />
      <path d="M-44-2v-35l13-8 12 7v35l-12 8zM20 8v-35l13-8 12 7V7l-12 8z" fill="#c7bfa4" />
      <path d="M-46-37l15-20 14 19-14 8zM18-27l15-20 14 19-14 8z" fill="#777a63" />
      <path d="M-7 6v-18q7-16 14-8v18" fill="#625f4d" />
    </>
  );
}
function Tree({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cy="9" rx="14" ry="7" fill="#596e49" opacity=".15" />
      <path d="M0-10v23" stroke="#7a7859" strokeWidth="3" />
      <path d="M0-47L-17-13h7l-13 20L0 15L22 5L10-13h7Z" fill="#667f55" />
      <path d="M0-47L0 15L22 5L10-13h7Z" fill="#536d49" />
      <path d="M0-47L-17-13L0-18Z" fill="#839469" />
    </g>
  );
}
