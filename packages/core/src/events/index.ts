/**
 * Strongly-typed asynchronous event bus for AI Animation Studio.
 */

export type EventTopic =
  | 'project:created'
  | 'project:updated'
  | 'universe:entity_registered'
  | 'universe:canon_updated'
  | 'pipeline:started'
  | 'pipeline:step_started'
  | 'pipeline:step_completed'
  | 'pipeline:step_failed'
  | 'pipeline:completed'
  | 'checkpoint:created'
  | 'checkpoint:restored'
  | 'asset:registered'
  | 'asset:approved'
  | 'shot:planned'
  | 'shot:rendered'
  | (string & {});

export interface StudioEvent<TPayload = unknown> {
  id: string;
  topic: EventTopic;
  timestamp: string;
  source: string;
  payload: TPayload;
  metadata?: {
    projectId?: string;
    seriesId?: string;
    correlationId?: string;
    [key: string]: unknown;
  };
}

export type EventHandler<TPayload = unknown> = (event: StudioEvent<TPayload>) => void | Promise<void>;

export class StudioEventBus {
  private handlers = new Map<string, Set<EventHandler<any>>>();
  private wildcardHandlers = new Set<EventHandler<any>>();
  private history: StudioEvent<any>[] = [];
  private maxHistory: number;

  constructor(options: { maxHistory?: number } = {}) {
    this.maxHistory = options.maxHistory ?? 1000;
  }

  public on<TPayload = unknown>(topic: EventTopic, handler: EventHandler<TPayload>): () => void {
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, new Set());
    }
    const set = this.handlers.get(topic)!;
    set.add(handler as EventHandler<any>);

    return () => {
      set.delete(handler as EventHandler<any>);
    };
  }

  public onAny(handler: EventHandler<any>): () => void {
    this.wildcardHandlers.add(handler);
    return () => {
      this.wildcardHandlers.delete(handler);
    };
  }

  public async emit<TPayload = unknown>(
    topic: EventTopic,
    payload: TPayload,
    options: {
      source?: string;
      metadata?: StudioEvent['metadata'];
      id?: string;
    } = {}
  ): Promise<StudioEvent<TPayload>> {
    const event: StudioEvent<TPayload> = {
      id: options.id ?? `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      topic,
      timestamp: new Date().toISOString(),
      source: options.source ?? 'studio-core',
      payload,
      metadata: options.metadata,
    };

    if (this.maxHistory > 0) {
      this.history.push(event);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
    }

    const topicHandlers = this.handlers.get(topic);
    const targetHandlers = [
      ...(topicHandlers ? Array.from(topicHandlers) : []),
      ...Array.from(this.wildcardHandlers),
    ];

    await Promise.all(
      targetHandlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (err) {
          console.error(`Error in event listener for topic "${topic}":`, err);
        }
      })
    );

    return event;
  }

  public getHistory(filter?: { topic?: EventTopic; since?: string }): StudioEvent[] {
    let result = this.history;
    if (filter?.topic) {
      result = result.filter((e) => e.topic === filter.topic);
    }
    if (filter?.since) {
      result = result.filter((e) => e.timestamp >= filter.since!);
    }
    return [...result];
  }

  public clearHistory(): void {
    this.history = [];
  }
}

export const defaultEventBus = new StudioEventBus();
