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
  dependencyChain?: string[];
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
      id: "live-provider-rule",
      category: "production",
      keywords: [
        "gemini api",
        "check gemini live",
        "gemini live",
        "live provider",
        "provider validation",
        "live external",
        "gemini",
        "waiting_for_provider"
      ],
      targetSkillIds: ["live-provider-validation"],
      reasoning: "Request involves live external provider execution, Gemini API interactions, or provider provenance."
    },
    {
      id: "production-trust-evidence-rule",
      category: "production",
      keywords: [
        "why can't this run become master verified",
        "master production verified",
        "validate production evidence",
        "production trust",
        "acceptance bundle",
        "sha-256 binding",
        "master verified",
        "candidate != canon",
        "evidence integrity",
        "provenance"
      ],
      targetSkillIds: ["production-trust-evidence"],
      reasoning: "Request involves cryptographic media verification, provenance auditing, or master production status."
    },
    {
      id: "flow-operator-rule",
      category: "production",
      keywords: [
        "prepare google flow generation",
        "google flow handoff",
        "google flow",
        "flow operator",
        "flow handoff",
        "prepare google flow",
        "flow generation",
        "needs_user_action"
      ],
      targetSkillIds: ["flow-operator-workflow"],
      reasoning: "Request targets the human-in-the-loop Google Flow handoff, generation, or media import process."
    },
    {
      id: "release-security-rule",
      category: "development",
      keywords: [
        "audit secrets and ffmpeg security",
        "check leaked api key",
        "ffmpeg security",
        "api key leak",
        "audit secrets",
        "command injection",
        "path traversal",
        "release security",
        "secret",
        "leak"
      ],
      targetSkillIds: ["release-security"],
      reasoning: "Request involves security scanning, secret leakage prevention, or process injection defense."
    },
    {
      id: "release-validation-rule",
      category: "development",
      keywords: [
        "are we ready to release",
        "can we release",
        "ready to release",
        "release gate",
        "release ready",
        "release validation",
        "pilot verification",
        "acceptance manifest",
        "release"
      ],
      targetSkillIds: ["release-validation"],
      reasoning: "Request evaluates release readiness across stratified gates, media checks, and approval states."
    },
    {
      id: "retake-continuation-rule",
      category: "production",
      keywords: [
        "retake only shot",
        "continuity broken",
        "shot continuation",
        "retake shot",
        "reshoot",
        "retake",
        "continuation"
      ],
      targetSkillIds: ["retake", "continuation", "continuity-qa"],
      reasoning: "Request targets shot re-generation, continuation chaining, or defect correction."
    },
    {
      id: "character-consistency-rule",
      category: "character",
      keywords: [
        "character consistency",
        "visually consistent",
        "identity drift",
        "facial features",
        "character appearance",
        "changed face",
        "face changed",
        "character face",
        "face",
        "outfit",
        "costume"
      ],
      targetSkillIds: ["character-consistency", "identity-qa"],
      reasoning: "Request involves character identity, visual consistency, or costume fidelity."
    },
    {
      id: "cinematography-camera-rule",
      category: "cinematic",
      keywords: [
        "shot sequence breaks 180 degree rule",
        "camera direction is wrong",
        "camera direction",
        "180 degree",
        "push-in",
        "push in",
        "pull-out",
        "pull out",
        "framing",
        "dutch angle",
        "orbit",
        "tilt",
        "pan",
        "cinematic",
        "camera",
        "composition",
        "lighting style"
      ],
      targetSkillIds: ["cinematography", "director-qa"],
      reasoning: "Request involves camera choreography, visual composition, or cinematic grammar."
    },
    {
      id: "repo-architecture-rule",
      category: "development",
      keywords: [
        "check latest repo architecture",
        "latest repo architecture",
        "repo audit",
        "architectural tenets",
        "architecture"
      ],
      targetSkillIds: ["repo-audit", "architecture-review"],
      reasoning: "Request targets repository health, architectural invariants, or tenet enforcement."
    },
    {
      id: "deterministic-production-rule",
      category: "production",
      keywords: [
        "hyperframes camera animation",
        "hyperframes animation",
        "deterministic",
        "hyperframes",
        "2d animation",
        "layer transform",
        "parallax",
        "motion graphics"
      ],
      targetSkillIds: ["production-route", "hyperframes-production"],
      targetExternalSkillIds: ["hyperframes", "hyperframes-animation"],
      reasoning: "Request specifies deterministic or HyperFrames-based animation execution."
    },
    {
      id: "general-production-rule",
      category: "production",
      keywords: [
        "render",
        "production",
        "generate video",
        "reference binding"
      ],
      targetSkillIds: ["production-route", "reference-binding"],
      reasoning: "Request involves production strategy, rendering, or reference asset binding."
    },
    {
      id: "phase-workflow-rule",
      category: "development",
      keywords: [
        "phase 4",
        "phase 3.5",
        "implement feature",
        "develop",
        "refactor",
        "phase"
      ],
      targetSkillIds: ["repo-audit", "architecture-review", "implementation", "testing", "phase-gate"],
      reasoning: "Request targets engineering phases, architecture reviews, or feature development."
    },
    {
      id: "story-analysis-rule",
      category: "story",
      keywords: [
        "story",
        "script",
        "narrative",
        "beats",
        "extract",
        "dialogue",
        "source preservation",
        "hallucination",
        "coverage"
      ],
      targetSkillIds: ["story-analyze", "source-preservation", "story-coverage"],
      reasoning: "Request involves script parsing, narrative beat extraction, or source coverage verification."
    },
    {
      id: "canon-universe-rule",
      category: "universe",
      keywords: [
        "canon",
        "universe",
        "conflict",
        "series",
        "world state",
        "lore",
        "persistent"
      ],
      targetSkillIds: ["universe-resolve", "canon-conflict", "world-state-check"],
      reasoning: "Request relates to persistent universe resolution or canonical fact verification."
    },
    {
      id: "directing-scene-rule",
      category: "directing",
      keywords: [
        "scene direct",
        "shot plan",
        "director profile",
        "scene breakdown",
        "acting",
        "direct"
      ],
      targetSkillIds: ["scene-direct", "shot-plan", "director-qa"],
      reasoning: "Request focuses on director-level scene staging, pacing, and shot breakdown."
    },
    {
      id: "qa-continuity-rule",
      category: "qa",
      keywords: [
        "visual qa",
        "inspect render",
        "glitch",
        "artifact",
        "defect",
        "continuity",
        "qa"
      ],
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
        // Calculate score: sum of lengths of matched keywords to prioritize more specific phrases
        const score = matchedKeywords.reduce((acc, kw) => acc + kw.length, 0);
        matchedRules.push({
          rule,
          score,
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

    // Compute topological dependency chain
    const dependencyChain: string[] = [];
    const chainSet = new Set<string>();
    for (const skill of recommendedSkills) {
      try {
        const deps = this.registry.resolveDependencies(skill.id, true);
        for (const d of deps) {
          if (!chainSet.has(d)) {
            chainSet.add(d);
            dependencyChain.push(d);
          }
        }
      } catch {
        // In case of any unresolvable dependency in testing mocks, preserve stability
      }
    }

    return {
      primaryCategory,
      recommendedSkills,
      externalSkills,
      matchedKeywords: Array.from(new Set(allMatchedKeywords)),
      reasoning: reasoningParts.join(" "),
      dependencyChain
    };
  }
}
