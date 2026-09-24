/**
 * Flow Semantic Discovery
 *
 * Provides reusable, Puppeteer-compatible semantic control discovery helpers
 * for Google Flow UI automation.
 *
 * Rules:
 *   - Strictly Puppeteer-compatible (NO Playwright-style text selectors).
 *   - Uses ARIA labels, roles, accessible names, standard DOM evaluation.
 *   - Returns FOUND, NOT_FOUND, or AMBIGUOUS.
 *   - Never blindly clicks or chooses when multiple candidates exist (AMBIGUOUS fails closed).
 *   - Zero credential or private token leakage.
 */

import type { Page } from 'puppeteer-core';

export type SemanticControlStatus = 'FOUND' | 'NOT_FOUND' | 'AMBIGUOUS';

export interface SemanticDiscoveryResult<T = any> {
  status: SemanticControlStatus;
  confidence: number; // 0.0 to 1.0
  candidateCount: number;
  locatorStrategy: string;
  evidence?: string;
  target?: T;
  details?: string;
}

export interface FlowDiscoveredAssetContainer {
  id: string;
  name: string;
  status: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED' | 'UNKNOWN';
  hasVideo: boolean;
  hasDownloadAction: boolean;
  rawText?: string;
}

export type ControlActionClassification = 'SAFE_NAVIGATION' | 'CREDIT_CONSUMING' | 'UNKNOWN';

export interface ActionSafetyClassificationResult {
  classification: ControlActionClassification;
  confidence: number;
  reason: string;
}

// ─── Pure Utility & Parsing Functions (Deterministic, Local, Testable) ──────────

/**
 * Explicitly classifies a UI control/action as:
 *   - SAFE_NAVIGATION: Navigation / workspace entry that cannot generate media or spend credits.
 *   - CREDIT_CONSUMING: Generation, prompt submission, or paid actions.
 *   - UNKNOWN: Ambiguous or unverified action.
 */
export function classifyControlAction(control: {
  text?: string | null;
  ariaLabel?: string | null;
  title?: string | null;
  href?: string | null;
  tagName?: string | null;
  type?: string | null;
}): ActionSafetyClassificationResult {
  const text = (control.text || '').trim();
  const ariaLabel = (control.ariaLabel || '').trim();
  const title = (control.title || '').trim();
  const href = (control.href || '').trim();
  const type = (control.type || '').trim().toLowerCase();

  const combined = [text, ariaLabel, title].filter(Boolean).join(' ').toLowerCase().trim();

  // 1. Credit-consuming patterns: MUST NEVER BE CLICKED FOR NAVIGATION
  const creditKeywords = [
    'generate',
    'create video',
    'create media',
    'render',
    'produce',
    'submit prompt',
    'run prompt',
    'spend',
    'credit',
    'credits',
    'token',
    'purchase',
    'buy credit',
    'buy credits',
    'buy',
    'pricing',
    'upgrade',
    'billing',
  ];

  for (const kw of creditKeywords) {
    if (combined.includes(kw)) {
      return {
        classification: 'CREDIT_CONSUMING',
        confidence: 0.95,
        reason: `Matched credit-consuming keyword: "${kw}"`,
      };
    }
  }

  // If type="submit" and no safe navigation keyword
  if (type === 'submit' && !combined.includes('start creating') && !combined.includes('create project')) {
    return {
      classification: 'CREDIT_CONSUMING',
      confidence: 0.7,
      reason: 'type="submit" control without explicit safe navigation text',
    };
  }

  // 2. Safe navigation patterns:
  // "Start Creating" (live Google Flow button)
  // Localized / semantic equivalents:
  // "Create Project", "New Project", "Start a Project", "Blank Canvas", "Blank Project",
  // "Get Started", "Start Creation", "Open Workspace"
  // French: "Commencer à créer", "Nouveau projet"
  // Spanish: "Empezar a crear", "Nuevo proyecto"
  // German: "Jetzt erstellen", "Neues Projekt"
  // Vietnamese: "Bắt đầu tạo", "Tạo dự án mới"
  // Japanese: "作成を開始", "新しいプロジェクト"
  const safeNavigationKeywords = [
    'start creating',
    'start creation',
    'create project',
    'new project',
    'new workspace',
    'blank project',
    'blank canvas',
    'empty project',
    'get started',
    'start a project',
    'open workspace',
    'commencer à créer',
    'nouveau projet',
    'empezar a crear',
    'nuevo proyecto',
    'jetzt erstellen',
    'neues projekt',
    'bắt đầu tạo',
    'tạo dự án',
    '作成を開始',
    '新規プロジェクト',
  ];

  for (const kw of safeNavigationKeywords) {
    if (combined === kw || combined.startsWith(kw) || combined.includes(kw)) {
      return {
        classification: 'SAFE_NAVIGATION',
        confidence: combined === kw ? 0.95 : 0.85,
        reason: `Matched safe navigation keyword: "${kw}"`,
      };
    }
  }

  // Href link pointing to project creation or workspace
  if (href && (href.includes('/project') || href.includes('/workspace') || href.includes('/editor'))) {
    return {
      classification: 'SAFE_NAVIGATION',
      confidence: 0.8,
      reason: `Safe navigation link pointing to: "${href}"`,
    };
  }

  return {
    classification: 'UNKNOWN',
    confidence: 0.3,
    reason: `Unrecognized action with text: "${text || ariaLabel || 'none'}"`,
  };
}

/**
 * Parses credit indicator text with confidence scoring.
 * Examples:
 *   - "100 credits" -> 100 (high confidence)
 *   - "Credits: 45 / 50" -> 45 (high confidence)
 *   - "Remaining: 12 credits" -> 12 (high confidence)
 *   - "50" in credit container -> 50 (medium confidence)
 *   - "Unlimited" -> null, not certain
 *   - Conflicting / multiple numbers -> isCertain: false
 */
export function parseCreditText(rawText?: string | null): {
  rawText?: string;
  parsedCredits: number | null;
  confidence: number;
  isCertain: boolean;
  tier?: string;
  details?: string;
} {
  if (!rawText || !rawText.trim()) {
    return {
      rawText: undefined,
      parsedCredits: null,
      confidence: 0,
      isCertain: false,
      details: 'No credit text observed',
    };
  }

  const clean = rawText.trim();
  const lower = clean.toLowerCase();

  // Explicit label + number: e.g. "credits: 45", "45 credits", "45/50 credits"
  const creditKeywordMatch = lower.match(/(?:credit|credits|balance|token|points)\s*[:=]?\s*(\d+)/i) ||
                             lower.match(/(\d+)\s*(?:credit|credits|remaining)/i);

  if (creditKeywordMatch) {
    const credits = parseInt(creditKeywordMatch[1], 10);
    return {
      rawText: clean,
      parsedCredits: credits,
      confidence: 0.95,
      isCertain: true,
      details: `Matched explicit credit keyword pattern: "${creditKeywordMatch[0]}"`,
    };
  }

  // Fraction format e.g. "45 / 100"
  const fractionMatch = lower.match(/(\d+)\s*\/\s*(\d+)/);
  if (fractionMatch) {
    const credits = parseInt(fractionMatch[1], 10);
    return {
      rawText: clean,
      parsedCredits: credits,
      confidence: 0.85,
      isCertain: true,
      details: `Matched fraction pattern: "${fractionMatch[0]}"`,
    };
  }

  // Single standalone number
  const allNumbers = clean.match(/\b\d+\b/g);
  if (allNumbers && allNumbers.length === 1) {
    const credits = parseInt(allNumbers[0], 10);
    return {
      rawText: clean,
      parsedCredits: credits,
      confidence: 0.6,
      isCertain: false, // Not certain without explicit keyword
      details: `Single number found without explicit credit keyword: "${clean}"`,
    };
  }

  if (allNumbers && allNumbers.length > 1) {
    return {
      rawText: clean,
      parsedCredits: null,
      confidence: 0.2,
      isCertain: false,
      details: `Ambiguous multiple numbers observed in text: "${clean}"`,
    };
  }

  return {
    rawText: clean,
    parsedCredits: null,
    confidence: 0.1,
    isCertain: false,
    details: `No numerical credit value identified in text: "${clean}"`,
  };
}

/**
 * Score candidate editable element as prompt input surface.
 */
export function scorePromptSurface(candidate: {
  tagName: string;
  placeholder?: string | null;
  ariaLabel?: string | null;
  className?: string | null;
  isContentEditable?: boolean;
}): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const tag = candidate.tagName.toLowerCase();

  if (tag === 'textarea') {
    score += 0.3;
    reasons.push('textarea element (+0.3)');
  } else if (candidate.isContentEditable) {
    score += 0.25;
    reasons.push('contenteditable element (+0.25)');
  } else if (tag === 'input') {
    score += 0.1;
    reasons.push('input element (+0.1)');
  }

  const promptKeywords = ['prompt', 'describe', 'instruct', 'generate', 'ask', 'message', 'imagine', 'create', 'story'];
  const pText = (candidate.placeholder || '').toLowerCase();
  const aText = (candidate.ariaLabel || '').toLowerCase();
  const cText = (candidate.className || '').toLowerCase();

  for (const kw of promptKeywords) {
    if (pText.includes(kw)) {
      score += 0.4;
      reasons.push(`placeholder contains "${kw}" (+0.4)`);
      break;
    }
  }

  for (const kw of promptKeywords) {
    if (aText.includes(kw)) {
      score += 0.35;
      reasons.push(`aria-label contains "${kw}" (+0.35)`);
      break;
    }
  }

  if (cText.includes('prompt') || cText.includes('chat-input') || cText.includes('composer')) {
    score += 0.2;
    reasons.push(`class indicates prompt/composer (+0.2)`);
  }

  return { score: Math.min(1.0, score), reasons };
}

// ─── Browser DOM Evaluation Functions (Puppeteer-Compatible) ──────────────────

/**
 * Discover editable prompt surface using semantic attributes and confidence scoring.
 */
export async function findEditablePromptSurface(page: Page): Promise<SemanticDiscoveryResult> {
  try {
    const rawCandidates: any[] = await page.evaluate(() => {
      const elements: any[] = [];
      const queryList = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], input[type="text"]'));

      queryList.forEach((el, index) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        if (!isVisible) return;

        elements.push({
          index,
          tagName: el.tagName.toLowerCase(),
          placeholder: el.getAttribute('placeholder') || '',
          ariaLabel: el.getAttribute('aria-label') || el.getAttribute('title') || '',
          className: el.className || '',
          isContentEditable: el.getAttribute('contenteditable') === 'true',
          id: el.id || '',
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      });
      return elements;
    });

    if (!rawCandidates || rawCandidates.length === 0) {
      return {
        status: 'NOT_FOUND',
        confidence: 0,
        candidateCount: 0,
        locatorStrategy: 'findEditablePromptSurface',
        details: 'No visible editable input or textarea elements found on page',
      };
    }

    const scored = rawCandidates.map((c) => {
      const { score, reasons } = scorePromptSurface(c);
      return { ...c, score, reasons };
    });

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    const runnerUp = scored[1];

    // High confidence single match (score >= 0.6 and significantly better than runner-up)
    if (best.score >= 0.6 && (!runnerUp || best.score - runnerUp.score >= 0.25)) {
      const selector = best.id
        ? `#${best.id}`
        : best.placeholder
        ? `${best.tagName}[placeholder="${best.placeholder.replace(/"/g, '\\"')}"]`
        : best.ariaLabel
        ? `${best.tagName}[aria-label="${best.ariaLabel.replace(/"/g, '\\"')}"]`
        : `${best.tagName}:nth-of-type(${best.index + 1})`;

      return {
        status: 'FOUND',
        confidence: best.score,
        candidateCount: 1,
        locatorStrategy: selector,
        evidence: `Tag: <${best.tagName}> Placeholder: "${best.placeholder}" Aria-Label: "${best.ariaLabel}" [${best.reasons.join(', ')}]`,
        target: best,
      };
    }

    // If multiple candidates have indistinguishable or high scores without a clear winner
    if (runnerUp && Math.abs(best.score - runnerUp.score) < 0.25 && best.score >= 0.4) {
      return {
        status: 'AMBIGUOUS',
        confidence: 0.4,
        candidateCount: scored.length,
        locatorStrategy: 'AMBIGUOUS_MULTIPLE_CANDIDATES',
        details: `Multiple candidate prompt surfaces found without decisive semantic winner (${scored.length} candidates)`,
        evidence: scored.slice(0, 3).map((s) => `<${s.tagName}> "${s.placeholder || s.ariaLabel}" score=${s.score}`).join(' | '),
      };
    }

    if (best.score >= 0.3) {
      return {
        status: 'FOUND',
        confidence: best.score,
        candidateCount: scored.length,
        locatorStrategy: best.tagName,
        evidence: `Fallback candidate: <${best.tagName}> Placeholder: "${best.placeholder}" Aria-Label: "${best.ariaLabel}"`,
        target: best,
      };
    }

    return {
      status: 'NOT_FOUND',
      confidence: 0.1,
      candidateCount: scored.length,
      locatorStrategy: 'findEditablePromptSurface',
      details: 'Editable elements found but none matched prompt characteristics confidently',
    };
  } catch (err: any) {
    return {
      status: 'NOT_FOUND',
      confidence: 0,
      candidateCount: 0,
      locatorStrategy: 'findEditablePromptSurface',
      details: `Evaluation failed: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Discover Generate / Submit button using semantic inspection without Playwright text pseudo-selectors.
 * STRICT: DO NOT CLICK. Pure inspection.
 */
export async function findGenerateControl(page: Page): Promise<SemanticDiscoveryResult> {
  try {
    const candidates: any[] = await page.evaluate(() => {
      const results: any[] = [];
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'));

      buttons.forEach((btn, index) => {
        const rect = btn.getBoundingClientRect();
        const style = window.getComputedStyle(btn);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        if (!isVisible) return;

        const text = (btn.textContent || '').trim().replace(/\s+/g, ' ');
        const ariaLabel = btn.getAttribute('aria-label') || '';
        const title = btn.getAttribute('title') || '';
        const type = btn.getAttribute('type') || '';

        const lowerText = text.toLowerCase();
        const lowerAria = ariaLabel.toLowerCase();
        const lowerTitle = title.toLowerCase();

        let score = 0;
        const matches: string[] = [];

        // Keywords
        if (lowerText === 'generate' || lowerAria === 'generate') {
          score += 0.8;
          matches.push('exact generate text/aria');
        } else if (lowerText.includes('generate') || lowerAria.includes('generate')) {
          score += 0.6;
          matches.push('contains generate');
        } else if (lowerText === 'run' || lowerAria === 'run' || lowerText === 'create' || lowerAria === 'create') {
          score += 0.5;
          matches.push('run/create text');
        } else if (type === 'submit') {
          score += 0.4;
          matches.push('type=submit');
        }

        // SVG arrow or send icon indicators
        const hasSvg = btn.querySelector('svg') !== null;
        if (hasSvg && (lowerAria.includes('send') || lowerAria.includes('submit') || lowerTitle.includes('submit'))) {
          score += 0.5;
          matches.push('svg icon with send/submit aria');
        }

        if (score > 0) {
          results.push({
            index,
            text,
            ariaLabel,
            title,
            score,
            matches,
            id: btn.id || '',
            className: btn.className || '',
          });
        }
      });
      return results;
    });

    if (!candidates || candidates.length === 0) {
      return {
        status: 'NOT_FOUND',
        confidence: 0,
        candidateCount: 0,
        locatorStrategy: 'findGenerateControl',
        details: 'No generate or submit button found in current viewport',
      };
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const runnerUp = candidates[1];

    if (best.score >= 0.6 && (!runnerUp || best.score - runnerUp.score >= 0.3)) {
      const selector = best.id
        ? `#${best.id}`
        : best.ariaLabel
        ? `button[aria-label="${best.ariaLabel.replace(/"/g, '\\"')}"]`
        : `button:nth-of-type(${best.index + 1})`;

      return {
        status: 'FOUND',
        confidence: best.score,
        candidateCount: 1,
        locatorStrategy: selector,
        evidence: `Button text: "${best.text}" aria-label: "${best.ariaLabel}" [${best.matches.join(', ')}]`,
        target: best,
      };
    }

    if (runnerUp && Math.abs(best.score - runnerUp.score) < 0.3) {
      return {
        status: 'AMBIGUOUS',
        confidence: 0.4,
        candidateCount: candidates.length,
        locatorStrategy: 'AMBIGUOUS_GENERATE_CONTROL',
        details: `Multiple candidate generate/submit buttons discovered (${candidates.length} candidates)`,
        evidence: candidates.slice(0, 3).map((c) => `"${c.text || c.ariaLabel}" score=${c.score}`).join(' | '),
      };
    }

    return {
      status: 'FOUND',
      confidence: best.score,
      candidateCount: candidates.length,
      locatorStrategy: `button:nth-of-type(${best.index + 1})`,
      evidence: `Button text: "${best.text}" aria-label: "${best.ariaLabel}"`,
      target: best,
    };
  } catch (err: any) {
    return {
      status: 'NOT_FOUND',
      confidence: 0,
      candidateCount: 0,
      locatorStrategy: 'findGenerateControl',
      details: `Generate control inspection failed: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Discover credit indicator element and parse value with confidence.
 */
export async function findCreditIndicator(page: Page): Promise<
  SemanticDiscoveryResult & {
    parsedCredits?: number | null;
    rawText?: string;
    isCertain?: boolean;
    tier?: string;
  }
> {
  try {
    const rawCreditInfo: any = await page.evaluate(() => {
      // Look for credit container
      const candidates = Array.from(
        document.querySelectorAll(
          '[aria-label*="Credit" i], [aria-label*="credit" i], [data-testid*="credit" i], [data-testid="credits"], [class*="credit"], [class*="balance"], [class*="token"]'
        )
      );

      for (const el of candidates) {
        const text = (el.textContent || '').trim();
        const ariaLabel = el.getAttribute('aria-label') || '';
        const combined = text || ariaLabel;
        if (combined && (combined.toLowerCase().includes('credit') || combined.toLowerCase().includes('balance'))) {
          return {
            rawText: combined,
            tagName: el.tagName.toLowerCase(),
            ariaLabel,
            className: el.className || '',
          };
        }
      }

      // Scan all elements for explicit "X credits" pattern
      const allSpans = Array.from(document.querySelectorAll('span, div, p'));
      for (const el of allSpans) {
        const text = (el.textContent || '').trim();
        if (/^\d+\s*credits?$/i.test(text) || /^credits?:\s*\d+$/i.test(text)) {
          return {
            rawText: text,
            tagName: el.tagName.toLowerCase(),
            className: el.className || '',
          };
        }
      }

      return null;
    });

    if (!rawCreditInfo || !rawCreditInfo.rawText) {
      return {
        status: 'NOT_FOUND',
        confidence: 0,
        candidateCount: 0,
        locatorStrategy: 'findCreditIndicator',
        details: 'No credit element or credit text found in page DOM',
        parsedCredits: null,
        isCertain: false,
      };
    }

    const parsed = parseCreditText(rawCreditInfo.rawText);

    return {
      status: parsed.isCertain ? 'FOUND' : parsed.parsedCredits !== null ? 'FOUND' : 'AMBIGUOUS',
      confidence: parsed.confidence,
      candidateCount: 1,
      locatorStrategy: rawCreditInfo.ariaLabel ? `[aria-label="${rawCreditInfo.ariaLabel}"]` : rawCreditInfo.tagName,
      evidence: `Observed text: "${parsed.rawText}" (${parsed.details})`,
      rawText: parsed.rawText,
      parsedCredits: parsed.parsedCredits,
      isCertain: parsed.isCertain,
      tier: parsed.tier,
    };
  } catch (err: any) {
    return {
      status: 'NOT_FOUND',
      confidence: 0,
      candidateCount: 0,
      locatorStrategy: 'findCreditIndicator',
      details: `Credit detection failed: ${err?.message || String(err)}`,
      parsedCredits: null,
      isCertain: false,
    };
  }
}

/**
 * Discover Flow Agent mode control.
 */
export async function findAgentControl(page: Page): Promise<SemanticDiscoveryResult> {
  try {
    const rawResult: any = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll(
          'button, [role="switch"], [role="button"], [role="tab"], input[type="checkbox"]'
        )
      );

      const matches: any[] = [];
      candidates.forEach((el, index) => {
        const text = (el.textContent || '').trim();
        const ariaLabel = el.getAttribute('aria-label') || '';
        const role = el.getAttribute('role') || '';
        const ariaChecked = el.getAttribute('aria-checked');
        const isChecked = ariaChecked === 'true' || el.classList.contains('active') || (el as any).checked === true;

        const combined = `${text} ${ariaLabel}`.toLowerCase();
        if (combined.includes('agent') || combined.includes('flow agent')) {
          matches.push({
            index,
            text,
            ariaLabel,
            role,
            isActive: isChecked,
            tagName: el.tagName.toLowerCase(),
            id: el.id || '',
          });
        }
      });
      return matches;
    });

    if (!rawResult || rawResult.length === 0) {
      return {
        status: 'NOT_FOUND',
        confidence: 0,
        candidateCount: 0,
        locatorStrategy: 'findAgentControl',
        details: 'No Agent mode toggle or button found in current UI',
      };
    }

    if (rawResult.length === 1) {
      const match = rawResult[0];
      return {
        status: 'FOUND',
        confidence: 0.9,
        candidateCount: 1,
        locatorStrategy: match.id ? `#${match.id}` : `button[aria-label*="Agent"]`,
        evidence: `Text: "${match.text}" aria-label: "${match.ariaLabel}" active=${match.isActive}`,
        target: match,
      };
    }

    return {
      status: 'AMBIGUOUS',
      confidence: 0.5,
      candidateCount: rawResult.length,
      locatorStrategy: 'AMBIGUOUS_AGENT_CONTROL',
      details: `Multiple Agent controls found (${rawResult.length})`,
      evidence: rawResult.map((m: any) => `"${m.text || m.ariaLabel}"`).join(' | '),
    };
  } catch (err: any) {
    return {
      status: 'NOT_FOUND',
      confidence: 0,
      candidateCount: 0,
      locatorStrategy: 'findAgentControl',
      details: `Agent control search failed: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Discover existing project asset containers on page without downloading or generating.
 */
export async function findAssetContainers(page: Page): Promise<
  SemanticDiscoveryResult & { containers?: FlowDiscoveredAssetContainer[] }
> {
  try {
    const rawAssets: FlowDiscoveredAssetContainer[] = await page.evaluate(() => {
      const results: FlowDiscoveredAssetContainer[] = [];
      const cards = Array.from(
        document.querySelectorAll(
          '[data-asset-id], [class*="asset-card"], [class*="video-card"], [class*="media-card"], [role="listitem"]'
        )
      );

      cards.forEach((card, idx) => {
        const id = card.getAttribute('data-asset-id') || `asset_card_${idx}`;
        const nameEl = card.querySelector('[class*="title"], [class*="name"], h3, h4, span');
        const name = card.getAttribute('data-asset-name') || (nameEl ? nameEl.textContent?.trim() : '') || `Asset ${idx + 1}`;
        const hasVideo = card.querySelector('video') !== null;
        const hasDownload = card.querySelector('button[aria-label*="Download" i], [aria-label*="download" i]') !== null;

        const hasError = card.querySelector('[class*="error"], [class*="fail"], [role="alert"]') !== null;
        const isReady = hasVideo || card.querySelector('[class*="ready"], [class*="complete"]') !== null;
        const isGenerating = card.querySelector('[class*="progress"], [class*="spinner"], [class*="loading"]') !== null;

        const status: FlowDiscoveredAssetContainer['status'] = hasError
          ? 'FAILED'
          : isReady
          ? 'READY'
          : isGenerating
          ? 'GENERATING'
          : 'UNKNOWN';

        results.push({
          id,
          name,
          status,
          hasVideo,
          hasDownloadAction: hasDownload,
          rawText: (card.textContent || '').slice(0, 100),
        });
      });

      return results;
    });

    if (!rawAssets || rawAssets.length === 0) {
      return {
        status: 'NOT_FOUND',
        confidence: 0.5,
        candidateCount: 0,
        locatorStrategy: 'findAssetContainers',
        details: 'No asset cards or media containers observed in project workspace',
        containers: [],
      };
    }

    return {
      status: 'FOUND',
      confidence: 0.85,
      candidateCount: rawAssets.length,
      locatorStrategy: '[data-asset-id], [class*="asset-card"]',
      evidence: `Discovered ${rawAssets.length} asset containers (Ready: ${rawAssets.filter((a) => a.status === 'READY').length})`,
      containers: rawAssets,
    };
  } catch (err: any) {
    return {
      status: 'NOT_FOUND',
      confidence: 0,
      candidateCount: 0,
      locatorStrategy: 'findAssetContainers',
      details: `Asset container discovery failed: ${err?.message || String(err)}`,
      containers: [],
    };
  }
}

/**
 * Discover download action strictly scoped to an identified asset container.
 * Never performs global unscoped download click.
 */
export async function findDownloadAction(
  page: Page,
  containerIdOrSelector: string
): Promise<SemanticDiscoveryResult> {
  try {
    const downloadStatus: any = await page.evaluate((targetSelector: string) => {
      // Find matching container
      let container = document.querySelector(`[data-asset-id="${targetSelector}"]`);
      if (!container) {
        container = document.querySelector(targetSelector);
      }
      if (!container) {
        return { error: 'Target container not found' };
      }

      // Search download action WITHIN container only
      const downloadButtons = Array.from(
        container.querySelectorAll(
          'button[aria-label*="Download" i], button[title*="Download" i], [role="button"][aria-label*="Download" i], a[download]'
        )
      );

      if (downloadButtons.length === 1) {
        const btn = downloadButtons[0];
        return {
          status: 'FOUND',
          ariaLabel: btn.getAttribute('aria-label') || btn.getAttribute('title') || 'Download',
          tagName: btn.tagName.toLowerCase(),
          count: 1,
        };
      }

      if (downloadButtons.length > 1) {
        return {
          status: 'AMBIGUOUS',
          count: downloadButtons.length,
          details: 'Multiple download buttons inside asset container',
        };
      }

      // Check if more/kebab menu exists that might contain download
      const kebab = container.querySelector(
        'button[aria-label*="More" i], button[aria-label*="Menu" i], [aria-haspopup="menu"]'
      );
      if (kebab) {
        return {
          status: 'MENU_REQUIRED',
          count: 1,
          details: 'Download may be nested inside kebab/context menu',
        };
      }

      return {
        status: 'NOT_FOUND',
        count: 0,
        details: 'No download action found in target asset container',
      };
    }, containerIdOrSelector);

    if (downloadStatus.error) {
      return {
        status: 'NOT_FOUND',
        confidence: 0,
        candidateCount: 0,
        locatorStrategy: `container: ${containerIdOrSelector}`,
        details: downloadStatus.error,
      };
    }

    if (downloadStatus.status === 'FOUND') {
      return {
        status: 'FOUND',
        confidence: 0.9,
        candidateCount: 1,
        locatorStrategy: `[data-asset-id="${containerIdOrSelector}"] button[aria-label*="Download"]`,
        evidence: `Scoped download button: ${downloadStatus.ariaLabel}`,
      };
    }

    if (downloadStatus.status === 'AMBIGUOUS') {
      return {
        status: 'AMBIGUOUS',
        confidence: 0.5,
        candidateCount: downloadStatus.count,
        locatorStrategy: 'AMBIGUOUS_DOWNLOAD_ACTION',
        details: downloadStatus.details,
      };
    }

    return {
      status: 'NOT_FOUND',
      confidence: 0.2,
      candidateCount: downloadStatus.count || 0,
      locatorStrategy: `findDownloadAction(${containerIdOrSelector})`,
      details: downloadStatus.details,
    };
  } catch (err: any) {
    return {
      status: 'NOT_FOUND',
      confidence: 0,
      candidateCount: 0,
      locatorStrategy: `findDownloadAction(${containerIdOrSelector})`,
      details: `Download action discovery failed: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Discovers the safe "Start Creating" home navigation control without Playwright text selectors.
 * Strictly verifies SAFE_NAVIGATION classification; fails closed on ambiguity.
 */
export async function findStartCreatingControl(page: Page): Promise<
  SemanticDiscoveryResult & {
    isSafeNavigation: boolean;
    classification: ControlActionClassification;
  }
> {
  try {
    const candidates: any[] = await page.evaluate(() => {
      const results: any[] = [];
      const clickables = Array.from(
        document.querySelectorAll(
          'button, [role="button"], a[href], div[role="button"], span[role="button"], input[type="button"]'
        )
      );

      // Safe navigation keywords
      const primaryKeywords = ['start creating', 'start creation', 'create project', 'new project', 'start a project'];
      const secondaryKeywords = [
        'get started',
        'blank canvas',
        'blank project',
        'empty project',
        'commencer à créer',
        'nouveau projet',
        'empezar a crear',
        'nuevo proyecto',
        'jetzt erstellen',
        'neues projekt',
        'bắt đầu tạo',
        'tạo dự án',
        '作成を開始',
        '新規プロジェクト',
      ];
      const creditKeywords = ['generate', 'create video', 'render', 'produce', 'spend', 'buy', 'pricing'];

      clickables.forEach((el, index) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const isVisible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0;
        if (!isVisible) return;

        const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
        const ariaLabel = el.getAttribute('aria-label') || '';
        const title = el.getAttribute('title') || '';
        const href = el.getAttribute('href') || '';
        const id = el.id || '';
        const className = el.className || '';

        const lowerText = text.toLowerCase();
        const lowerAria = ariaLabel.toLowerCase();
        const lowerTitle = title.toLowerCase();
        const combined = `${lowerText} ${lowerAria} ${lowerTitle}`.trim();

        // 1. Check for credit-consuming disqualifiers
        let isCreditConsuming = false;
        for (const kw of creditKeywords) {
          if (combined.includes(kw)) {
            isCreditConsuming = true;
            break;
          }
        }
        if (isCreditConsuming) return;

        let score = 0;
        const matches: string[] = [];

        // Exact match with known live Google Flow control "Start Creating"
        if (lowerText === 'start creating' || lowerAria === 'start creating') {
          score += 0.95;
          matches.push('exact live "Start Creating" match');
        } else if (lowerText.startsWith('start creating') || lowerAria.startsWith('start creating')) {
          score += 0.9;
          matches.push('starts with "start creating"');
        } else {
          for (const p of primaryKeywords) {
            if (combined === p || combined.startsWith(p)) {
              score += 0.85;
              matches.push(`primary match: "${p}"`);
              break;
            } else if (combined.includes(p)) {
              score += 0.75;
              matches.push(`primary substring: "${p}"`);
              break;
            }
          }

          if (score === 0) {
            for (const s of secondaryKeywords) {
              if (combined === s || combined.includes(s)) {
                score += 0.7;
                matches.push(`secondary match: "${s}"`);
                break;
              }
            }
          }
        }

        // Href bonus if pointing to /project/new or /projects or /workspace
        if (href && (href.includes('/project') || href.includes('/workspace') || href.includes('/editor'))) {
          score += 0.2;
          matches.push(`project href: "${href}"`);
        }

        if (score >= 0.6) {
          results.push({
            index,
            text,
            ariaLabel,
            title,
            href,
            id,
            className,
            score: Math.min(1.0, score),
            matches,
          });
        }
      });

      return results;
    });

    if (!candidates || candidates.length === 0) {
      return {
        status: 'NOT_FOUND',
        confidence: 0,
        candidateCount: 0,
        locatorStrategy: 'findStartCreatingControl',
        isSafeNavigation: false,
        classification: 'UNKNOWN',
        details: 'No "Start Creating" or equivalent navigation controls found on current page',
      };
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const runnerUp = candidates[1];

    const selector = best.id
      ? `#${best.id}`
      : best.ariaLabel
      ? `[aria-label="${best.ariaLabel.replace(/"/g, '\\"')}"]`
      : best.href
      ? `a[href="${best.href.replace(/"/g, '\\"')}"]`
      : `button:nth-of-type(${best.index + 1})`;

    // Check for ambiguity
    if (runnerUp && Math.abs(best.score - runnerUp.score) < 0.2) {
      return {
        status: 'AMBIGUOUS',
        confidence: 0.45,
        candidateCount: candidates.length,
        locatorStrategy: 'AMBIGUOUS_START_CREATING_CONTROL',
        isSafeNavigation: false,
        classification: 'UNKNOWN',
        details: `Multiple candidate navigation controls discovered (${candidates.length} candidates)`,
        evidence: candidates.slice(0, 3).map((c) => `"${c.text || c.ariaLabel}" (score=${c.score})`).join(' | '),
      };
    }

    return {
      status: 'FOUND',
      confidence: best.score,
      candidateCount: 1,
      locatorStrategy: selector,
      isSafeNavigation: true,
      classification: 'SAFE_NAVIGATION',
      evidence: `Selected safe control: "${best.text || best.ariaLabel}" [${best.matches.join(', ')}]`,
      target: best,
    };
  } catch (err: any) {
    return {
      status: 'NOT_FOUND',
      confidence: 0,
      candidateCount: 0,
      locatorStrategy: 'findStartCreatingControl',
      isSafeNavigation: false,
      classification: 'UNKNOWN',
      details: `Start Creating discovery failed: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Discovers safe intermediate UI action (e.g. Blank Canvas, Create Blank Project in dialog).
 */
export async function findIntermediateWorkspaceAction(page: Page): Promise<
  SemanticDiscoveryResult & {
    isSafeNavigation: boolean;
    classification: ControlActionClassification;
  }
> {
  try {
    const result: any = await page.evaluate(() => {
      // Look for active dialog or modal container
      const dialog = document.querySelector('[role="dialog"], [class*="modal"], [class*="dialog"], [aria-modal="true"]');
      const root = dialog || document;

      const clickables = Array.from(
        root.querySelectorAll('button, [role="button"], a[href], div[role="button"]')
      );

      const safeIntermediateKeywords = [
        'blank canvas',
        'blank project',
        'blank video',
        'start from scratch',
        'default',
        'empty project',
        'continue',
        'next',
        'skip',
        'create project',
      ];

      const candidates: any[] = [];
      clickables.forEach((el, index) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) return;

        const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
        const ariaLabel = el.getAttribute('aria-label') || '';
        const combined = `${text} ${ariaLabel}`.toLowerCase();

        // Disqualify credit-consuming / template purchasing
        if (combined.includes('generate') || combined.includes('pricing') || combined.includes('buy') || combined.includes('credit')) {
          return;
        }

        for (const kw of safeIntermediateKeywords) {
          if (combined === kw || combined.includes(kw)) {
            candidates.push({
              index,
              text,
              ariaLabel,
              id: el.id || '',
              score: combined === kw ? 0.95 : 0.8,
              keyword: kw,
            });
            break;
          }
        }
      });

      return candidates;
    });

    if (!result || result.length === 0) {
      return {
        status: 'NOT_FOUND',
        confidence: 0,
        candidateCount: 0,
        locatorStrategy: 'findIntermediateWorkspaceAction',
        isSafeNavigation: false,
        classification: 'UNKNOWN',
        details: 'No intermediate workspace actions found',
      };
    }

    result.sort((a: any, b: any) => b.score - a.score);
    const best = result[0];
    const runnerUp = result[1];

    if (runnerUp && Math.abs(best.score - runnerUp.score) < 0.15) {
      return {
        status: 'AMBIGUOUS',
        confidence: 0.4,
        candidateCount: result.length,
        locatorStrategy: 'AMBIGUOUS_INTERMEDIATE_ACTION',
        isSafeNavigation: false,
        classification: 'UNKNOWN',
        details: `Multiple candidate intermediate actions discovered (${result.length})`,
      };
    }

    const selector = best.id ? `#${best.id}` : `button:nth-of-type(${best.index + 1})`;
    return {
      status: 'FOUND',
      confidence: best.score,
      candidateCount: 1,
      locatorStrategy: selector,
      isSafeNavigation: true,
      classification: 'SAFE_NAVIGATION',
      evidence: `Safe intermediate action: "${best.text || best.ariaLabel}" (${best.keyword})`,
      target: best,
    };
  } catch (err: any) {
    return {
      status: 'NOT_FOUND',
      confidence: 0,
      candidateCount: 0,
      locatorStrategy: 'findIntermediateWorkspaceAction',
      isSafeNavigation: false,
      classification: 'UNKNOWN',
      details: `Intermediate action discovery failed: ${err?.message || String(err)}`,
    };
  }
}

