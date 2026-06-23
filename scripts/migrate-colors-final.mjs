// scripts/migrate-colors-final.mjs — remaining green-500/600 and orange → tokens
import { readFileSync, writeFileSync } from "fs";
import { globSync } from "glob";

const map = [
  // green-500/600/700 backgrounds → success (solid buttons, indicators)
  [/\bbg-green-600\b/g, "bg-success"],
  [/\bhover:bg-green-700\b/g, "hover:bg-success/90"],
  [/\bbg-green-500\b/g, "bg-success"],
  [/\bhover:bg-green-600\b/g, "hover:bg-success/90"],
  [/\bborder-l-green-500\b/g, "border-l-success"],
  [/\bborder-l-green-600\b/g, "border-l-success"],
  [/\btext-green-300\b/g, "text-success"],
  [/\btext-green-400\b/g, "text-success"],
  // orange → warning (semantic state)
  [/\bbg-orange-100\b/g, "bg-warning/10"],
  [/\bbg-orange-50\b/g, "bg-warning/5"],
  [/\btext-orange-800\b/g, "text-warning"],
  [/\btext-orange-700\b/g, "text-warning"],
  [/\btext-orange-600\b/g, "text-warning"],
  [/\btext-orange-500\b/g, "text-warning"],
  [/\btext-orange-300\b/g, "text-warning"],
  [/\bborder-orange-200\b/g, "border-warning/20"],
  [/\bborder-orange-300\b/g, "border-warning/30"],
  [/\bborder-orange-400\b/g, "border-warning/40"],
  [/\bborder-orange-500\b/g, "border-warning/50"],
  [/\bborder-orange-900\b/g, "border-warning/30"],
  // orange chart/calendar dot/legend markers keep the visual (leave bg-orange-500 dot)
  // but bg-orange-500 in gantt pipelines → warning
  [/\bbg-orange-500\b/g, "bg-warning"],
  [/\bbg-orange-200\b/g, "bg-warning/20"],
  [/\bbg-orange-300\b/g, "bg-warning/30"],
  // Remove redundant dark: green/orange after token replacement
  [/\s*dark:bg-green-\d+(?:\/\d+)?\b/g, ""],
  [/\s*dark:border-green-\d+\b/g, ""],
  [/\s*dark:text-green-\d+\b/g, ""],
  [/\s*dark:bg-orange-\d+(?:\/\d+)?\b/g, ""],
  [/\s*dark:text-orange-\d+\b/g, ""],
  [/\s*dark:border-orange-\d+\b/g, ""],
];

let totalFiles = 0;
for (const f of globSync("client/src/**/*.tsx")) {
  let s = readFileSync(f, "utf8");
  let o = s;
  for (const [re, to] of map) s = s.replace(re, to);
  if (s !== o) {
    writeFileSync(f, s);
    console.log(`✓ ${f}`);
    totalFiles++;
  }
}
console.log(`\nDone: ${totalFiles} files updated.`);
