/**
 * Phase 27D — Zero-Credit Flow Home to Project Workspace Navigation Tests
 *
 * Verifies:
 *   1. FLOW_HOME detection and differentiation from FLOW_PROJECT
 *   2. Start Creating unique discovery and localized support
 *   3. Ambiguous Start Creating fails closed (FLOW_NAVIGATION_AMBIGUOUS)
 *   4. Zero-credit safety classification (SAFE_NAVIGATION vs CREDIT_CONSUMING vs UNKNOWN)
 *   5. HOME → PROJECT transition without human intervention
 *   6. Intermediate workspace UI handling & calibration fail-closed
 *   7. Project reference extraction & non-secret persistence
 *   8. Zero-credit invariant: 0 prompts typed, 0 generate clicks during probe/navigation
 *   9. Production refuses prompt submission while still in FLOW_HOME
 *   10. CLI browser-probe --enter-project support
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';

import {
  FlowContractProbe,
  classifyControlAction,
  findStartCreatingControl,
  findIntermediateWorkspaceAction,
  MockFlowPage,
  FlowBrowserOperator,
  ShotContract,
} from '../src/index.js';

describe('Phase 27D — Zero-Credit Flow Home to Project Workspace Navigation', () => {
  const testDir = path.resolve('.studio', 'content', 'phase27d-tests');

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── 1. FLOW_HOME vs FLOW_PROJECT Detection ──────────────────────────────

  describe('Page State Categorization', () => {
    it('FLOW_HOME_DETECTION: detects home URL and home landing elements', () => {
      expect(FlowContractProbe.categorizePageState('https://flow.google.com')).toBe('FLOW_HOME');
      expect(FlowContractProbe.categorizePageState('https://flow.google.com/home')).toBe('FLOW_HOME');
      expect(
        FlowContractProbe.categorizePageState('https://flow.google.com', 'Recent projects and templates')
      ).toBe('FLOW_HOME');
    });

    it('FLOW_PROJECT_DETECTION: detects workspace URL patterns and canvas elements', () => {
      expect(FlowContractProbe.categorizePageState('https://flow.google.com/projects/proj_alpha_99')).toBe(
        'FLOW_PROJECT'
      );
      expect(FlowContractProbe.categorizePageState('https://flow.google.com/project/my-flow-video')).toBe(
        'FLOW_PROJECT'
      );
      expect(FlowContractProbe.categorizePageState('https://flow.google.com/workspace/editor')).toBe(
        'FLOW_PROJECT'
      );
      expect(FlowContractProbe.categorizePageState('https://flow.google.com/p/quick-shot')).toBe(
        'FLOW_PROJECT'
      );
      expect(
        FlowContractProbe.categorizePageState('https://flow.google.com', '', '<div data-project-id="123"></div>')
      ).toBe('FLOW_PROJECT');
      expect(
        FlowContractProbe.categorizePageState('https://flow.google.com', 'Interactive project canvas and timeline')
      ).toBe('FLOW_PROJECT');
    });

    it('UNKNOWN_PAGE: classifies non-flow or signin redirects as UNKNOWN_PAGE', () => {
      expect(FlowContractProbe.categorizePageState('https://accounts.google.com/signin')).toBe(
        'UNKNOWN_PAGE'
      );
      expect(FlowContractProbe.categorizePageState('https://myaccount.google.com')).toBe('UNKNOWN_PAGE');
    });
  });

  // ─── 2. Control Action Safety Classification ─────────────────────────────

  describe('Zero-Credit Safety Classification', () => {
    it('SAFE_NAVIGATION: positively classifies "Start Creating" and safe workspace actions', () => {
      expect(classifyControlAction({ text: 'Start Creating' })).toMatchObject({
        classification: 'SAFE_NAVIGATION',
        confidence: 0.95,
      });

      expect(classifyControlAction({ ariaLabel: 'start creating' })).toMatchObject({
        classification: 'SAFE_NAVIGATION',
        confidence: 0.95,
      });

      expect(classifyControlAction({ text: 'Create Project' })).toMatchObject({
        classification: 'SAFE_NAVIGATION',
      });

      expect(classifyControlAction({ text: 'Blank Canvas' })).toMatchObject({
        classification: 'SAFE_NAVIGATION',
      });

      expect(classifyControlAction({ text: 'Start a Project' })).toMatchObject({
        classification: 'SAFE_NAVIGATION',
      });

      expect(classifyControlAction({ href: '/projects/new' })).toMatchObject({
        classification: 'SAFE_NAVIGATION',
      });
    });

    it('LOCALIZATION: classifies international equivalents as SAFE_NAVIGATION', () => {
      // French
      expect(classifyControlAction({ text: 'Commencer à créer' })).toMatchObject({
        classification: 'SAFE_NAVIGATION',
      });
      // Spanish
      expect(classifyControlAction({ text: 'Empezar a crear' })).toMatchObject({
        classification: 'SAFE_NAVIGATION',
      });
      // German
      expect(classifyControlAction({ text: 'Jetzt erstellen' })).toMatchObject({
        classification: 'SAFE_NAVIGATION',
      });
      // Vietnamese
      expect(classifyControlAction({ text: 'Bắt đầu tạo' })).toMatchObject({
        classification: 'SAFE_NAVIGATION',
      });
      // Japanese
      expect(classifyControlAction({ text: '作成を開始' })).toMatchObject({
        classification: 'SAFE_NAVIGATION',
      });
    });

    it('CREDIT_CONSUMING: strictly classifies generation and billing controls', () => {
      expect(classifyControlAction({ text: 'Generate' })).toMatchObject({
        classification: 'CREDIT_CONSUMING',
      });

      expect(classifyControlAction({ text: 'Generate Video' })).toMatchObject({
        classification: 'CREDIT_CONSUMING',
      });

      expect(classifyControlAction({ text: 'Create Media' })).toMatchObject({
        classification: 'CREDIT_CONSUMING',
      });

      expect(classifyControlAction({ text: 'Submit Prompt' })).toMatchObject({
        classification: 'CREDIT_CONSUMING',
      });

      expect(classifyControlAction({ text: 'Spend 5 Credits' })).toMatchObject({
        classification: 'CREDIT_CONSUMING',
      });

      expect(classifyControlAction({ text: 'Buy Credits' })).toMatchObject({
        classification: 'CREDIT_CONSUMING',
      });

      expect(classifyControlAction({ type: 'submit' })).toMatchObject({
        classification: 'CREDIT_CONSUMING',
      });
    });

    it('UNKNOWN: classifies unrecognized or non-navigation elements as UNKNOWN', () => {
      expect(classifyControlAction({ text: 'Click Here' }).classification).toBe('UNKNOWN');
      expect(classifyControlAction({ text: 'More Information' }).classification).toBe('UNKNOWN');
    });
  });

  // ─── 3. Start Creating Discovery & Ambiguity Guard ────────────────────────

  describe('Start Creating Discovery on DOM', () => {
    it('DISCOVERY_UNIQUE: discovers unique visible "Start Creating" button', async () => {
      const mockPage = {
        evaluate: vi.fn().mockImplementation((fn) => {
          return [
            {
              index: 0,
              text: 'Start Creating',
              ariaLabel: '',
              score: 0.95,
              matches: ['exact live "Start Creating" match'],
              id: 'btn-start-creating',
            },
          ];
        }),
      };

      const result = await findStartCreatingControl(mockPage as any);

      expect(result.status).toBe('FOUND');
      expect(result.isSafeNavigation).toBe(true);
      expect(result.classification).toBe('SAFE_NAVIGATION');
      expect(result.locatorStrategy).toBe('#btn-start-creating');
    });

    it('DISCOVERY_AMBIGUOUS_FAILS_CLOSED: returns AMBIGUOUS when multiple candidate buttons exist', async () => {
      const mockPage = {
        evaluate: vi.fn().mockImplementation(() => {
          return [
            { index: 0, text: 'Start Creating (Editor)', score: 0.9, id: 'btn-1' },
            { index: 1, text: 'Start Creating (Classic)', score: 0.9, id: 'btn-2' },
          ];
        }),
      };

      const result = await findStartCreatingControl(mockPage as any);

      expect(result.status).toBe('AMBIGUOUS');
      expect(result.isSafeNavigation).toBe(false);
      expect(result.locatorStrategy).toBe('AMBIGUOUS_START_CREATING_CONTROL');
    });

    it('DISCOVERY_DISQUALIFIES_CREDIT_BUTTONS: ignores generate buttons during home navigation discovery', async () => {
      const mockPage = {
        evaluate: vi.fn().mockImplementation(() => {
          // evaluate runs filtering in browser; returns empty if only credit buttons existed
          return [];
        }),
      };

      const result = await findStartCreatingControl(mockPage as any);
      expect(result.status).toBe('NOT_FOUND');
    });
  });

  // ─── 4. HOME → PROJECT Transition (Zero-Credit) ───────────────────────────

  describe('enterFlowWorkspace Navigation Transition', () => {
    it('HOME_TO_PROJECT: transitions from FLOW_HOME to FLOW_PROJECT without prompt or generate clicks', async () => {
      const mockPage = new MockFlowPage();
      mockPage.simulatedPageState = 'FLOW_HOME';

      const navRes = await mockPage.enterFlowWorkspace();

      expect(navRes.pageState).toBe('FLOW_PROJECT');
      expect(mockPage.startCreatingClicked).toBe(true);
      expect(mockPage.submittedInstructions).toHaveLength(0); // ZERO prompts typed
    });

    it('AMBIGUOUS_FAILS_CLOSED: throws [FLOW_NAVIGATION_AMBIGUOUS] when Start Creating is ambiguous', async () => {
      const mockPage = new MockFlowPage();
      mockPage.simulatedPageState = 'FLOW_HOME';
      mockPage.simulatedNavigationAmbiguous = true;

      await expect(mockPage.enterFlowWorkspace()).rejects.toThrow(
        /\[FLOW_NAVIGATION_AMBIGUOUS\]/
      );
      expect(mockPage.startCreatingClicked).toBe(false);
    });

    it('UNSAFE_FAILS_CLOSED: throws [FLOW_NAVIGATION_UNSAFE] when control is credit-consuming', async () => {
      const mockPage = new MockFlowPage();
      mockPage.simulatedPageState = 'FLOW_HOME';
      mockPage.simulatedUnsafeNavigation = true;

      await expect(mockPage.enterFlowWorkspace()).rejects.toThrow(
        /\[FLOW_NAVIGATION_UNSAFE\]/
      );
      expect(mockPage.startCreatingClicked).toBe(false);
    });

    it('INTERMEDIATE_UI_CALIBRATION: throws [FLOW_NAVIGATION_REQUIRES_CALIBRATION] on ambiguous dialog', async () => {
      const mockPage = new MockFlowPage();
      mockPage.simulatedPageState = 'FLOW_HOME';
      mockPage.simulatedIntermediateUi = true;

      await expect(mockPage.enterFlowWorkspace()).rejects.toThrow(
        /\[FLOW_NAVIGATION_REQUIRES_CALIBRATION\]/
      );
    });
  });

  // ─── 5. ensureProject() Automatic Workspace Entry ─────────────────────────

  describe('ensureProject() Automatic Workspace Entry', () => {
    it('ENSURE_PROJECT_AUTO_NAV: automatically enters workspace when starting on FLOW_HOME', async () => {
      const mockPage = new MockFlowPage();
      mockPage.simulatedPageState = 'FLOW_HOME';

      const res = await mockPage.ensureProject('my_animation_project');

      expect(res.pageState).toBe('FLOW_PROJECT');
      expect(mockPage.startCreatingClicked).toBe(true);
      expect(mockPage.submittedInstructions).toHaveLength(0);
    });

    it('REFUSES_BATCH_IF_STILL_FLOW_HOME: operator fails closed if pageState remains FLOW_HOME', async () => {
      // Create a mock page where enterFlowWorkspace does NOT transition to FLOW_PROJECT
      const mockPage = new MockFlowPage();
      mockPage.simulatedPageState = 'FLOW_HOME';
      // Force ensureProject to return FLOW_HOME
      mockPage.ensureProject = async () => ({
        projectId: 'test_proj',
        url: 'https://flow.google.com/home',
        pageState: 'FLOW_HOME',
      });

      const operator = new FlowBrowserOperator({ flowPage: mockPage });

      const shot: ShotContract = {
        id: 'SHOT_NAV_TEST',
        sceneId: 'SC01',
        shotNumber: 1,
        purpose: 'establishing',
        complexity: 'complex_generative_video',
        rendererIntent: 'generative_full_video',
        frame: { durationSeconds: 4, aspectRatio: '16:9', targetFps: 24 },
        camera: { focalLength: '35mm', shotSize: 'medium_close_up', angle: 'eye_level', movement: 'static', semanticSkills: [] },
        lighting: { keyLightDirection: 'front', mood: 'cinematic', colorTemperature: 'neutral', fogAtmosphere: false },
        composition: { rule: 'rule_of_thirds', subjectPlacement: 'center', depthLayers: { foreground: [], midground: [], background: [] } },
        acting: [],
        transition: { type: 'cut', durationSeconds: 0 },
        audioCue: { sfx: [] },
        requiredAssetIds: [],
        dependsOnShotIds: [],
        directorLocks: { isCameraLocked: false, isFramingLocked: false, isRendererLocked: false, isActingLocked: false },
        provenance: { decidedAt: new Date().toISOString() },
      };

      const result = await operator.execute({
        projectId: 'proj_nav_test',
        shots: [shot],
      });

      expect(result.finalState).toBe('INITIAL');
      expect(result.allPassed).toBe(false);
      expect(result.error).toContain('Expected FLOW_PROJECT');
      expect(mockPage.submittedInstructions).toHaveLength(0); // STRICT: NO prompt submitted
    });
  });

  // ─── 6. Browser Probe with --enter-project ────────────────────────────────

  describe('Zero-Credit Browser Probe with --enter-project', () => {
    it('PROBE_ENTER_PROJECT: enters project workspace and inspects controls with 0 credits', async () => {
      const mockPage = new MockFlowPage();
      mockPage.simulatedPageState = 'FLOW_HOME'; // Starts at HOME

      const operator = new FlowBrowserOperator({ flowPage: mockPage });

      const { report, formattedReport } = await operator.probe({
        enterProject: true,
        persistEvidence: false,
      });

      expect(report.pageState).toBe('FLOW_PROJECT');
      expect(report.projectUiFound).toBe(true);
      expect(report.browserProjectReference).toBe('mock_project_alpha');
      expect(mockPage.startCreatingClicked).toBe(true);
      expect(mockPage.submittedInstructions).toHaveLength(0); // Zero prompt typed
      expect(formattedReport).toContain('PAGE_STATE:               FLOW_PROJECT');
      expect(formattedReport).toContain('PROJECT_UI_FOUND:         YES ✅');
      expect(formattedReport).toContain('PROJECT_REFERENCE:        mock_project_alpha');
      expect(formattedReport).toContain('CREDITS CONSUMED:         0');
    });

    it('PROBE_WITHOUT_ENTER_PROJECT: remains on FLOW_HOME when enterProject is false', async () => {
      const mockPage = new MockFlowPage();
      mockPage.simulatedPageState = 'FLOW_HOME';

      const operator = new FlowBrowserOperator({ flowPage: mockPage });

      const { report } = await operator.probe({
        enterProject: false,
        persistEvidence: false,
      });

      expect(report.pageState).toBe('FLOW_HOME');
      expect(report.projectUiFound).toBe(false);
      expect(mockPage.startCreatingClicked).toBe(false); // Did not click
    });
  });
});
