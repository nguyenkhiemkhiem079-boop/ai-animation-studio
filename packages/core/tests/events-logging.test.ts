import { describe, it, expect } from 'vitest';
import { StudioEventBus, Logger, LogRecord } from '../src/index.js';

describe('Events and Logging', () => {
  it('dispatches events to topic listeners', async () => {
    const bus = new StudioEventBus();
    const received: any[] = [];

    bus.on('project:created', (evt) => {
      received.push(evt.payload);
    });

    await bus.emit('project:created', { id: 'p1', name: 'My Series' });
    expect(received).toHaveLength(1);
    expect(received[0].name).toBe('My Series');
  });

  it('supports wildcard handlers and captures history', async () => {
    const bus = new StudioEventBus({ maxHistory: 10 });
    const allEvents: string[] = [];

    bus.onAny((evt) => {
      allEvents.push(evt.topic);
    });

    await bus.emit('pipeline:started', { pipelineName: 'test' });
    await bus.emit('pipeline:completed', { pipelineName: 'test' });

    expect(allEvents).toEqual(['pipeline:started', 'pipeline:completed']);
    expect(bus.getHistory()).toHaveLength(2);
  });

  it('filters log levels correctly and records context', () => {
    const records: LogRecord[] = [];
    const logger = new Logger({
      minLevel: 'warn',
      handlers: [(rec) => records.push(rec)],
    });

    logger.debug('This is debug');
    logger.info('This is info');
    logger.warn('This is warning', { shotId: 'SHOT_01' });
    logger.error('This is error', new Error('Boom'));

    expect(records).toHaveLength(2);
    expect(records[0].level).toBe('warn');
    expect(records[0].context?.shotId).toBe('SHOT_01');
    expect(records[1].level).toBe('error');
    expect(records[1].error?.message).toBe('Boom');
  });
});
