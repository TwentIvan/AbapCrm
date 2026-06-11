---
name: AI Gateway Phase 2 Architecture
description: Cost estimation, budget guardrail, model resolution, and analytics for the AI task executor
---

## Model Resolution Order (ai-task-executor.ts)
task.agentModelId → getDefaultModelKey(orgId, "openai/gpt-4o") → env AI_DEFAULT_MODEL_KEY → hardcoded fallback

## Budget Guardrail
Before calling aiGateway.complete(), check estimatedCostEur >= task.budgetCapEur.
If hit: set execution status to "paused_budget", store capEur in analysisResult, push error result with action "raise_budget", continue loop.
Resume via POST /api/executions/:id/resume — checks new cap > old cap before re-running.

## Cost Persistence (ai_task_executions)
After successful AI call, fetch model pricing from ai_models table by modelKey, call getUsdEurRate(orgId), compute totalCostUsd and totalCostEurVal, persist both as totalCost (USD string) and totalCostEur (EUR string) with 6 decimal places.

## Estimator (server/cost-estimator.ts)
estimateTaskCost({ taskId, modelKey, organizationId }) → { tokensMin, tokensMax, costMinEur, costMaxEur, basis, sampleSize }
Historical calibration: uses past completed executions for p25/p90 token range. Falls back to heuristic if < 3 samples.
Uses messages.body (NOT messages.content) for linked message content.

## FX Rate (server/fx.ts)
getUsdEurRate(orgId): reads org.settings.fxUsdEur first, falls back to hardcoded 0.92.
usdToEur(usd, rate): simple multiply.

## Key UI Components
- task-form.tsx: Agente AI section with provider filter → model select → Calcola Preventivo → budget cap field
- task-form-container.tsx: 4-tab layout (Dettagli / Messaggi / Storico / Costi AI), AiCostsPanel shows preventivo vs consuntivo with varianza %
- ai-analytics-page.tsx: /ai-analytics, 3 tables (by model, by task type, by project), 90-day window

## Settings Whitelist
PATCH /api/organizations/:id/settings only allows: aiDefaultModelKey, fxUsdEur.

**Why:** The Header component requires both `title` and `subtitle` props (subtitle is required in HeaderProps). Always pass subtitle even if empty.
