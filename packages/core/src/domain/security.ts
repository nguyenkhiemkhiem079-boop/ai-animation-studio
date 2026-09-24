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
