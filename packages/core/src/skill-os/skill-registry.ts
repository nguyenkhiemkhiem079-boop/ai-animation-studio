import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export const AgentSkillCategorySchema = z.enum([
  "development",
  "story",
  "universe",
  "directing",
  "cinematic",
  "character",
  "world",
  "production",
  "qa"
]);

export type AgentSkillCategory = z.infer<typeof AgentSkillCategorySchema>;

export const SkillStatusSchema = z.enum([
  "ACTIVE",
  "FOUNDATION_ONLY",
  "FUTURE",
  "EXTERNAL"
]);

export type SkillStatus = z.infer<typeof SkillStatusSchema>;

export const SkillMetadataSchema = z.object({
  id: z.string().min(1, "Skill ID cannot be empty"),
  name: z.string().min(1, "Skill name cannot be empty"),
  category: AgentSkillCategorySchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Version must follow semver format (e.g. 1.0.0)"),
  description: z.string().min(1, "Description cannot be empty"),
  entryPoint: z.string().min(1, "entryPoint cannot be empty"),
  dependencies: z.array(z.string()).default([]),
  applicablePhases: z.array(z.string()).default([]),
  status: SkillStatusSchema
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

export const ExternalSkillMetadataSchema = z.object({
  id: z.string().min(1, "External Skill ID cannot be empty"),
  name: z.string().min(1, "External Skill name cannot be empty"),
  source: z.string().min(1, "Source repository cannot be empty"),
  type: z.literal("EXTERNAL"),
  status: z.literal("EXTERNAL"),
  entryPoint: z.string().min(1, "entryPoint cannot be empty"),
  updateMethod: z.string().min(1, "updateMethod cannot be empty"),
  description: z.string().min(1, "Description cannot be empty")
});

export type ExternalSkillMetadata = z.infer<typeof ExternalSkillMetadataSchema>;

export const SkillRegistryManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  skills: z.array(SkillMetadataSchema),
  externalSkills: z.array(ExternalSkillMetadataSchema).default([])
});

export type SkillRegistryManifest = z.infer<typeof SkillRegistryManifestSchema>;

export interface SkillValidationError {
  code: "DUPLICATE_ID" | "MISSING_DEPENDENCY" | "CIRCULAR_DEPENDENCY" | "MISSING_ENTRYPOINT" | "INVALID_SCHEMA";
  message: string;
  skillId?: string;
  details?: unknown;
}

export interface SkillValidationResult {
  valid: boolean;
  errors: SkillValidationError[];
}

export class SkillRegistry {
  private skills: Map<string, SkillMetadata> = new Map();
  private externalSkills: Map<string, ExternalSkillMetadata> = new Map();

  constructor(private manifest: SkillRegistryManifest) {
    for (const skill of manifest.skills) {
      this.skills.set(skill.id, skill);
    }
    for (const ext of manifest.externalSkills) {
      this.externalSkills.set(ext.id, ext);
    }
  }

  public static async fromFile(filePath: string): Promise<SkillRegistry> {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsedJson = JSON.parse(raw);
    const parsedManifest = SkillRegistryManifestSchema.parse(parsedJson);
    return new SkillRegistry(parsedManifest);
  }

  public static fromJson(data: unknown): SkillRegistry {
    const parsedManifest = SkillRegistryManifestSchema.parse(data);
    return new SkillRegistry(parsedManifest);
  }

  public getManifest(): SkillRegistryManifest {
    return this.manifest;
  }

  public getSkill(id: string): SkillMetadata | ExternalSkillMetadata | undefined {
    return this.skills.get(id) ?? this.externalSkills.get(id);
  }

  public listSkills(category?: AgentSkillCategory): SkillMetadata[] {
    const all = Array.from(this.skills.values());
    if (!category) return all;
    return all.filter((s) => s.category === category);
  }

  public listExternalSkills(): ExternalSkillMetadata[] {
    return Array.from(this.externalSkills.values());
  }

  public getAllSkills(): (SkillMetadata | ExternalSkillMetadata)[] {
    return [...this.listSkills(), ...this.listExternalSkills()];
  }

  public resolveDependencies(skillId: string, includeSelf: boolean = false): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const resolve = (id: string) => {
      if (recStack.has(id)) {
        throw new Error(`Circular dependency detected while resolving dependencies for '${skillId}': ${id}`);
      }
      if (visited.has(id)) return;

      visited.add(id);
      recStack.add(id);

      const skill = this.skills.get(id);
      if (skill && skill.dependencies) {
        for (const dep of skill.dependencies) {
          resolve(dep);
        }
      }

      recStack.delete(id);
      result.push(id);
    };

    const rootSkill = this.skills.get(skillId) ?? this.externalSkills.get(skillId);
    if (!rootSkill) {
      throw new Error(`Skill '${skillId}' not found in registry.`);
    }

    if ("dependencies" in rootSkill && rootSkill.dependencies) {
      for (const dep of rootSkill.dependencies) {
        resolve(dep);
      }
    }

    if (includeSelf) {
      result.push(skillId);
    }

    return result;
  }

  public async validate(baseDir?: string): Promise<SkillValidationResult> {
    const errors: SkillValidationError[] = [];
    const seenIds = new Set<string>();

    // 1. Check duplicate IDs
    for (const skill of this.manifest.skills) {
      if (seenIds.has(skill.id)) {
        errors.push({
          code: "DUPLICATE_ID",
          message: `Duplicate skill ID found: '${skill.id}'`,
          skillId: skill.id
        });
      }
      seenIds.add(skill.id);
    }

    for (const ext of this.manifest.externalSkills) {
      if (seenIds.has(ext.id)) {
        errors.push({
          code: "DUPLICATE_ID",
          message: `Duplicate external skill ID found: '${ext.id}'`,
          skillId: ext.id
        });
      }
      seenIds.add(ext.id);
    }

    // 2. Check dependencies existence
    for (const skill of this.manifest.skills) {
      for (const depId of skill.dependencies) {
        if (!this.skills.has(depId) && !this.externalSkills.has(depId)) {
          errors.push({
            code: "MISSING_DEPENDENCY",
            message: `Skill '${skill.id}' depends on non-existent skill '${depId}'`,
            skillId: skill.id
          });
        }
      }
    }

    // 3. Check for circular dependencies
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const checkCycle = (skillId: string, pathStack: string[]) => {
      visited.add(skillId);
      recStack.add(skillId);

      const skill = this.skills.get(skillId);
      if (skill) {
        for (const depId of skill.dependencies) {
          if (!visited.has(depId)) {
            checkCycle(depId, [...pathStack, depId]);
          } else if (recStack.has(depId)) {
            errors.push({
              code: "CIRCULAR_DEPENDENCY",
              message: `Circular dependency detected: ${pathStack.join(" -> ")} -> ${depId}`,
              skillId
            });
          }
        }
      }

      recStack.delete(skillId);
    };

    for (const skill of this.manifest.skills) {
      if (!visited.has(skill.id)) {
        checkCycle(skill.id, [skill.id]);
      }
    }

    // 4. Check entrypoint files existence if baseDir is provided
    if (baseDir) {
      const all = [...this.manifest.skills, ...this.manifest.externalSkills];
      for (const item of all) {
        const fullPath = path.resolve(baseDir, item.entryPoint);
        try {
          await fs.access(fullPath);
        } catch {
          errors.push({
            code: "MISSING_ENTRYPOINT",
            message: `Entrypoint file not found: '${fullPath}'`,
            skillId: item.id
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
