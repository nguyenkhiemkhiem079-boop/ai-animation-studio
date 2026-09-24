import { ValidationError } from '../errors/index.js';
import { ProductionSafetyError } from './execution-mode.js';

/**
 * Validates that an identifier (projectId, runId, shotId, seriesId, assetId)
 * is filesystem-safe and cannot be used for path traversal attacks.
 *
 * Rejects:
 * - Empty or whitespace-only identifiers
 * - Relative directory traversal ('..', '.')
 * - Forward slashes ('/') and backslashes ('\')
 * - Colon / Windows drive syntax ('C:')
 * - Control characters and null bytes
 * - Non-alphanumeric special characters outside of safe set: [-_.]
 */
export function assertSafeIdentifier(id: unknown, identifierName = 'Identifier'): string {
  if (typeof id !== 'string') {
    throw new ValidationError(`${identifierName} must be a string.`);
  }

  const trimmed = id.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${identifierName} cannot be empty or whitespace-only.`);
  }

  // Reject path traversal patterns
  if (trimmed.includes('..') || trimmed === '.' || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new ProductionSafetyError(
      `Security Violation: ${identifierName} "${id}" contains illegal path traversal characters ('..', '/', '\\').`
    );
  }

  // Reject Windows drive prefixes (e.g. C:, D:) and colon
  if (trimmed.includes(':')) {
    throw new ProductionSafetyError(
      `Security Violation: ${identifierName} "${id}" contains illegal drive separator (':').`
    );
  }

  // Reject null bytes and control characters
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    throw new ProductionSafetyError(
      `Security Violation: ${identifierName} "${id}" contains control characters or null bytes.`
    );
  }

  // Enforce safe character set: alphanumeric, underscore, hyphen, and dot (not starting with dot)
  if (/^\./.test(trimmed)) {
    throw new ProductionSafetyError(
      `Security Violation: ${identifierName} "${id}" cannot start with a dot '.'`
    );
  }

  // Max length check to prevent DOS via huge filenames
  if (trimmed.length > 128) {
    throw new ValidationError(
      `${identifierName} exceeds maximum allowed length of 128 characters.`
    );
  }

  // Allow standard identifier characters: a-z, A-Z, 0-9, _, -, .
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(trimmed)) {
    throw new ProductionSafetyError(
      `Security Violation: ${identifierName} "${id}" contains unsupported special characters. Allowed: [a-zA-Z0-9_-.]`
    );
  }

  return trimmed;
}

/**
 * Validates that a resolved path is strictly contained within the expected base directory.
 */
export function assertPathContained(targetPath: string, expectedBaseDir: string, context = 'Path'): void {
  const normalizedTarget = targetPath.replace(/\\/g, '/');
  const normalizedBase = expectedBaseDir.replace(/\\/g, '/').replace(/\/$/, '');

  if (!normalizedTarget.startsWith(normalizedBase + '/') && normalizedTarget !== normalizedBase) {
    throw new ProductionSafetyError(
      `Security Violation: ${context} "${targetPath}" escapes expected root directory "${expectedBaseDir}".`
    );
  }
}

/**
 * Error thrown when durable persisted production evidence is unparseable or corrupted (Phase 22.9).
 */
export class CorruptedEvidenceError extends ProductionSafetyError {
  constructor(
    public readonly filePath: string,
    message: string,
    public readonly recoveryAction = 'Inspect file for syntax corruption or restore from backup.'
  ) {
    super(`CORRUPTED EVIDENCE: Failed to parse "${filePath}": ${message}. Recovery: ${recoveryAction}`);
    this.name = 'CorruptedEvidenceError';
  }
}

/**
 * Redacts secrets (API keys, tokens, auth headers, query params) from error messages, logs, or JSON payloads (Phase 22.17).
 */
export function redactSecrets(input: unknown): string {
  if (input === null || input === undefined) return '';
  let str: string;
  if (input instanceof Error) {
    str = `${input.name}: ${input.message}\n${input.stack || ''}`;
  } else if (typeof input === 'object') {
    try {
      str = JSON.stringify(input);
    } catch {
      str = String(input);
    }
  } else {
    str = String(input);
  }

  return str
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_GEMINI_KEY]')
    .replace(/AIzaSy[A-Za-z0-9_-]{33}/g, '[REDACTED_GEMINI_KEY]')
    .replace(/sk-[0-9A-Za-z-_]{32,}/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9_.\-~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/"(key|apiKey|password|secret|token|GEMINI_API_KEY)":\s*"[^"]*"/gi, '"$1": "[REDACTED]"')
    .replace(/[?&](key|api_key|token|access_token)=[^&\s"]+/gi, '$1=[REDACTED]');
}
