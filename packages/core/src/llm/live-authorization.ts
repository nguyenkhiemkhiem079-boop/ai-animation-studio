import { ProductionSafetyError } from '../domain/execution-mode.js';

export interface LiveAuthorizationCheckOptions {
  explicitLiveFlag?: boolean;
}

export class LiveAuthorizationPolicy {
  /**
   * Evaluates whether live external provider network calls (which consume paid or free API quota)
   * are explicitly authorized by the operator.
   *
   * Architectural Rule:
   * A configured GEMINI_API_KEY alone MUST NOT silently authorize live network calls.
   * Live calls require explicit operator opt-in:
   * 1. explicitLiveFlag === true (e.g. --live CLI flag), OR
   * 2. process.env.RUN_LIVE_PROVIDER_TESTS === 'true'
   *
   * Offline CI and unconfirmed test runs evaluate to false (fail closed).
   */
  public static isLiveAuthorized(options?: LiveAuthorizationCheckOptions): boolean {
    if (options?.explicitLiveFlag === true) {
      return true;
    }
    const envVal = process.env.RUN_LIVE_PROVIDER_TESTS;
    return envVal === 'true';
  }

  /**
   * Asserts that live execution is authorized. Throws ProductionSafetyError if not.
   */
  public static assertLiveAuthorized(
    contextMessage = 'Live external provider call',
    options?: LiveAuthorizationCheckOptions
  ): void {
    if (!this.isLiveAuthorized(options)) {
      throw new ProductionSafetyError(
        `LIVE PROVIDER DISABLED: ${contextMessage} blocked. A configured GEMINI_API_KEY does not authorize network calls without explicit opt-in. Enable via '--live' flag or set RUN_LIVE_PROVIDER_TESTS=true in your environment.`
      );
    }
  }
}
