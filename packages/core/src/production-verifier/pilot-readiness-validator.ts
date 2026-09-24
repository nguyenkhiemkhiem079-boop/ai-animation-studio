import * as fs from 'node:fs';
import * as path from 'node:path';
import { IStorageProvider } from '../storage/index.js';
import { MediaToolchainDoctor } from '../media/toolchain-doctor.js';
import { GeminiProvider } from '../llm/gemini-provider.js';
import { getCentralizedModelPolicy } from '../llm/model-policy.js';
import { LiveAuthorizationPolicy } from '../llm/live-authorization.js';

export interface PilotCheckItem {
  id: string;
  name: string;
  category: 'REQUIRED' | 'OPTIONAL' | 'LIVE-ONLY';
  status: 'PASS' | 'WARN' | 'FAIL' | 'INFO';
  summary: string;
  details?: string;
  remediation?: string;
}

export interface PilotReadinessResult {
  readyForOfflineRehearsal: boolean;
  readyForLivePilot: boolean;
  canDryRun: boolean;
  checks: PilotCheckItem[];
  blockers: string[];
  warnings: string[];
  diagnostics: {
    nodeVersion: string;
    ffmpegVersion?: string;
    ffprobeVersion?: string;
    geminiCredentialStatus: 'CONFIGURED' | 'NOT_CONFIGURED';
    maskedApiKey?: string;
    liveAuthorizationStatus: 'ENABLED' | 'DISABLED';
    modelPolicy: {
      fast: string;
      structured: string;
      qa: string;
      visionQa: string;
    };
    storyPath?: string;
    storySizeBytes?: number;
  };
}

export class ProductionPilotReadinessValidator {
  /**
   * Performs an offline, zero-network readiness audit of local workstation
   * capabilities before initiating a production run or pilot.
   *
   * NEVER makes outbound network requests.
   * NEVER exposes unmasked credentials.
   */
  public static async validate(options: {
    storyFilePath?: string;
    allowLiveOptIn?: boolean;
    storage?: IStorageProvider;
  } = {}): Promise<PilotReadinessResult> {
    const checks: PilotCheckItem[] = [];
    const blockers: string[] = [];
    const warnings: string[] = [];

    // 1. Node.js Version Check
    const nodeVer = process.version;
    const majorVer = parseInt(nodeVer.replace(/^v/, '').split('.')[0], 10);
    if (majorVer >= 20) {
      checks.push({
        id: 'node_runtime',
        name: 'Node.js Runtime',
        category: 'REQUIRED',
        status: 'PASS',
        summary: `${nodeVer} (>= 20.0.0 required)`,
      });
    } else {
      checks.push({
        id: 'node_runtime',
        name: 'Node.js Runtime',
        category: 'REQUIRED',
        status: 'FAIL',
        summary: `${nodeVer} is unsupported. Node >= 20.0.0 is required.`,
        remediation: 'Upgrade Node.js to version 20.x or 22.x LTS.',
      });
      blockers.push(`Node.js version ${nodeVer} is below required >= 20.0.0.`);
    }

    // 2. Media Toolchain (FFmpeg & FFprobe)
    const mediaDiag = MediaToolchainDoctor.diagnose();
    if (mediaDiag.ffmpeg.available) {
      checks.push({
        id: 'ffmpeg_binary',
        name: 'FFmpeg Executable',
        category: 'REQUIRED',
        status: 'PASS',
        summary: `${mediaDiag.ffmpeg.version || 'Available'} (${mediaDiag.ffmpeg.path})`,
      });
    } else {
      checks.push({
        id: 'ffmpeg_binary',
        name: 'FFmpeg Executable',
        category: 'REQUIRED',
        status: 'FAIL',
        summary: 'Not found in PATH or standard directories',
        remediation: 'Install FFmpeg and add it to system PATH.',
      });
      blockers.push('FFmpeg executable not available.');
    }

    if (mediaDiag.ffprobe.available) {
      checks.push({
        id: 'ffprobe_binary',
        name: 'FFprobe Executable',
        category: 'REQUIRED',
        status: 'PASS',
        summary: `${mediaDiag.ffprobe.version || 'Available'} (${mediaDiag.ffprobe.path})`,
      });
    } else {
      checks.push({
        id: 'ffprobe_binary',
        name: 'FFprobe Executable',
        category: 'REQUIRED',
        status: 'FAIL',
        summary: 'Not found in PATH or standard directories',
        remediation: 'Install FFprobe and add it to system PATH.',
      });
      blockers.push('FFprobe executable not available.');
    }

    // 3. Storage Directory Write Access
    let storageWritable = false;
    try {
      const probeDir = path.resolve('.studio');
      fs.mkdirSync(probeDir, { recursive: true });
      const probeFile = path.join(probeDir, `.pilot_readiness_probe_${Date.now()}`);
      fs.writeFileSync(probeFile, 'readiness_probe', 'utf-8');
      fs.unlinkSync(probeFile);
      storageWritable = true;
      checks.push({
        id: 'storage_write',
        name: 'Storage Write Access',
        category: 'REQUIRED',
        status: 'PASS',
        summary: '.studio/ directory is writable',
      });
    } catch (err: any) {
      checks.push({
        id: 'storage_write',
        name: 'Storage Write Access',
        category: 'REQUIRED',
        status: 'FAIL',
        summary: `Storage write probe failed: ${err.message}`,
        remediation: 'Check filesystem permissions for .studio directory.',
      });
      blockers.push(`Cannot write to storage directory: ${err.message}`);
    }

    // 4. Story File Audit (if specified)
    let storySizeBytes: number | undefined;
    if (options.storyFilePath) {
      const cleanPath = path.resolve(options.storyFilePath.replace(/^["']|["']$/g, '').trim());
      if (fs.existsSync(cleanPath)) {
        const stats = fs.statSync(cleanPath);
        storySizeBytes = stats.size;
        if (stats.size === 0) {
          checks.push({
            id: 'story_script',
            name: 'Story Script File',
            category: 'REQUIRED',
            status: 'FAIL',
            summary: `Story file "${path.basename(cleanPath)}" is empty (0 bytes)`,
            remediation: 'Provide a story script with scenes and characters.',
          });
          blockers.push(`Story file "${cleanPath}" is empty.`);
        } else {
          const content = fs.readFileSync(cleanPath, 'utf-8').replace(/^\uFEFF/, '');
          if (!content.trim()) {
            checks.push({
              id: 'story_script',
              name: 'Story Script File',
              category: 'REQUIRED',
              status: 'FAIL',
              summary: `Story file contains only whitespace characters`,
              remediation: 'Provide a non-empty story script with scenes and dialogue/actions.',
            });
            blockers.push(`Story file "${cleanPath}" contains only whitespace.`);
          } else {
            checks.push({
              id: 'story_script',
              name: 'Story Script File',
              category: 'REQUIRED',
              status: 'PASS',
              summary: `Valid script "${path.basename(cleanPath)}" (${stats.size} bytes, ${content.length} chars)`,
            });
          }
        }
      } else {
        checks.push({
          id: 'story_script',
          name: 'Story Script File',
          category: 'REQUIRED',
          status: 'FAIL',
          summary: `Story file not found at "${cleanPath}"`,
          remediation: 'Verify story file path.',
        });
        blockers.push(`Story file "${cleanPath}" not found.`);
      }
    } else {
      checks.push({
        id: 'story_script',
        name: 'Story Script File',
        category: 'REQUIRED',
        status: 'INFO',
        summary: 'No story file specified for audit',
      });
    }

    // 5. Gemini Credential Configuration (Single Gemini Key Architecture)
    const isLiveOptIn = options.allowLiveOptIn ?? (process.env.RUN_LIVE_PROVIDER_TESTS === 'true');
    const gemini = new GeminiProvider({ allowLiveCalls: isLiveOptIn });
    const hasKey = gemini.isConfigured();
    const maskedKey = gemini.getMaskedApiKey();

    if (hasKey) {
      checks.push({
        id: 'gemini_credential',
        name: 'Gemini Credential',
        category: 'LIVE-ONLY',
        status: 'PASS',
        summary: `CONFIGURED (${maskedKey})`,
        details: 'Single credential architecture (GEMINI_API_KEY) verified. Complete key is never displayed.',
      });
    } else {
      checks.push({
        id: 'gemini_credential',
        name: 'Gemini Credential',
        category: 'LIVE-ONLY',
        status: 'INFO',
        summary: 'NOT CONFIGURED (Required only for live Gemini visual QA or multimodal analysis)',
        remediation: 'Set GEMINI_API_KEY in environment before executing live pilot.',
      });
      warnings.push('GEMINI_API_KEY not configured. Offline rehearsal will run using local analyzers.');
    }

    // 6. Live Provider Network Authorization Policy
    const liveAuthorized = options.allowLiveOptIn === false
      ? false
      : LiveAuthorizationPolicy.isLiveAuthorized({ explicitLiveFlag: isLiveOptIn });
    if (liveAuthorized) {
      checks.push({
        id: 'live_authorization',
        name: 'Live Network Authorization',
        category: 'LIVE-ONLY',
        status: 'PASS',
        summary: 'ENABLED (Explicit opt-in via --live or RUN_LIVE_PROVIDER_TESTS=true)',
        details: 'Provider network requests are authorized to connect.',
      });
    } else {
      checks.push({
        id: 'live_authorization',
        name: 'Live Network Authorization',
        category: 'LIVE-ONLY',
        status: 'INFO',
        summary: 'DISABLED (Safe offline execution mode enforced)',
        details: 'Pass --live or set RUN_LIVE_PROVIDER_TESTS=true to authorize outbound provider calls.',
      });
    }

    // 7. Centralized Model Policy
    const policy = getCentralizedModelPolicy();
    checks.push({
      id: 'model_policy',
      name: 'Gemini Model Policy',
      category: 'OPTIONAL',
      status: 'PASS',
      summary: `FAST=${policy.fast}, STRUCTURED=${policy.structured}, QA=${policy.qa}, VISION_QA=${policy.visionQa}`,
    });

    const readyForOffline = blockers.length === 0;
    const readyForLive = readyForOffline && hasKey && liveAuthorized;

    return {
      readyForOfflineRehearsal: readyForOffline,
      readyForLivePilot: readyForLive,
      canDryRun: readyForOffline,
      checks,
      blockers,
      warnings,
      diagnostics: {
        nodeVersion: nodeVer,
        ffmpegVersion: mediaDiag.ffmpeg.version,
        ffprobeVersion: mediaDiag.ffprobe.version,
        geminiCredentialStatus: hasKey ? 'CONFIGURED' : 'NOT_CONFIGURED',
        maskedApiKey: maskedKey,
        liveAuthorizationStatus: liveAuthorized ? 'ENABLED' : 'DISABLED',
        modelPolicy: policy,
        storyPath: options.storyFilePath,
        storySizeBytes,
      },
    };
  }
}
