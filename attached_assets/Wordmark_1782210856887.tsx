interface WordmarkProps {
  /** Altezza in px del wordmark (la larghezza scala da sola). Default 34. */
  height?: number;
  className?: string;
}

/**
 * Wordmark "the HUBUP": HUB pieno in blu brand, UP a contorno (vuoto).
 * I colori vengono dai token del tema, quindi si adatta da solo a chiaro/scuro:
 *   --brand          → blu del marchio (HUB pieno + contorno di UP)
 *   --card           → interno vuoto di UP (= superficie su cui poggia)
 *   --muted-foreground → "the"
 *
 * Nota produzione: per bloccare il disegno a prescindere dal font installato,
 * convertire in seguito le lettere in tracciati (outline) ed esportare l'SVG statico.
 */
export function Wordmark({ height = 34, className }: WordmarkProps) {
  return (
    <svg
      viewBox="0 0 300 72"
      height={height}
      role="img"
      aria-label="the HUB UP"
      className={className}
      style={{ display: "block" }}
    >
      <text
        x="2"
        y="56"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight={800}
        fontSize={48}
        letterSpacing="0.5"
      >
        <tspan fontSize={23} fontWeight={400} fill="hsl(var(--muted-foreground))">the </tspan>
        <tspan fill="hsl(var(--brand))">HUB</tspan>
        <tspan
          fill="hsl(var(--card))"
          stroke="hsl(var(--brand))"
          strokeWidth={4.3}
          paintOrder="stroke"
          strokeLinejoin="round"
        >UP</tspan>
      </text>
    </svg>
  );
}
