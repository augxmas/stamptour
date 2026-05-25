import type { NextFunction, Request, Response } from "express";
import pool from "../config/database";

const MAX_IDLE_MS = 4 * 60 * 1000;

// 세션 만료/종료 시 로그아웃 시각을 기록 (host/supervisor 공통)
function markLogout(sessionId: string): void {
  pool.execute(
    "UPDATE login_histories SET logout_at = NOW() WHERE session_id = ? AND logout_at IS NULL",
    [sessionId],
  ).catch(() => {});
}

export function sessionTimeout(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const last = req.session.lastActivity ?? now;

  if ((req.session.host || req.session.supervisor || req.session.merchant) && now - last > MAX_IDLE_MS) {
    markLogout(req.sessionID);
    req.session.destroy(() => {
      res.status(440).json({
        error: "session_expired",
        message: "세션이 종료되었습니다. 다시 로그인해 주세요.",
      });
    });
    return;
  }

  req.session.lastActivity = now;
  next();
}

export function getSessionInfo(req: Request, res: Response): void {
  if (!req.session.host && !req.session.supervisor && !req.session.merchant) {
    res.status(401).json({ error: "not_logged_in" });
    return;
  }

  const now = Date.now();
  const last = req.session.lastActivity ?? now;
  const remainingMs = Math.max(0, MAX_IDLE_MS - (now - last));

  res.json({
    ok: true,
    remainingMs,
    expiringSoon: remainingMs <= 60 * 1000,
  });
}

// 사용자가 '로그인 연장'을 누르면 유휴 타이머를 초기화한다.
export function extendSession(req: Request, res: Response): void {
  if (!req.session.host && !req.session.supervisor && !req.session.merchant) {
    res.status(401).json({ error: "not_logged_in" });
    return;
  }
  const now = Date.now();
  const last = req.session.lastActivity ?? now;
  if (now - last > MAX_IDLE_MS) {
    markLogout(req.sessionID);
    req.session.destroy(() => {
      res.status(440).json({ error: "session_expired", message: "세션이 종료되었습니다. 다시 로그인해 주세요." });
    });
    return;
  }
  req.session.lastActivity = now;
  res.json({ ok: true, remainingMs: MAX_IDLE_MS });
}
