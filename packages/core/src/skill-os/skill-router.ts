import {
  SkillRegistry,
  SkillMetadata,
  ExternalSkillMetadata,
  AgentSkillCategory
} from "./skill-registry.js";

export interface SkillRouteMatch {
  primaryCategory?: AgentSkillCategory;
  recommendedSkills: SkillMetadata[];
  externalSkills: ExternalSkillMetadata[];
  matchedKeywords: string[];
  reasoning: string;
}

interface RouteRule {
  id: string;
  category: AgentSkillCategory;
  keywords: string[];
  targetSkillIds: string[];
  targetExternalSkillIds?: string[];
  reasoning: string;
}

export class SkillRouter {
  private rules: RouteRule[] = [
    {
      id: "character-consistency-rule",
      category: "character",
      keywords: ["character consistency", "visually consistent", "identity drift", "facial features", "face", "outfit", "costume", "character appearance"],
      targetSkillIds: ["character-consistency", "identity-qa"],
      reasoning: "Request involves character identity, visual consistency, or costume fidelity."
    },
    {
      id: "cinematography-camera-rule",
      category: "cinematic",
      keywords: ["camera", "cinematic", "push-in", "push in", "pull-out", "pull out", "framing", "dutch angle", "orbit", "tilt", "pan", "composition", "lighting style"],
      targetSkillIds: ["cinematography", "shot-plan"],
      reasoning: "Request involves camera choreography, visual composition, or cinematic grammar."
    },
    {
      id: "deterministic-production-rule",
      category: "production",
      keywords: ["deterministic", "hyperframes", "2d animation", "layer transform", "parallax", "motion graphics"],
      targetSkillIds: ["production-route", "hyperframes-production"],
      targetExternalSkillIds: ["hyperframes", "hyperframes-animation"],
      reasoning: "Request specifies deterministic or HyperFrames-based animation execution."
    },
    {
      id: "general-production-rule",
      category: "production",
      keywords: ["render", "production", "generate video", "retake", "continuation", "reference binding"],
      targetSkillIds: ["production-route", "reference-binding", "continuation", "retake"],
      reasoning: "Request involves production strategy, rendering, or shot continuation."
    },
    {
      id: "phase-workflow-rule",
      category: "development",
      keywords: ["phase", "phase 4", "phase 3.5", "develop", "implement feature", "audit", "architecture", "refactor"],
      targetSkillIds: ["repo-audit", "architecture-review", "implementation", "testing", "phase-gate"],
      reasoning: "Request targets engineering phases, architecture reviews, or feature development."
    },
    {
      id: "story-analysis-rule",
      category: "story",
      keywords: ["story", "script", "narrative", "beats", "extract", "dialogue", "source preservation", "hallucination", "coverage"],
      targetSkillIds: ["story-analyze", "source-preservation", "story-coverage"],
      reasoning: "Request involves script parsing, narrative beat extraction, or source coverage verification."
    },
    {
      id: "canon-universe-rule",
      category: "universe",
      keywords: ["canon", "universe", "conflict", "series", "world state", "lore", "persistent"],
      targetSkillIds: ["universe-resolve", "canon-conflict", "world-state-check"],
      reasoning: "Request relates to persistent universe resolution or canonical fact verification."
    },
    {
      id: "directing-scene-rule",
      category: "directing",
      keywords: ["direct", "scene direct", "shot plan", "director profile", "acting", "scene breakdown"],
      targetSkillIds: ["scene-direct", "shot-plan", "director-qa"],
      reasoning: "Request focuses on director-level scene staging, pacing, and shot breakdown."
    },
    {
      id: "qa-continuity-rule",
      category: "qa",
      keywords: ["continuity", "qa", "visual qa", "inspect render", "glitch", "artifact", "defect", "180 degree"],
      targetSkillIds: ["continuity-qa", "visual-qa", "director-qa"],
      reasoning: "Request relates to quality assurance, visual inspection, or continuity audits."
    }
  ];

  constructor(private registry: SkillRegistry) {}

  public route(input: string): SkillRouteMatch {
    const normalized = input.toLowerCase();
    const matchedRules: { rule: RouteRule; score: number; matchedKeywords: string[] }[] = [];

    for (const rule of this.rules) {
      const matchedKeywords = rule.keywords.filter((kw) => normalized.includes(kw));
      if (matchedKeywords.length > 0) {
        matchedRules.push({
          rule,
          score: matchedKeywords.length,
          matchedKeywords
        });
      }
    }

    // Sort by score descending
    matchedRules.sort((a, b) => b.score - a.score);

    const recommendedSkillIds = new Set<string>();
    const recommendedExternalSkillIds = new Set<string>();
    const allMatchedKeywords: string[] = [];
    const reasoningParts: string[] = [];

    let primaryCategory: AgentSkillCategory | undefined;

    if (matchedRules.length > 0) {
      primaryCategory = matchedRules[0].rule.category;

      for (const { rule, matchedKeywords } of matchedRules) {
        allMatchedKeywords.push(...matchedKeywords);
        reasoningParts.push(rule.reasoning);
        for (const id of rule.targetSkillIds) {
          recommendedSkillIds.add(id);
        }
        if (rule.targetExternalSkillIds) {
          for (const id of rule.targetExternalSkillIds) {
            recommendedExternalSkillIds.add(id);
          }
        }
      }
    } else {
      // Default fallback to studio router skill
      recommendedSkillIds.add("studio");
      reasoningParts.push("No specific domain keywords matched; routing to main Studio router.");
    }

    const recommendedSkills: SkillMetadata[] = [];
    for (const id of recommendedSkillIds) {
      const skill = this.registry.getSkill(id);
      if (skill && !("type" in skill && skill.type === "EXTERNAL")) {
        recommendedSkills.push(skill as SkillMetadata);
      }
    }

    const externalSkills: ExternalSkillMetadata[] = [];
    for (const id of recommendedExternalSkillIds) {
      const ext = this.registry.getSkill(id);
      if (ext && "type" in ext && ext.type === "EXTERNAL") {
        externalSkills.push(ext as ExternalSkillMetadata);
      }
    }

    return {
      primaryCategory,
      recommendedSkills,
      externalSkills,
      matchedKeywords: Array.from(new Set(allMatchedKeywords)),
      reasoning: reasoningParts.join(" ")
    };
  }
}
