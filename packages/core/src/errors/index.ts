/**
 * Error hierarchy for AI Animation Studio.
 */

export class StudioError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: string = 'STUDIO_ERROR', details?: Record<string, unknown>) {
    super(message);
    this.name = 'StudioError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends StudioError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class StorageError extends StudioError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'STORAGE_ERROR', details);
    this.name = 'StorageError';
  }
}

export class CheckpointError extends StudioError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CHECKPOINT_ERROR', details);
    this.name = 'CheckpointError';
  }
}

export class PipelineError extends StudioError {
  public readonly stepId?: string;

  constructor(message: string, stepId?: string, details?: Record<string, unknown>) {
    super(message, 'PIPELINE_ERROR', { ...details, stepId });
    this.name = 'PipelineError';
    this.stepId = stepId;
  }
}

export class ProviderError extends StudioError {
  public readonly providerId: string;

  constructor(message: string, providerId: string, details?: Record<string, unknown>) {
    super(message, 'PROVIDER_ERROR', { ...details, providerId });
    this.name = 'ProviderError';
    this.providerId = providerId;
  }
}

export class ContinuityError extends StudioError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONTINUITY_ERROR', details);
    this.name = 'ContinuityError';
  }
}

export class NotFoundError extends StudioError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'NOT_FOUND_ERROR', details);
    this.name = 'NotFoundError';
  }
}
