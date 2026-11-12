import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLog } from './audit-log.entity';

export interface AuditEntry {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
}

/** A record of every change, written in the same transaction as the change. */
@Injectable()
export class AuditService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async record(entry: AuditEntry, manager: EntityManager = this.db.manager): Promise<void> {
    await manager.insert(AuditLog, entry);
  }
}
