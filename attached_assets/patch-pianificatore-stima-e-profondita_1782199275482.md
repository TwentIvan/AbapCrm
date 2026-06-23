# Patch pianificatore — richieste di stima + profondità di scomposizione

Tre modifiche chirurgiche a `server/ai-project-agent.ts`, ancorate alla tua versione
corrente (origin). Risolvono i due difetti: la stima presa alla lettera e il tetto "2-5"
che impone la superficialità.

---

## REPLACE 1 — togli il tetto "2-5" nella sezione YOUR TASK

CERCA:
```
4. **Tasks**: Create task breakdown (2-5 tasks typically)
```

SOSTITUISCI CON:
```
4. **Tasks**: Decompose into as many REAL delivery tasks as the scope requires (NOT a fixed 2-5).
   Un'attività complessa "fatta di tanti pezzi" va scomposta in TUTTE le sue unità di lavoro
   significative; usa project.subProjects per i flussi distinti. Mai sotto-scomporre per stare
   in un numero piccolo, mai gonfiare. I task rappresentano lavoro di delivery REALE, non
   meta-task sul leggere o rispondere alla mail.
```

---

## REPLACE 2 — stesso tetto nella checklist finale (YOUR ANALYSIS)

CERCA:
```
4. Break down work into 2-5 specific Tasks (⚠️ STIME DEVONO SOMMARE AL TOTALE PROGETTO!)
```

SOSTITUISCI CON:
```
4. Break down work into as many REAL delivery tasks as the scope requires — depth scales with
   complexity, NOT a fixed 2-5 (⚠️ Σ task effort = project effort!). For an estimate request,
   model the UNDERLYING engagement and let the sum BE the estimate.
```

---

## INSERT — nuova direttiva sulle richieste di stima

Inseriscila subito DOPO il titolo della sezione `### Task Creation (SAP ABAP Specific)`
(prima dell'elenco dei tipi di task):

```
### ⚠️ RICHIESTE DI STIMA / PREVENTIVO (pattern critico)
Quando l'ASK del messaggio è una stima, un preventivo, una quotazione, una valutazione di
fattibilità o un'offerta (parole spia: "stima", "stimare", "preventivo", "quotazione",
"offerta", "fattibilità", "quanto tempo", "quanto costa", "ballpark"), NON creare task che
parlano di "produrre la stima". La stima NON è il lavoro: è il RISULTATO della scomposizione.

Devi invece:
1. Identificare il LAVORO sottostante da stimare (l'intervento reale richiesto nella mail).
2. Scomporre QUEL lavoro nelle sue fasi reali di delivery, ognuna con il suo estimatedEffort.
   Fasi tipiche SAP ABAP (includi solo le pertinenti): analisi requisiti → specifica
   funzionale/tecnica → oggetti DDIC (domini/data element/strutture/tabelle) → sviluppo
   (programmi/classi/function/enhancement) → unit test → test di integrazione →
   trasporto/cutover → documentazione.
3. La stima del progetto è la SOMMA degli effort dei task (project.estimatedEffort = Σ task).
   È QUESTO il senso della regola "la somma deve corrispondere al totale del progetto".
4. project.status = "planning".
5. Al massimo UN task piccolo "Predisposizione e invio preventivo/offerta", se è atteso un
   documento formale — ma è marginale, non è il progetto.

Se l'attività è troppo vaga per essere scomposta (non puoi stimare ciò che non puoi
dimensionare), attiva l'AMBIGUITY GATE: needsClarification=true + clarificationQuestions di
scoping, invece di 2 task superficiali.

PRINCIPIO GENERALE (vale oltre le stime): separa SEMPRE ciò che il mittente ti chiede di
COMUNICARE (una stima, una conferma, una risposta) dal LAVORO da modellare (l'intervento).
Modella il lavoro; la comunicazione è al massimo un singolo task piccolo.
```

---

## Nota — perché bastano queste tre

Il modello non era "stupido": eseguiva alla lettera due istruzioni che lo spingevano lì.
"Fornire una stima" + "2-5 task" = due task sulla stima. Rimuovendo il tetto e dandogli il
pattern corretto (modella il lavoro, la stima è il roll-up), la profondità arriva da sola —
e diventa anche un buon banco di prova per capire se i due modelli rispondono davvero in modo
diverso, una volta che ne fai girare due per davvero (vedi nota sul `modelKeyOverride`).
