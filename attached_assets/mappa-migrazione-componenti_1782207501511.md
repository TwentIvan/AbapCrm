# Mappa di migrazione — componenti as-is → token semantici

Obiettivo: instradare i ~1.723 colori Tailwind hardcoded e le 128 emoji verso i token
semantici e le icone lucide, così che tema e dark mode funzionino da soli e l'estetica sia
quella del to-be. Documento operativo per il codemod + la passata manuale.

---

## Parte 0 — Fondamenta dei token (prerequisito)

### 0.1 Converti i token al formato a canali (sblocca le opacità)
Oggi i token sono stringhe `hsl(...)` intere, quindi `bg-success/10` NON funziona. Passa
al formato a canali in `client/src/index.css`:

```css
/* prima */  --primary: hsl(221.2, 83.2%, 53.3%);
/* dopo  */  --primary: 221.2 83.2% 53.3%;
```

e in `tailwind.config.ts` avvolgi i colori con alpha:

```ts
primary: {
  DEFAULT: "hsl(var(--primary) / <alpha-value>)",
  foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
},
// ...stesso pattern per tutti i token esistenti
```

È meccanico ma tocca tutti i token: fallo una volta, in un commit isolato.

### 0.2 Aggiungi i token semantici mancanti
shadcn di default NON ha success/warning/info/brand: vanno creati, altrimenti verde e
ambra non hanno dove mappare.

```css
:root {
  --brand: 213 100% 47%;          /* #0070F2 blu SAP (wordmark/identità) */
  --brand-foreground: 0 0% 100%;
  --success: 152 56% 36%;
  --success-foreground: 0 0% 100%;
  --warning: 35 92% 45%;
  --warning-foreground: 0 0% 100%;
  --info: 211 92% 48%;
  --info-foreground: 0 0% 100%;
}
.dark {
  --brand: 211 100% 66%;          /* #4DA3FF — il blu resta blu in dark */
  --brand-foreground: 222 47% 8%;
  --success: 152 50% 55%;
  --warning: 38 95% 60%;
  --info: 211 95% 66%;
}
```

```ts
brand:   { DEFAULT: "hsl(var(--brand) / <alpha-value>)",   foreground: "hsl(var(--brand-foreground) / <alpha-value>)" },
success: { DEFAULT: "hsl(var(--success) / <alpha-value>)", foreground: "hsl(var(--success-foreground) / <alpha-value>)" },
warning: { DEFAULT: "hsl(var(--warning) / <alpha-value>)", foreground: "hsl(var(--warning-foreground) / <alpha-value>)" },
info:    { DEFAULT: "hsl(var(--info) / <alpha-value>)",    foreground: "hsl(var(--info-foreground) / <alpha-value>)" },
```

(Decisione ancora aperta, indipendente da qui: portare anche `--primary` sul blu SAP o
lasciarlo all'attuale `#3b82f6`. Il `--brand` sopra è già SAP a prescindere.)

---

## Parte 1 — Mappa colore hardcoded → token

### 1A · Automatici sicuri (neutri / semantica univoca)
Si possono sostituire via codemod senza rivedere il contesto.

| Hardcoded | Token |
|---|---|
| `text-gray-400/500/600` | `text-muted-foreground` |
| `text-gray-700/800/900` | `text-foreground` |
| `bg-gray-50/100` | `bg-muted` |
| `bg-gray-800/900` | `bg-card` (superficie scura) |
| `border-gray-200/300` | `border-border` |
| `bg-white` | `bg-background` o `bg-card` (card) |
| `text-red-500/600/700` | `text-destructive` |
| `bg-red-50/100` | `bg-destructive/10` |
| `border-red-200/300` | `border-destructive/30` |

### 1B · Semantici quasi-sicuri (verde/ambra → success/warning)
Quasi sempre stato; rivedere solo i casi decorativi.

| Hardcoded | Token |
|---|---|
| `text-green-600/700` | `text-success` |
| `bg-green-50/100` | `bg-success/10` |
| `border-green-...` | `border-success/30` |
| `text-amber-600/700`, `text-yellow-600/700` | `text-warning` |
| `bg-amber-50/100`, `bg-yellow-50/100` | `bg-warning/10` |

### 1C · Ambigui (passata manuale, dipende dal contesto)
Il codemod NON li tocca: serve giudizio.

| Hardcoded | Possibili token | Regola |
|---|---|---|
| `text-blue-600` / `bg-blue-600` | `primary` \| `info` \| `brand` | azione/link → `primary`; messaggio informativo → `info`; logo/identità → `brand` |
| `bg-blue-50/100` | `bg-primary/10` \| `bg-info/10` | come sopra |
| `text-purple-*` / `bg-purple-*` | da decidere | nessun ruolo semantico ovvio: probabilmente "AI/agente". Decidere se creare un token dedicato (es. `--accent-agent`) o usare un colore `chart-*` |

Dopo la sostituzione, **rimuovi i `dark:` ridondanti**: una volta che la classe è un token
(`text-muted-foreground`), il suo `dark:text-gray-300` accanto è inutile e va tolto — i
token si adattano da soli. È metà del guadagno in dark.

---

## Parte 2 — Emoji → icone lucide

128 emoji (43 diverse). lucide-react è già importato 144 volte: si rimpiazzano con import.

| Emoji | lucide | Uso tipico |
|---|---|---|
| 🔍 (×32) | `Search` | bottoni/campi ricerca |
| ✅ ✓ (×28) | `Check` / `CheckCircle2` | conferma, completato |
| ⚠️ | `AlertTriangle` | warning |
| 📝 | `FileText` / `Pencil` | nota, modifica |
| 🧪 | `FlaskConical` | test/validazione |
| 🚀 | `Rocket` / `Play` | avvio (per "avvia agente" meglio `Play`) |
| 📋 | `ClipboardList` | task/lista |
| 🔗 | `Link` | collegamento |
| 💡 | `Lightbulb` | suggerimento |
| 🤖 | `Bot` | agente AI |
| 📍 | `MapPin` | posizione/sistema |
| 👤 | `User` | persona |
| ★ ☆ | `Star` (fill vs outline) | priorità/preferito |

Regola di coerenza: una sola dimensione di default (16px inline, 20px nei bottoni grandi),
`stroke-width` di default lucide, colore ereditato (`currentColor`), mai colore hardcoded
sull'icona.

---

## Parte 3 — Elevazione

`shadow-lg`/`xl` compaiono in 19 file mentre i token-ombra sono ad alpha zero: superfici
che fluttuano per caso. Regola unica:

- Card e righe lista: niente ombra → bordo `border border-border` + stratificazione di
  sfondo (`bg-card` su `bg-background`). Rimuovi `shadow-lg`/`xl` da questi.
- Solo overlay (dropdown, popover, dialog, tooltip): un'ombra sottile e reale (es.
  `shadow-md` con un token-ombra ad alpha basso, non zero).

---

## Parte 4 — Codemod e sequenza

### Script (sottoinsieme sicuro, parti 1A + 1B)
Un piccolo codemod regex sui `.tsx`, da rivedere in diff prima del commit:

```js
// scripts/migrate-colors.mjs  —  node scripts/migrate-colors.mjs
import { readFileSync, writeFileSync } from "fs";
import { globSync } from "glob";

const map = [
  [/\btext-gray-(400|500|600)\b/g, "text-muted-foreground"],
  [/\btext-gray-(700|800|900)\b/g, "text-foreground"],
  [/\bbg-gray-(50|100)\b/g, "bg-muted"],
  [/\bborder-gray-(200|300)\b/g, "border-border"],
  [/\btext-red-(500|600|700)\b/g, "text-destructive"],
  [/\bbg-red-(50|100)\b/g, "bg-destructive/10"],
  [/\btext-green-(600|700)\b/g, "text-success"],
  [/\bbg-green-(50|100)\b/g, "bg-success/10"],
  [/\btext-(amber|yellow)-(600|700)\b/g, "text-warning"],
  [/\bbg-(amber|yellow)-(50|100)\b/g, "bg-warning/10"],
];

for (const f of globSync("client/src/**/*.tsx")) {
  let s = readFileSync(f, "utf8"), o = s;
  for (const [re, to] of map) s = s.replace(re, to);
  if (s !== o) writeFileSync(f, s);
}
```

(Il codemod NON tocca blu/viola: restano alla passata manuale 1C.)

### Sequenza consigliata
1. Parte 0 (formato token + token nuovi) — commit isolato, verifica che l'app compili e i colori esistenti siano invariati.
2. Codemod 1A+1B — diff, commit.
3. Rimozione dei `dark:` ridondanti accanto ai token appena introdotti.
4. Passata manuale 1C (blu/viola) partendo dai componenti più usati.
5. Emoji → lucide.
6. Elevazione: togli gli `shadow-lg` dalle card.

Si fa per gradi, sempre con dark mode controllato dopo ogni passo. Nessuna logica toccata,
solo presentazione.
