import type { NextFunction, Request, Response } from "express";

export function requireHost(req: Request, res: Response, next: NextFunction): void {
  if (req.session.host) {
    next();
    return;
  }
  res.status(401).json({ error: "host_login_required" });
}

export function requireSupervisor(req: Request, res: Response, next: NextFunction): void {
  if (req.session.supervisor) {
    next();
    return;
  }
  res.status(401).json({ error: "supervisor_login_required" });
}

export function requireMerchant(req: Request, res: Response, next: NextFunction): void {
  if (req.session.merchant) {
    next();
    return;
  }
  res.status(401).json({ error: "merchant_login_required" });
}

export function touchActivity(req: Request, _res: Response, next: NextFunction): void {
  req.session.lastActivity = Date.now();
  next();
}
