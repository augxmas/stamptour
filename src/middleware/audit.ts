import type { NextFunction, Request, Response } from "express";
import {
  auditActorFromRequest,
  clientIp,
  type AuditAction,
  writeAuditLog,
} from "../services/audit.service";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SKIP_PATHS = new Set(["/api/session-extend"]);

function actionFromRequest(req: Request): AuditAction {
  const path = req.path.toLowerCase();
  if (path.includes("/login")) return "login";
  if (path.includes("/logout")) return "logout";
  if (req.method === "DELETE") return "delete";
  if (req.method === "PUT" || req.method === "PATCH") return "update";
  if (req.method === "POST") return "create";
  return "request";
}

function inferEntity(path: string): { entityType: string | null; entityId: string | null } {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "api") return { entityType: null, entityId: null };

  const withoutApi = parts.slice(1);
  const entityParts = withoutApi.filter((part) => !/^\d+$/.test(part));
  const numericId = withoutApi.find((part) => /^\d+$/.test(part));

  return {
    entityType: entityParts.slice(0, 3).join("/") || null,
    entityId: numericId ?? null,
  };
}

export function auditMutations(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith("/api/") || !MUTATION_METHODS.has(req.method) || SKIP_PATHS.has(req.path)) {
    next();
    return;
  }

  const startedAt = Date.now();
  const method = req.method;
  const originalUrl = req.originalUrl;
  const ip = clientIp(req);
  const userAgent = String(req.headers["user-agent"] ?? "");
  const { entityType, entityId } = inferEntity(req.path);
  const action = actionFromRequest(req);
  const initialActor = auditActorFromRequest(req);

  res.on("finish", () => {
    const finalActor = auditActorFromRequest(req);
    const actor = finalActor.actorType === "anonymous" ? initialActor : finalActor;
    void writeAuditLog({
      ...actor,
      action,
      entityType,
      entityId,
      requestMethod: method,
      requestPath: originalUrl,
      requestIp: ip,
      userAgent,
      statusCode: res.statusCode,
      success: res.statusCode < 400,
      metadata: {
        duration_ms: Date.now() - startedAt,
        session_id: req.sessionID,
      },
    });
  });

  next();
}
