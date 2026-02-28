import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import {
  skillCatalog,
  resourceSkillAssessments,
  projectSkillRequirements,
  taskSkillRequirements,
  tasks,
  humanResources,
} from "@shared/schema";

interface SkillNode {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  children: SkillNode[];
}

interface DerivedLevel {
  effectiveLevel: number;
  isDerived: boolean;
  coverage: number;
  leafTotal: number;
  leafWithEvidence: number;
}

export interface RequirementEntry {
  skillId: string;
  skillName: string;
  requiredLevel: number;
  mode: "MUST" | "SCORE" | "TIEBREAK";
  weight: number;
  origin: "project" | "task" | "merged";
}

export interface RequirementSet {
  requirements: RequirementEntry[];
  breakdown: Record<string, { project?: RequirementEntry; task?: RequirementEntry; merged: RequirementEntry }>;
}

export interface MatchResult {
  resourceId: string;
  resourceName: string;
  eligible: boolean;
  score: number;
  mustFailures: { skillId: string; skillName: string; requiredLevel: number; actualLevel: number }[];
  topMatches: { skillId: string; skillName: string; contribution: number; ratio: number }[];
  gaps: { skillId: string; skillName: string; penalty: number; gap: number }[];
}

export async function isLeafSkill(skillId: string): Promise<boolean> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(skillCatalog)
    .where(and(eq(skillCatalog.parentId, skillId), eq(skillCatalog.isActive, true)));
  return Number(result[0]?.count || 0) === 0;
}

export async function getSkillTree(): Promise<SkillNode[]> {
  const allSkills = await db
    .select({
      id: skillCatalog.id,
      name: skillCatalog.name,
      parentId: skillCatalog.parentId,
      isActive: skillCatalog.isActive,
    })
    .from(skillCatalog)
    .where(eq(skillCatalog.isActive, true));

  const nodeMap = new Map<string, SkillNode>();
  allSkills.forEach(s => nodeMap.set(s.id, { ...s, children: [] }));

  const roots: SkillNode[] = [];
  nodeMap.forEach(node => {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function collectLeafIds(node: SkillNode): string[] {
  if (node.children.length === 0) return [node.id];
  return node.children.flatMap(collectLeafIds);
}

function collectAllDescendantLeafIds(node: SkillNode): string[] {
  return collectLeafIds(node);
}

export async function computeDerivedSkillLevels(
  resourceId: string
): Promise<Map<string, DerivedLevel>> {
  const tree = await getSkillTree();
  const assessments = await db
    .select()
    .from(resourceSkillAssessments)
    .where(eq(resourceSkillAssessments.resourceId, resourceId));

  const assessmentMap = new Map<string, number>();
  assessments.forEach(a => assessmentMap.set(a.skillId, a.level));

  const result = new Map<string, DerivedLevel>();

  const allSkills = await db
    .select({ id: skillCatalog.id, name: skillCatalog.name, parentId: skillCatalog.parentId })
    .from(skillCatalog)
    .where(eq(skillCatalog.isActive, true));

  const nodeMap = new Map<string, SkillNode>();
  allSkills.forEach(s => nodeMap.set(s.id, { ...s, isActive: true, children: [] }));
  nodeMap.forEach(node => {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node);
    }
  });

  function computeForNode(node: SkillNode): DerivedLevel {
    if (node.children.length === 0) {
      const level = assessmentMap.get(node.id) || 0;
      const derived: DerivedLevel = {
        effectiveLevel: level,
        isDerived: false,
        coverage: level > 0 ? 1 : 0,
        leafTotal: 1,
        leafWithEvidence: level > 0 ? 1 : 0,
      };
      result.set(node.id, derived);
      return derived;
    }

    const childResults = node.children.map(computeForNode);
    const leafTotal = childResults.reduce((s, r) => s + r.leafTotal, 0);
    const leafWithEvidence = childResults.reduce((s, r) => s + r.leafWithEvidence, 0);

    const leafIds = collectAllDescendantLeafIds(node);
    const leafLevels = leafIds.map(id => assessmentMap.get(id) || 0);
    const proficiency = leafTotal > 0 ? leafLevels.reduce((s, l) => s + l, 0) / leafTotal : 0;
    const coverage = leafTotal > 0 ? leafWithEvidence / leafTotal : 0;
    const effectiveLevel = Math.min(5, Math.max(0, Math.round(proficiency * Math.sqrt(coverage))));

    const derived: DerivedLevel = {
      effectiveLevel,
      isDerived: true,
      coverage,
      leafTotal,
      leafWithEvidence,
    };
    result.set(node.id, derived);
    return derived;
  }

  nodeMap.forEach(node => {
    if (!node.parentId || !nodeMap.has(node.parentId)) {
      computeForNode(node);
    }
  });

  nodeMap.forEach((node, id) => {
    if (!result.has(id)) {
      computeForNode(node);
    }
  });

  return result;
}

const MODE_SEVERITY: Record<string, number> = { MUST: 3, SCORE: 2, TIEBREAK: 1 };

function maxSeverityMode(a: string, b: string): "MUST" | "SCORE" | "TIEBREAK" {
  const sa = MODE_SEVERITY[a] || 0;
  const sb = MODE_SEVERITY[b] || 0;
  return (sa >= sb ? a : b) as "MUST" | "SCORE" | "TIEBREAK";
}

export async function mergeRequirements(
  projectId: string | null,
  taskId?: string | null
): Promise<RequirementSet> {
  const skillNames = new Map<string, string>();
  const loadSkillName = async (skillId: string) => {
    if (skillNames.has(skillId)) return skillNames.get(skillId)!;
    const s = await db.select({ name: skillCatalog.name }).from(skillCatalog).where(eq(skillCatalog.id, skillId));
    const name = s[0]?.name || skillId;
    skillNames.set(skillId, name);
    return name;
  };

  const projReqs = projectId
    ? await db
        .select()
        .from(projectSkillRequirements)
        .where(eq(projectSkillRequirements.projectId, projectId))
    : [];

  const projMap = new Map<string, RequirementEntry>();
  for (const r of projReqs) {
    const name = await loadSkillName(r.skillId);
    projMap.set(r.skillId, {
      skillId: r.skillId,
      skillName: name,
      requiredLevel: r.requiredLevel,
      mode: r.mode as "MUST" | "SCORE" | "TIEBREAK",
      weight: r.weight,
      origin: "project",
    });
  }

  const breakdown: RequirementSet["breakdown"] = {};

  if (taskId) {
    const taskReqs = await db
      .select()
      .from(taskSkillRequirements)
      .where(eq(taskSkillRequirements.taskId, taskId));

    const allSkillIds = new Set([...projMap.keys(), ...taskReqs.map(t => t.skillId)]);

    for (const skillId of allSkillIds) {
      const proj = projMap.get(skillId);
      const taskReq = taskReqs.find(t => t.skillId === skillId);
      const name = await loadSkillName(skillId);

      let merged: RequirementEntry;
      const taskEntry: RequirementEntry | undefined = taskReq
        ? {
            skillId,
            skillName: name,
            requiredLevel: taskReq.requiredLevel,
            mode: taskReq.mode as "MUST" | "SCORE" | "TIEBREAK",
            weight: taskReq.weight,
            origin: "task",
          }
        : undefined;

      if (taskReq && taskReq.override === 1) {
        merged = { ...taskEntry!, origin: "merged" };
      } else if (proj && taskEntry) {
        merged = {
          skillId,
          skillName: name,
          requiredLevel: Math.max(proj.requiredLevel, taskEntry.requiredLevel),
          mode: maxSeverityMode(proj.mode, taskEntry.mode),
          weight: Math.max(proj.weight, taskEntry.weight),
          origin: "merged",
        };
      } else if (proj) {
        merged = { ...proj, origin: "merged" };
      } else {
        merged = { ...taskEntry!, origin: "merged" };
      }

      breakdown[skillId] = { project: proj, task: taskEntry, merged };
    }
  } else {
    const allTasks = projectId
      ? await db
          .select({ id: tasks.id })
          .from(tasks)
          .where(eq(tasks.projectId, projectId))
      : [];

    const taskIds = allTasks.map(t => t.id);
    let rollupMap = new Map<string, RequirementEntry>();

    if (taskIds.length > 0) {
      for (const tid of taskIds) {
        const taskReqs = await db
          .select()
          .from(taskSkillRequirements)
          .where(eq(taskSkillRequirements.taskId, tid));

        for (const tr of taskReqs) {
          const name = await loadSkillName(tr.skillId);
          const existing = rollupMap.get(tr.skillId);
          if (existing) {
            existing.requiredLevel = Math.max(existing.requiredLevel, tr.requiredLevel);
            existing.mode = maxSeverityMode(existing.mode, tr.mode);
            existing.weight = Math.max(existing.weight, tr.weight);
          } else {
            rollupMap.set(tr.skillId, {
              skillId: tr.skillId,
              skillName: name,
              requiredLevel: tr.requiredLevel,
              mode: tr.mode as "MUST" | "SCORE" | "TIEBREAK",
              weight: tr.weight,
              origin: "task",
            });
          }
        }
      }
    }

    const allSkillIds = new Set([...projMap.keys(), ...rollupMap.keys()]);
    for (const skillId of allSkillIds) {
      const proj = projMap.get(skillId);
      const rollup = rollupMap.get(skillId);
      const name = await loadSkillName(skillId);

      let merged: RequirementEntry;
      if (proj && rollup) {
        merged = {
          skillId,
          skillName: name,
          requiredLevel: Math.max(proj.requiredLevel, rollup.requiredLevel),
          mode: maxSeverityMode(proj.mode, rollup.mode),
          weight: Math.max(proj.weight, rollup.weight),
          origin: "merged",
        };
      } else if (proj) {
        merged = { ...proj, origin: "merged" };
      } else {
        merged = { ...rollup!, origin: "merged" };
      }

      breakdown[skillId] = { project: proj, task: rollup, merged };
    }
  }

  return {
    requirements: Object.values(breakdown).map(b => b.merged),
    breakdown,
  };
}

export async function computeMatch(
  candidateResourceIds: string[],
  requirementSet: RequirementSet,
  options?: { includeDerived?: boolean; lambda?: number }
): Promise<MatchResult[]> {
  const lambda = options?.lambda ?? 0.5;
  const results: MatchResult[] = [];

  const resourceNames = new Map<string, string>();
  for (const rid of candidateResourceIds) {
    const hr = await db.select({ firstName: humanResources.firstName, lastName: humanResources.lastName })
      .from(humanResources).where(eq(humanResources.id, rid));
    resourceNames.set(rid, hr[0] ? `${hr[0].firstName} ${hr[0].lastName}`.trim() : rid);
  }

  for (const resourceId of candidateResourceIds) {
    const assessments = await db
      .select()
      .from(resourceSkillAssessments)
      .where(eq(resourceSkillAssessments.resourceId, resourceId));

    const assessmentMap = new Map<string, number>();
    assessments.forEach(a => assessmentMap.set(a.skillId, a.level));

    let derivedMap: Map<string, DerivedLevel> | null = null;
    if (options?.includeDerived !== false) {
      derivedMap = await computeDerivedSkillLevels(resourceId);
    }

    const mustFailures: MatchResult["mustFailures"] = [];
    const matchDetails: { skillId: string; skillName: string; contribution: number; ratio: number }[] = [];
    const gapDetails: { skillId: string; skillName: string; penalty: number; gap: number }[] = [];

    for (const req of requirementSet.requirements) {
      let effectiveLevel = assessmentMap.get(req.skillId) || 0;
      if (derivedMap && derivedMap.has(req.skillId)) {
        effectiveLevel = Math.max(effectiveLevel, derivedMap.get(req.skillId)!.effectiveLevel);
      }

      const ratio = Math.min(effectiveLevel / req.requiredLevel, 1);
      const gap = Math.max(0, req.requiredLevel - effectiveLevel);
      const contrib = req.weight * ratio;
      const penalty = req.weight * gap * gap;

      if (req.mode === "MUST" && effectiveLevel < req.requiredLevel) {
        mustFailures.push({
          skillId: req.skillId,
          skillName: req.skillName,
          requiredLevel: req.requiredLevel,
          actualLevel: effectiveLevel,
        });
      }

      matchDetails.push({ skillId: req.skillId, skillName: req.skillName, contribution: contrib, ratio });
      gapDetails.push({ skillId: req.skillId, skillName: req.skillName, penalty, gap });
    }

    const totalWeight = requirementSet.requirements.reduce((s, r) => s + r.weight, 0);
    const totalContrib = matchDetails.reduce((s, m) => s + m.contribution, 0);
    const totalPenalty = gapDetails.reduce((s, g) => s + g.penalty, 0);
    const rawScore = totalWeight > 0 ? (totalContrib - lambda * totalPenalty) / totalWeight : 0;
    const score = Math.max(0, Math.min(1, rawScore));
    const eligible = mustFailures.length === 0;

    const topMatches = [...matchDetails].sort((a, b) => b.contribution - a.contribution).slice(0, 5);
    const gaps = [...gapDetails].filter(g => g.gap > 0).sort((a, b) => b.penalty - a.penalty).slice(0, 5);

    results.push({ resourceId, resourceName: resourceNames.get(resourceId) || resourceId, eligible, score, mustFailures, topMatches, gaps });
  }

  results.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return b.score - a.score;
  });

  return results;
}
