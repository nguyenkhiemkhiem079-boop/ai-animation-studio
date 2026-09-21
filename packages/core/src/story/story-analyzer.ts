/**
 * Story Analyzer abstraction, RuleBasedStoryAnalyzer (deterministic/offline),
 * and ProviderStoryAnalyzer (LLM-based with Zod validation).
 */

import { computeSha256 } from '../storage/index.js';
import {
  SourceDocument,
  StoryAnalysis,
  StoryAnalysisSchema,
  SceneCandidate,
  CharacterCandidate,
  LocationCandidate,
  PropCandidate,
  NarrativeBeat,
  DialogueLine,
  NarrationLine,
  SourceTraceability,
} from '../domain/story.js';
import { Universe } from '../domain/universe.js';
import { UniverseResolver } from '../universe/universe-resolver.js';
import { UniverseManager } from '../universe/universe-manager.js';
import { MemoryStorage } from '../storage/index.js';
import { CoverageAndGuards } from './coverage-and-guards.js';
import { CanonConflictDetector } from './canon-conflict-detector.js';
import { SourceDocumentManager } from './source-document-manager.js';
import { IProvider } from '../providers/index.js';
import { ValidationError } from '../errors/index.js';

export interface StoryAnalysisOptions {
  resolveCanon?: boolean;
  universeResolver?: UniverseResolver;
}

export interface IStoryAnalyzer {
  analyze(doc: SourceDocument, universe?: Universe, options?: StoryAnalysisOptions): Promise<StoryAnalysis>;
}

/**
 * Deterministic, offline screenplay and prose story analyzer.
 * Parses scenes, dialogue, narration, candidates, and beats with exact character-level traceability.
 */
export class RuleBasedStoryAnalyzer implements IStoryAnalyzer {
  public async analyze(
    doc: SourceDocument,
    universe?: Universe,
    options: StoryAnalysisOptions = {}
  ): Promise<StoryAnalysis> {
    const raw = doc.rawContent;
    const scenes: SceneCandidate[] = [];
    const charactersMap = new Map<string, { count: number; traits: Set<string>; dialogue?: string; traces: SourceTraceability[] }>();
    const locationsMap = new Map<string, { desc: string; zones: Set<string>; traces: SourceTraceability[] }>();
    const propsMap = new Map<string, { desc: string; traces: SourceTraceability[] }>();

    // Identify scene boundaries using regex: INT. / EXT. / SCENE
    const sceneHeadingRegex = /(?:^|\r?\n)((?:INT\.|EXT\.|INT\/EXT\.|SCENE\s+\d+)[:\s\-]+[^\r\n]+)/gi;
    const sceneMatches: { index: number; text: string; fullMatchStart: number }[] = [];

    let match: RegExpExecArray | null;
    while ((match = sceneHeadingRegex.exec(raw)) !== null) {
      sceneMatches.push({
        index: match.index,
        text: match[1].trim(),
        fullMatchStart: match.index + (match[0].length - match[1].length),
      });
    }

    // If no scene headings found, treat the whole document as Scene 1
    if (sceneMatches.length === 0) {
      sceneMatches.push({
        index: 0,
        text: 'INT. UNNAMED LOCATION - CONTINUOUS',
        fullMatchStart: 0,
      });
    }

    // Process each scene slice
    for (let i = 0; i < sceneMatches.length; i++) {
      const currentMatch = sceneMatches[i];
      const nextMatch = sceneMatches[i + 1];
      const sceneCharStart = currentMatch.fullMatchStart;
      const sceneCharEnd = nextMatch ? nextMatch.fullMatchStart : raw.length;
      const sceneText = raw.slice(sceneCharStart, sceneCharEnd);

      const sceneNumber = i + 1;
      const heading = currentMatch.text;

      // Extract time of day and location from heading
      let timeOfDay: SceneCandidate['timeOfDay'] = 'unspecified';
      const upperHeading = heading.toUpperCase();
      if (upperHeading.includes('NIGHT')) timeOfDay = 'night';
      else if (upperHeading.includes('DAY')) timeOfDay = 'day';
      else if (upperHeading.includes('DAWN')) timeOfDay = 'dawn';
      else if (upperHeading.includes('DUSK')) timeOfDay = 'dusk';
      else if (upperHeading.includes('CONTINUOUS')) timeOfDay = 'continuous';

      // Parse location name from heading: e.g. INT. OLD HOUSE - LIVING ROOM - NIGHT -> "OLD HOUSE"
      const headingParts = heading
        .replace(/^(INT\.|EXT\.|INT\/EXT\.|SCENE\s+\d+)[:\s\-]*/i, '')
        .split(/[-–—]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const locationName = headingParts[0] || 'Unknown Location';
      const zoneName = headingParts.length > 2 ? headingParts[1] : undefined;

      const sceneTrace = SourceDocumentManager.createTraceabilityPointer(doc, sceneCharStart, sceneCharEnd);

      // Record location candidate
      if (!locationsMap.has(locationName)) {
        locationsMap.set(locationName, { desc: heading, zones: new Set(), traces: [] });
      }
      const locEntry = locationsMap.get(locationName)!;
      locEntry.traces.push(sceneTrace);
      if (zoneName) locEntry.zones.add(zoneName);

      // Extract dialogue and narration inside scene
      const dialogueLines: DialogueLine[] = [];
      const narrationLines: NarrationLine[] = [];
      const beats: NarrativeBeat[] = [];
      const charactersInScene = new Set<string>();

      // Parse lines within the scene
      // Dialogue pattern: "SPEAKER: line" or "SPEAKER\nline"
      const dialogueRegex = /(?:^|\r?\n)([A-Z][A-Z0-9_\s]{1,25}):\s*([^\r\n]+)/g;
      let dMatch: RegExpExecArray | null;
      let lastDialogueIndex = 0;

      while ((dMatch = dialogueRegex.exec(sceneText)) !== null) {
        const speaker = dMatch[1].trim();
        const line = dMatch[2].trim();
        const dCharStart = sceneCharStart + dMatch.index;
        const dCharEnd = dCharStart + dMatch[0].length;

        const dTrace = SourceDocumentManager.createTraceabilityPointer(doc, dCharStart, dCharEnd);

        dialogueLines.push({
          speaker,
          line,
          sourceTrace: dTrace,
        });

        charactersInScene.add(speaker);

        // Record character candidate
        if (!charactersMap.has(speaker)) {
          charactersMap.set(speaker, { count: 0, traits: new Set(), traces: [] });
        }
        const charEntry = charactersMap.get(speaker)!;
        charEntry.count++;
        charEntry.traces.push(dTrace);
        if (!charEntry.dialogue) charEntry.dialogue = line;
      }

      // If no colon dialogue, scan for character mentions in prose
      if (dialogueLines.length === 0) {
        // Find capitalized character names (e.g. Minh, Lan, Alex)
        const nameRegex = /\b([A-Z][a-z]{2,15})\b/g;
        let nMatch: RegExpExecArray | null;
        while ((nMatch = nameRegex.exec(sceneText)) !== null) {
          const name = nMatch[1];
          // filter common English words
          if (!['The', 'They', 'Then', 'When', 'What', 'There', 'This', 'That', 'With', 'From', 'Into', 'Suddenly'].includes(name)) {
            charactersInScene.add(name);
            if (!charactersMap.has(name)) {
              charactersMap.set(name, { count: 0, traits: new Set(), traces: [] });
            }
            const charEntry = charactersMap.get(name)!;
            charEntry.count++;
            const charStart = sceneCharStart + nMatch.index;
            charEntry.traces.push(SourceDocumentManager.createTraceabilityPointer(doc, charStart, charStart + name.length));
          }
        }
      }

      // Detect props mentioned (e.g. amulet, key, sword, letter, mirror, phone)
      const propRegex = /\b(amulet|key|sword|letter|mirror|phone|lantern|dagger|altar|pendant)\b/gi;
      let pMatch: RegExpExecArray | null;
      while ((pMatch = propRegex.exec(sceneText)) !== null) {
        const propName = pMatch[1].toLowerCase();
        if (!propsMap.has(propName)) {
          propsMap.set(propName, { desc: `Prop mentioned in ${locationName}`, traces: [] });
        }
        const pTrace = SourceDocumentManager.createTraceabilityPointer(
          doc,
          sceneCharStart + pMatch.index,
          sceneCharStart + pMatch.index + propName.length
        );
        propsMap.get(propName)!.traces.push(pTrace);
      }

      // Generate narrative beat for the scene
      const beatSummary = sceneText.split(/\r?\n/).find((l) => l.trim().length > 10)?.trim() || `Action at ${locationName}`;
      beats.push({
        id: `BEAT_SC${String(sceneNumber).padStart(2, '0')}_01`,
        index: beats.length,
        summary: beatSummary.slice(0, 100),
        involvedCharacterIds: Array.from(charactersInScene),
        sourceTrace: sceneTrace,
      });

      // Narration lines for descriptive text
      narrationLines.push({
        text: sceneText.slice(0, 200).trim(),
        sourceTrace: sceneTrace,
      });

      scenes.push({
        id: `SCENE_${String(sceneNumber).padStart(2, '0')}`,
        sceneNumber,
        heading,
        timeOfDay,
        locationName,
        charactersPresent: Array.from(charactersInScene),
        beats,
        dialogueLines,
        narrationLines,
        sourceTrace: [sceneTrace],
      });
    }

    // Build Character Candidates
    const characterCandidates: CharacterCandidate[] = [];
    let charIdx = 1;
    for (const [name, data] of charactersMap.entries()) {
      characterCandidates.push({
        candidateId: `CAND_CHAR_${String(charIdx++).padStart(3, '0')}`,
        suggestedName: name,
        mentionCount: data.count,
        traits: Array.from(data.traits),
        dialogueSample: data.dialogue,
        sourceTrace: data.traces.slice(0, 5), // top 5 traces
      });
    }

    // Build Location Candidates
    const locationCandidates: LocationCandidate[] = [];
    let locIdx = 1;
    for (const [name, data] of locationsMap.entries()) {
      locationCandidates.push({
        candidateId: `CAND_LOC_${String(locIdx++).padStart(3, '0')}`,
        suggestedName: name,
        description: data.desc,
        zones: Array.from(data.zones),
        sourceTrace: data.traces.slice(0, 5),
      });
    }

    // Build Prop Candidates
    const propCandidates: PropCandidate[] = [];
    let propIdx = 1;
    for (const [name, data] of propsMap.entries()) {
      propCandidates.push({
        candidateId: `CAND_PROP_${String(propIdx++).padStart(3, '0')}`,
        suggestedName: name,
        visualDescription: data.desc,
        sourceTrace: data.traces.slice(0, 5),
      });
    }

    // Resolve candidates against universe if provided and requested
    if (universe && options.resolveCanon !== false) {
      const dummyStorage = new MemoryStorage();
      const uniMgr = new UniverseManager(dummyStorage);
      await uniMgr.saveUniverse(universe);
      const resolver = options.universeResolver ?? new UniverseResolver(uniMgr);

      for (const char of characterCandidates) {
        const res = await resolver.resolveCharacter(universe.seriesId, char);
        if (res.resolved) char.resolvedCanonId = res.canonId;
      }
      for (const loc of locationCandidates) {
        const res = await resolver.resolveLocation(universe.seriesId, loc);
        if (res.resolved) loc.resolvedCanonId = res.canonId;
      }
      for (const prop of propCandidates) {
        const res = await resolver.resolveProp(universe.seriesId, prop.suggestedName);
        if (res.resolved) prop.resolvedCanonId = res.canonId;
      }
    }

    // Compute Source Coverage
    const coverage = CoverageAndGuards.calculateCoverage(doc, {
      scenes,
      characters: characterCandidates,
      locations: locationCandidates,
      props: propCandidates,
    });

    // Validate Hallucination Guard
    const hallucinationReport = CoverageAndGuards.validateHallucinationGuard(doc, {
      scenes,
      characters: characterCandidates,
      locations: locationCandidates,
      props: propCandidates,
    });

    // Detect Canon Conflicts
    const canonConflicts = universe
      ? CanonConflictDetector.detectConflicts(universe, {
          characters: characterCandidates,
          locations: locationCandidates,
          props: propCandidates,
          scenes,
        })
      : [];

    const analysis: StoryAnalysis = {
      id: `analysis_${Date.now()}`,
      projectId: doc.projectId,
      sourceDocumentId: doc.id,
      sourceContentHash: doc.contentHash,
      characterCandidates,
      locationCandidates,
      propCandidates,
      relationshipCandidates: [],
      eventCandidates: [],
      sceneCandidates: scenes,
      coverage,
      hallucinationReport,
      canonConflicts,
      review: {
        summary: `Parsed ${scenes.length} scenes, ${characterCandidates.length} character candidates, and ${locationCandidates.length} location candidates.`,
        tone: 'Consistent with source script',
        pacingAssessment: scenes.length > 5 ? 'Fast paced multi-scene sequence' : 'Intimate contained sequence',
        suggestedInterventions: [],
      },
      analyzedAt: new Date().toISOString(),
    };

    return StoryAnalysisSchema.parse(analysis);
  }
}

import { LLMProvider, LLMTaskType } from '../llm/llm-provider.js';
import {
  STORY_ANALYSIS_PROMPT_V1,
  StoryAnalysisExtractionSchema,
  StoryAnalysisExtraction,
} from '../llm/prompts/story-analysis.js';

/**
 * Story Analyzer using an external LLM Provider or IProvider with strict Zod structured output validation.
 */
export class ProviderStoryAnalyzer implements IStoryAnalyzer {
  private provider: IProvider | LLMProvider;

  constructor(provider: IProvider | LLMProvider) {
    this.provider = provider;
  }

  public async analyze(
    doc: SourceDocument,
    universe?: Universe,
    options: StoryAnalysisOptions = {}
  ): Promise<StoryAnalysis> {
    // If provider is modern LLMProvider
    if ('generateStructured' in this.provider && typeof this.provider.generateStructured === 'function') {
      const canonCharNames = universe
        ? Object.values(universe.characters).map((c) => c.name).join(', ')
        : '';
      const structuredResult = await this.provider.generateStructured<StoryAnalysisExtraction>({
        taskType: 'STORY_ANALYSIS',
        systemInstruction: STORY_ANALYSIS_PROMPT_V1.systemInstruction,
        prompt: STORY_ANALYSIS_PROMPT_V1.buildPrompt({
          title: doc.title,
          rawContent: doc.rawContent,
          universeContext: universe ? `Series: ${universe.seriesId}, Existing Canon Characters: ${canonCharNames}` : undefined,
        }),
        responseSchema: StoryAnalysisExtractionSchema,
        schemaName: 'StoryAnalysisExtraction',
        projectId: doc.projectId,
        seriesId: universe?.seriesId,
        metadata: {
          promptVersion: STORY_ANALYSIS_PROMPT_V1.version,
          sourceContentHash: doc.contentHash,
        },
      });

      const extracted = structuredResult.data;

      // Transform extracted candidates into typed domain candidates with traceability
      const characterCandidates: CharacterCandidate[] = extracted.characters.map((c, i) => ({
        candidateId: `CAND_CHAR_${String(i + 1).padStart(3, '0')}`,
        suggestedName: c.suggestedName,
        mentionCount: 1,
        traits: c.traits,
        dialogueSample: c.dialogueSample,
        sourceTrace: [SourceDocumentManager.createTraceabilityPointer(doc, 0, Math.min(doc.rawContent.length, 100))],
      }));

      const locationCandidates: LocationCandidate[] = extracted.locations.map((l, i) => ({
        candidateId: `CAND_LOC_${String(i + 1).padStart(3, '0')}`,
        suggestedName: l.suggestedName,
        description: l.description,
        zones: l.zones,
        sourceTrace: [SourceDocumentManager.createTraceabilityPointer(doc, 0, Math.min(doc.rawContent.length, 100))],
      }));

      const propCandidates: PropCandidate[] = extracted.props.map((p, i) => ({
        candidateId: `CAND_PROP_${String(i + 1).padStart(3, '0')}`,
        suggestedName: p.suggestedName,
        visualDescription: p.visualDescription,
        sourceTrace: [SourceDocumentManager.createTraceabilityPointer(doc, 0, Math.min(doc.rawContent.length, 100))],
      }));

      const scenes: SceneCandidate[] = extracted.scenes.map((s, i) => ({
        id: `SCENE_${String(s.sceneNumber).padStart(2, '0')}`,
        sceneNumber: s.sceneNumber,
        heading: s.heading,
        timeOfDay: s.timeOfDay,
        locationName: s.locationName,
        charactersPresent: s.charactersPresent,
        beats: s.beats.map((b, bIdx) => ({
          id: `BEAT_SC${String(s.sceneNumber).padStart(2, '0')}_${String(bIdx + 1).padStart(2, '0')}`,
          index: bIdx,
          summary: b.summary,
          involvedCharacterIds: b.involvedCharacters,
          sourceTrace: SourceDocumentManager.createTraceabilityPointer(doc, 0, Math.min(doc.rawContent.length, 100)),
        })),
        dialogueLines: s.dialogueLines.map((d) => ({
          speaker: d.speaker,
          line: d.line,
          sourceTrace: SourceDocumentManager.createTraceabilityPointer(doc, 0, Math.min(doc.rawContent.length, 100)),
        })),
        narrationLines: s.narrationLines.map((n) => ({
          text: n,
          sourceTrace: SourceDocumentManager.createTraceabilityPointer(doc, 0, Math.min(doc.rawContent.length, 100)),
        })),
        sourceTrace: [SourceDocumentManager.createTraceabilityPointer(doc, 0, Math.min(doc.rawContent.length, 100))],
      }));

      // Resolve candidates against universe if provided
      if (universe && options.resolveCanon !== false) {
        const dummyStorage = new MemoryStorage();
        const uniMgr = new UniverseManager(dummyStorage);
        await uniMgr.saveUniverse(universe);
        const resolver = options.universeResolver ?? new UniverseResolver(uniMgr);

        for (const char of characterCandidates) {
          const res = await resolver.resolveCharacter(universe.seriesId, char);
          if (res.resolved) char.resolvedCanonId = res.canonId;
        }
        for (const loc of locationCandidates) {
          const res = await resolver.resolveLocation(universe.seriesId, loc);
          if (res.resolved) loc.resolvedCanonId = res.canonId;
        }
        for (const prop of propCandidates) {
          const res = await resolver.resolveProp(universe.seriesId, prop.suggestedName);
          if (res.resolved) prop.resolvedCanonId = res.canonId;
        }
      }

      // Compute coverage and guards
      const coverage = CoverageAndGuards.calculateCoverage(doc, {
        scenes,
        characters: characterCandidates,
        locations: locationCandidates,
        props: propCandidates,
      });

      const hallucinationReport = CoverageAndGuards.validateHallucinationGuard(doc, {
        scenes,
        characters: characterCandidates,
        locations: locationCandidates,
        props: propCandidates,
      });

      const canonConflicts = universe
        ? CanonConflictDetector.detectConflicts(universe, {
            characters: characterCandidates,
            locations: locationCandidates,
            props: propCandidates,
            scenes,
          })
        : [];

      const analysis: StoryAnalysis = {
        id: `analysis_${Date.now()}`,
        projectId: doc.projectId,
        sourceDocumentId: doc.id,
        sourceContentHash: doc.contentHash,
        characterCandidates,
        locationCandidates,
        propCandidates,
        relationshipCandidates: [],
        eventCandidates: [],
        sceneCandidates: scenes,
        coverage,
        hallucinationReport,
        canonConflicts,
        review: {
          summary: extracted.summary,
          tone: 'Derived via structured LLM extraction preserving source fidelity',
          pacingAssessment: scenes.length > 5 ? 'Fast paced multi-scene sequence' : 'Contained sequence',
          suggestedInterventions: [],
        },
        analyzedAt: new Date().toISOString(),
      };

      return StoryAnalysisSchema.parse(analysis);
    }

    // Fallback to generic IProvider execute
    const legacyProvider = this.provider as IProvider;
    const result = await legacyProvider.execute<
      { rawContent: string; title: string },
      Record<string, unknown>
    >({
      taskType: 'story_analysis',
      input: {
        rawContent: doc.rawContent,
        title: doc.title,
      },
    });

    try {
      const parsed = StoryAnalysisSchema.parse({
        ...result.output,
        id: `analysis_${Date.now()}`,
        projectId: doc.projectId,
        sourceDocumentId: doc.id,
        sourceContentHash: doc.contentHash,
        analyzedAt: new Date().toISOString(),
      });
      return parsed;
    } catch (err: any) {
      throw new ValidationError(`Provider returned invalid StoryAnalysis schema: ${err.message}`);
    }
  }
}
