// scripts/migrate-colors.mjs — node scripts/migrate-colors.mjs
import { readFileSync, writeFileSync } from "fs";
import { globSync } from "glob";

// Part 1A — automatic safe (neutrals / unambiguous semantics)
// Part 1B — quasi-safe semantics (green/amber → success/warning)
const map = [
  // gray text → muted-foreground / foreground
  [/\btext-gray-(400|500|600)\b/g, "text-muted-foreground"],
  [/\btext-gray-(700|800|900)\b/g, "text-foreground"],
  // gray backgrounds
  [/\bbg-gray-(50|100)\b/g, "bg-muted"],
  [/\bbg-gray-(200|300)\b/g, "bg-muted"],
  [/\bbg-gray-(800|900)\b/g, "bg-card"],
  // gray borders
  [/\bborder-gray-(200|300)\b/g, "border-border"],
  // bg-white → bg-background (safe in most contexts; overlay bg-popover kept below)
  [/\bbg-white\b/g, "bg-background"],
  // red → destructive
  [/\btext-red-(400|500|600|700)\b/g, "text-destructive"],
  [/\bbg-red-(50|100)\b/g, "bg-destructive/10"],
  [/\bborder-red-(200|300|400)\b/g, "border-destructive/30"],
  [/\btext-red-800\b/g, "text-destructive"],
  [/\bbg-red-(200|300)\b/g, "bg-destructive/20"],
  // green → success
  [/\btext-green-(500|600|700)\b/g, "text-success"],
  [/\bbg-green-(50|100)\b/g, "bg-success/10"],
  [/\bbg-green-(200|300)\b/g, "bg-success/20"],
  [/\bborder-green-(200|300|400|500)\b/g, "border-success/30"],
  [/\btext-green-800\b/g, "text-success"],
  [/\btext-green-900\b/g, "text-success"],
  // amber / yellow → warning
  [/\btext-amber-(500|600|700)\b/g, "text-warning"],
  [/\btext-yellow-(500|600|700)\b/g, "text-warning"],
  [/\bbg-amber-(50|100)\b/g, "bg-warning/10"],
  [/\bbg-yellow-(50|100)\b/g, "bg-warning/10"],
  [/\bbg-amber-(200|300)\b/g, "bg-warning/20"],
  [/\bbg-yellow-(200|300)\b/g, "bg-warning/20"],
  [/\bborder-amber-(200|300|400)\b/g, "border-warning/30"],
  [/\bborder-yellow-(200|300|400)\b/g, "border-warning/30"],
  [/\btext-amber-800\b/g, "text-warning"],
  [/\btext-amber-300\b/g, "text-warning"],
  [/\btext-yellow-800\b/g, "text-warning"],
  // Redundant dark: variants — remove dark:text-gray-* after text-muted-foreground replacement
  [/\s*dark:text-gray-(300|400|500)\b/g, ""],
  [/\s*dark:text-gray-(600|700|800|900)\b/g, ""],
  [/\s*dark:bg-gray-(700|800|900)\b/g, ""],
  [/\s*dark:bg-gray-(50|100|200)\b/g, ""],
  [/\s*dark:border-gray-(600|700|800)\b/g, ""],
];

let totalFiles = 0;
let totalChanges = 0;

for (const f of globSync("client/src/**/*.tsx")) {
  let s = readFileSync(f, "utf8");
  let o = s;
  for (const [re, to] of map) s = s.replace(re, to);
  if (s !== o) {
    writeFileSync(f, s);
    const changes = (s.match(/bg-muted|text-muted-foreground|text-foreground|bg-background|text-destructive|text-success|text-warning|bg-success|bg-warning|bg-destructive/g) || []).length;
    console.log(`✓ ${f}`);
    totalFiles++;
    totalChanges++;
  }
}
console.log(`\nDone: ${totalFiles} files updated.`);
