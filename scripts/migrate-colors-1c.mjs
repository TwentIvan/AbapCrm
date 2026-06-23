// scripts/migrate-colors-1c.mjs — node scripts/migrate-colors-1c.mjs
// Part 1C: blue → primary token (unambiguous azione/link cases)
import { readFileSync, writeFileSync } from "fs";
import { globSync } from "glob";

const map = [
  // Blue backgrounds → primary with opacity
  [/\bbg-blue-600\b/g, "bg-primary"],
  [/\bhover:bg-blue-700\b/g, "hover:bg-primary/90"],
  [/\bhover:bg-blue-800\b/g, "hover:bg-primary/80"],
  [/\bhover:bg-blue-100\b/g, "hover:bg-primary/15"],
  [/\bhover:bg-blue-50\b/g, "hover:bg-primary/10"],
  [/\bhover:shadow-sm\b/g, "hover:shadow-sm"],     // keep
  [/\bbg-blue-500\b/g, "bg-primary"],
  [/\bbg-blue-100\b/g, "bg-primary/10"],
  // bg-blue-50 with opacity modifier (e.g. bg-blue-50/60) → handle separately
  [/\bbg-blue-50\/\d+\b/g, "bg-primary/5"],
  [/\bbg-blue-50\b/g, "bg-primary/5"],
  // Blue text → primary
  [/\btext-blue-800\b/g, "text-primary"],
  [/\btext-blue-700\b/g, "text-primary"],
  [/\btext-blue-600\b/g, "text-primary"],
  [/\btext-blue-500\b/g, "text-primary"],
  // Blue borders → primary opacity
  [/\bborder-blue-500\b/g, "border-primary/50"],
  [/\bborder-blue-400\b/g, "border-primary/40"],
  [/\bborder-blue-300\b/g, "border-primary/30"],
  [/\bborder-blue-200\b/g, "border-primary/20"],
  [/\bborder-l-blue-500\b/g, "border-l-primary"],
  // Redundant dark: blue variants (now token handles dark)
  [/\s*dark:bg-blue-\d+(?:\/\d+)?\b/g, ""],
  [/\s*dark:border-blue-\d+\b/g, ""],
  [/\s*dark:text-blue-\d+\b/g, ""],
  // Indigo → primary (SAP system type badge in sap-landscape-import)
  [/\bbg-indigo-100\b/g, "bg-info/10"],
  [/\btext-indigo-800\b/g, "text-info"],
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
