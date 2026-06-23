interface WordmarkProps {
  /** Altezza in px (la larghezza scala da sola). Default 40. */
  height?: number;
  className?: string;
}

export function Wordmark({ height = 40, className }: WordmarkProps) {
  return (
    <svg
      viewBox="0 0 300 72"
      height={height}
      width={Math.round(height * (300 / 72))}
      role="img"
      aria-label="the HUB UP"
      className={className}
      style={{ display: "block", color: "hsl(var(--brand, 213 100% 47%))" }}
    >
      <text x="2" y="56" fontFamily="Inter, system-ui, sans-serif" fontWeight={800} fontSize={48} letterSpacing="0.5">
        <tspan fontSize={23} fontWeight={400} style={{ fill: "hsl(var(--muted-foreground, 220 9% 46%))" }}>the </tspan>
        <tspan fill="currentColor">HUB</tspan>
        <tspan
          stroke="currentColor"
          strokeWidth={4.3}
          paintOrder="stroke"
          strokeLinejoin="round"
          style={{ fill: "hsl(var(--card, 0 0% 100%))" }}
        >UP</tspan>
      </text>
    </svg>
  );
}
