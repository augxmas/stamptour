import { Router, Request } from "express";
import pool from "../config/database";

const router = Router();

// 로그인 세션(host/supervisor/merchant/partner)에서 현재 사용자 식별
function resolveUser(req: Request): { type: string; id: string } | null {
  const s = req.session as any;
  if (s.host)       return { type: "host",       id: String(s.host.id) };
  if (s.merchant)   return { type: "merchant",   id: String(s.merchant.id) };
  if (s.supervisor) return { type: "supervisor", id: String(s.supervisor.username) };
  if (s.partner)    return { type: "partner",    id: String(s.partner.id) };
  return null;
}

// 현재 사용자의 전체 그리드 설정 조회 → { grid_key: prefs }
router.get("/", async (req, res) => {
  const u = resolveUser(req);
  if (!u) { res.status(401).json({ ok: false, error: "login_required" }); return; }
  const [rows] = await pool.execute(
    "SELECT grid_key, prefs_json FROM user_grid_prefs WHERE user_type = ? AND user_id = ?",
    [u.type, u.id],
  );
  const prefs: Record<string, any> = {};
  (Array.isArray(rows) ? rows : []).forEach((r: any) => {
    try { prefs[r.grid_key] = JSON.parse(r.prefs_json); } catch { /* ignore */ }
  });
  res.json({ ok: true, prefs });
});

// 특정 그리드 설정 저장(업서트)
router.put("/", async (req, res) => {
  const u = resolveUser(req);
  if (!u) { res.status(401).json({ ok: false, error: "login_required" }); return; }
  const gridKey = String((req.body || {}).grid_key || "").slice(0, 191);
  if (!gridKey) { res.status(400).json({ ok: false, error: "missing_grid_key" }); return; }
  const prefs = (req.body || {}).prefs || {};
  const json = JSON.stringify(prefs).slice(0, 60000);
  await pool.execute(
    `INSERT INTO user_grid_prefs (user_type, user_id, grid_key, prefs_json)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE prefs_json = VALUES(prefs_json), updated_at = NOW()`,
    [u.type, u.id, gridKey, json],
  );
  res.json({ ok: true });
});

export default router;
