import type { AuditEvent } from '@campusflow/types';
import { createLogger } from './logger.js';

const logger = createLogger({ module: 'audit' });

export interface AuditLogger {
  log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent>;
  queryUserAuditEvents(userId: string, limit?: number): Promise<AuditEvent[]>;
}

export class InMemoryAuditLogger implements AuditLogger {
  private events: AuditEvent[] = [];

  async log(eventData: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent> {
    const event: AuditEvent = {
      ...eventData,
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date(),
    };

    this.events.push(event);

    logger.info('Audit event recorded', {
      auditEventId: event.id,
      userId: event.userId,
      action: event.action,
      capability: event.capability,
      resourceType: event.resourceType,
      allowed: event.allowed,
    });

    return event;
  }

  async queryUserAuditEvents(userId: string, limit = 50): Promise<AuditEvent[]> {
    return this.events
      .filter((e) => e.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  clear(): void {
    this.events = [];
  }
}
