import * as path from 'node:path';
import { ProductionSafetyError } from '../domain/execution-mode.js';

export class ProductionLeakDetector {
  private static readonly DISALLOWED_PATTERNS = [
    /(?:^|[\\/])\.studio[\\/]smoke(?:[\\/]|$)/i,
    /(?:^|[\\/])\.studio[\\/]tests(?:[\\/]|$)/i,
    /(?:^|[\\/])fixtures?(?:[\\/]|$)/i,
    /(?:^|[\\/])test-fixtures?(?:[\\/]|$)/i,
    /(?:^|[\\/])mock-media(?:[\\/]|$)/i,
    /(?:^|[\\/])tmp(?:[\\/]|$)/i,
    /(?:^|[\\/])temp(?:[\\/]|$)/i,
  ];

  /**
   * Checks whether a media path originates from a test, smoke, or fixture location.
   */
  public static isTestOrSmokeArtifact(filePath: string): boolean {
    const normalized = path.normalize(filePath);
    return this.DISALLOWED_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  /**
   * Asserts that a media file is safe to use in PRODUCTION mode.
   * Throws ProductionSafetyError if any leak is detected.
   */
  public static assertProductionMediaSafety(filePath: string, contextDescription: string = 'media'): void {
    if (this.isTestOrSmokeArtifact(filePath)) {
      throw new ProductionSafetyError(
        `Production safety violation: ${contextDescription} path "${filePath}" originates from a test, fixture, or smoke directory. Test artifacts are strictly rejected in PRODUCTION mode.`
      );
    }
  }
}
