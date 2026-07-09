"use client";

export default function AnilloProgreso({ pct, size = 140, stroke = 10 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, pct)) / 100) * c;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <defs>
        <linearGradient id="anillo-progreso-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C85217" />
          <stop offset="60%" stopColor="#E67E3F" />
          <stop offset="100%" stopColor="#00A080" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(23,20,17,.08)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#anillo-progreso-grad)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset .6s cubic-bezier(.22,.61,.36,1)" }}
      />
    </svg>
  );
}
