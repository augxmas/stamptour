import { Router } from "express";
import pool from "../config/database";
import { requireHost } from "../middleware/auth";

const router = Router();

async function ensureOwnership(projectId: number, hostId: number): Promise<boolean> {
  const [rows] = await pool.execute(
    "SELECT id FROM projects WHERE id = ? AND host_id = ?", [projectId, hostId],
  );
  return Array.isArray(rows) && rows.length > 0;
}

function mapRow(r: any) {
  return {
    id: r.id,
    project_id: r.project_id,
    project_name: r.project_name,
    project_serial: r.project_serial,
    title: r.title,
    content: r.content || "",
    pinned: Number(r.pinned) === 1,
    show_as_popup: Number(r.show_as_popup) === 1,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function validateBody(b: any): { title: string; content: string; pinned: number; show_as_popup: number; status: string } | null {
  const title = String(b.title || "").trim().slice(0, 255);
  const content = String(b.content || "");
  const pinned = b.pinned ? 1 : 0;
  const show_as_popup = b.show_as_popup ? 1 : 0;
  const status = ["active", "inactive"].includes(b.status) ? b.status : "active";
  if (!title) return null;
  return { title, content, pinned, show_as_popup, status };
}

// ── 목록 (호스트 전체 프로젝트, 검색) — 공지사항관리 그리드 ──
router.get("/host/notices", requireHost, async (req, res) => {
  const hostId = req.session.host!.id;
  const projectName = String(req.query.project_name || "").trim();
  const status = String(req.query.status || "");
  let where = "WHERE p.host_id = ?";
  const params: Array<string | number> = [hostId];
  if (projectName) {
    where += " AND (p.project_name LIKE ? OR p.project_serial LIKE ?)";
    params.push(`%${projectName}%`, `%${projectName}%`);
  }
  if (["active", "inactive"].includes(status)) { where += " AND n.status = ?"; params.push(status); }
  const [rows] = await pool.execute(
    `SELECT n.*, p.project_name, p.project_serial
       FROM project_notices n
       JOIN projects p ON p.id = n.project_id
       ${where}
      ORDER BY n.pinned DESC, n.created_at DESC, n.id DESC
      LIMIT 1000`,
    params,
  );
  res.json({ ok: true, data: (Array.isArray(rows) ? rows : []).map(mapRow) });
});

// ── 단일 조회 (수정 로드용) ──
router.get("/host/projects/:id/notices/:nid", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  const nid = Number(req.params.nid);
  if (!(await ensureOwnership(pid, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const [rows] = await pool.execute(
    `SELECT n.*, p.project_name, p.project_serial
       FROM project_notices n JOIN projects p ON p.id = n.project_id
      WHERE n.id = ? AND n.project_id = ?`,
    [nid, pid],
  );
  const r = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!r) { res.status(404).json({ ok: false, error: "not_found" }); return; }
  res.json({ ok: true, data: mapRow(r) });
});

// ── 생성 ──
router.post("/host/projects/:id/notices", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  if (!(await ensureOwnership(pid, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const v = validateBody(req.body || {});
  if (!v) { res.status(400).json({ ok: false, error: "invalid", message: "제목을 입력해 주세요." }); return; }
  const [r] = await pool.execute(
    `INSERT INTO project_notices (project_id, title, content, pinned, show_as_popup, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [pid, v.title, v.content, v.pinned, v.show_as_popup, v.status],
  );
  res.json({ ok: true, id: (r as any).insertId });
});

// ── 수정 ──
router.put("/host/projects/:id/notices/:nid", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  const nid = Number(req.params.nid);
  if (!(await ensureOwnership(pid, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const v = validateBody(req.body || {});
  if (!v) { res.status(400).json({ ok: false, error: "invalid", message: "제목을 입력해 주세요." }); return; }
  const [r] = await pool.execute(
    `UPDATE project_notices
        SET title = ?, content = ?, pinned = ?, show_as_popup = ?, status = ?, updated_at = NOW()
      WHERE id = ? AND project_id = ?`,
    [v.title, v.content, v.pinned, v.show_as_popup, v.status, nid, pid],
  );
  if (!((r as any).affectedRows > 0)) { res.status(404).json({ ok: false, error: "not_found" }); return; }
  res.json({ ok: true });
});

// ── 삭제 ──
router.delete("/host/projects/:id/notices/:nid", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  const nid = Number(req.params.nid);
  if (!(await ensureOwnership(pid, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  await pool.execute(
    "DELETE FROM project_notices WHERE id = ? AND project_id = ?", [nid, pid],
  );
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
//  Public — 랜딩페이지 공지사항 목록 (노출 상태)
// ═══════════════════════════════════════════════════════════════
router.get("/public/projects/:serial/notices", async (req, res) => {
  const serial = String(req.params.serial || "").trim();
  const [pr] = await pool.execute(
    "SELECT id FROM projects WHERE project_serial = ?", [serial],
  );
  const proj = (Array.isArray(pr) ? pr[0] : null) as any;
  if (!proj) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
  const [rows] = await pool.execute(
    `SELECT id, title, content, pinned,
            DATE_FORMAT(created_at, '%Y-%m-%d') AS created_date
       FROM project_notices
      WHERE project_id = ? AND status = 'active'
      ORDER BY pinned DESC, created_at DESC, id DESC
      LIMIT 100`,
    [proj.id],
  );
  const list = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    id: r.id,
    title: r.title,
    content: r.content || "",
    pinned: Number(r.pinned) === 1,
    created_date: r.created_date,
  }));
  res.json({ ok: true, notices: list });
});

// 랜딩 팝업으로 노출할 공지 — '알림으로 보이기' on + 활성 + 작성일~프로젝트 종료일 사이
router.get("/public/projects/:serial/popup-notices", async (req, res) => {
  const serial = String(req.params.serial || "").trim();
  const [pr] = await pool.execute(
    "SELECT id, to_date FROM projects WHERE project_serial = ?", [serial],
  );
  const proj = (Array.isArray(pr) ? pr[0] : null) as any;
  if (!proj) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
  // 노출기간: 작성일 ~ 프로젝트 종료일 (to_date 없으면 종료 제한 없음)
  const [rows] = await pool.execute(
    `SELECT id, title, content
       FROM project_notices
      WHERE project_id = ? AND status = 'active' AND show_as_popup = 1
        AND CURDATE() >= DATE(created_at)
        AND (? IS NULL OR CURDATE() <= ?)
      ORDER BY pinned DESC, created_at ASC, id ASC`,
    [proj.id, proj.to_date, proj.to_date],
  );
  const list = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    id: r.id,
    title: r.title,
    content: r.content || "",
  }));
  res.json({ ok: true, notices: list });
});

export default router;
