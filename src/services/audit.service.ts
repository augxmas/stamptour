import type { Request } from "express";
import pool from "../config/database";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "login"
  | "logout"
  | "request"
  | "other";

export type AuditActorType =
  | "host"
  | "supervisor"
  | "merchant"
  | "partner"
  | "system"
  | "anonymous";

export interface AuditActor {
  actorType: AuditActorType;
  actorId?: string | null;
  actorLabel?: string | null;
}

export interface AuditLogEntry extends Partial<AuditActor> {
  action: AuditAction;
  entityType?: string | null;
  entityId?: string | null;
  requestMethod?: string | null;
  requestPath?: string | null;
  requestIp?: string | null;
  userAgent?: string | null;
  statusCode?: number | null;
  success?: boolean;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}

let insertFailureWarned = false;

function asJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ unserializable: true });
  }
}

function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function clientIp(req: Request): string {
  const forwardedFor = firstHeaderValue(req.headers["x-forwarded-for"]);
  return String(forwardedFor.split(",")[0]?.trim() || req.socket.remoteAddress || "");
}

export function auditActorFromRequest(req: Request): AuditActor {
  const session = req.session;
  if (!session) return { actorType: "anonymous", actorId: null, actorLabel: null };

  if (session.host) {
    return {
      actorType: "host",
      actorId: String(session.host.id),
      actorLabel: session.host.name || session.host.email || null,
    };
  }

  if (session.supervisor) {
    return {
      actorType: "supervisor",
      actorId: session.supervisor.username,
      actorLabel: session.supervisor.username,
    };
  }

  if (session.merchant) {
    return {
      actorType: "merchant",
      actorId: String(session.merchant.id),
      actorLabel: session.merchant.name || session.merchant.email || null,
    };
  }

  if (session.partner) {
    return {
      actorType: "partner",
      actorId: String(session.partner.id),
      actorLabel: session.partner.email,
    };
  }

  return { actorType: "anonymous", actorId: null, actorLabel: null };
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await pool.execute(
      `INSERT INTO audit_logs
        (actor_type, actor_id, actor_label, action, entity_type, entity_id,
         request_method, request_path, request_ip, user_agent, status_code, success,
         before_json, after_json, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.actorType ?? "system",
        entry.actorId ?? null,
        entry.actorLabel ?? null,
        entry.action,
        entry.entityType ?? null,
        entry.entityId ?? null,
        entry.requestMethod ?? null,
        entry.requestPath ?? null,
        entry.requestIp ?? null,
        entry.userAgent ?? null,
        entry.statusCode ?? null,
        entry.success === false ? 0 : 1,
        asJson(entry.before),
        asJson(entry.after),
        asJson(entry.metadata),
      ],
    );
  } catch (error) {
    if (!insertFailureWarned) {
      insertFailureWarned = true;
      console.warn("[audit] audit_logs insert failed. Has the audit migration been applied?", error);
    }
  }
}
