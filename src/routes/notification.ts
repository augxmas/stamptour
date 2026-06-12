import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import pool from "../config/database";
import { requireHost } from "../middleware/auth";

const router = Router();

function toUploadUrl(p?: string | null): string | null {
  if (!p) return null;
  const norm = p.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/uploads/");
  if (idx >= 0) return norm.slice(idx);
  const rel = norm.indexOf("uploads/");
  return rel >= 0 ? `/${norm.slice(rel)}` : norm;
}

// 알림 팝업 이미지 업로드
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dest = path.join(process.cwd(), "uploads", "notification");
      try { fs.mkdirSync(dest, { recursive: true }); } catch {}
      cb(null, dest);
    },
    filename: (_req, file, cb) => {
      const safe = crypto.randomBytes(8).toString("hex");
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 6) || ".png";
      cb(null, `${Date.now()}_${safe}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
});

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
    image_url: toUploadUrl(r.image_path),
    image_path: r.image_path || null,
    // DATE 컬럼은 SQL 에서 문자열로 포맷(from_date_str/to_date_str) — 타임존 밀림 방지
    from_date: r.from_date_str || r.from_date,
    to_date: r.to_date_str || r.to_date,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// ── 이미지 업로드 (레코드와 무관 — 등록/수정 시 image_path 로 전달) ──
router.post("/host/image", requireHost, upload.single("image"),
  (req: Request, res: Response) => {
    if (!req.file) { res.status(400).json({ ok: false, error: "no_file" }); return; }
    res.json({ ok: true, image_url: toUploadUrl(req.file.path), image_path: req.file.path });
  });

// ── 알림 목록 (호스트 전체 프로젝트, 검색) — 알림관리 그리드 ──
router.get("/host/notifications", requireHost, async (req, res) => {
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
    `SELECT n.*, DATE_FORMAT(n.from_date,'%Y-%m-%d') AS from_date_str,
            DATE_FORMAT(n.to_date,'%Y-%m-%d') AS to_date_str,
            p.project_name, p.project_serial
       FROM project_notifications n
       JOIN projects p ON p.id = n.project_id
       ${where}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT 1000`,
    params,
  );
  res.json({ ok: true, data: (Array.isArray(rows) ? rows : []).map(mapRow) });
});

// ── 단일 조회 (수정 로드용) ──
router.get("/host/projects/:id/notifications/:nid", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  const nid = Number(req.params.nid);
  if (!(await ensureOwnership(pid, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const [rows] = await pool.execute(
    `SELECT n.*, DATE_FORMAT(n.from_date,'%Y-%m-%d') AS from_date_str,
            DATE_FORMAT(n.to_date,'%Y-%m-%d') AS to_date_str,
            p.project_name, p.project_serial
       FROM project_notifications n JOIN projects p ON p.id = n.project_id
      WHERE n.id = ? AND n.project_id = ?`,
    [nid, pid],
  );
  const r = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!r) { res.status(404).json({ ok: false, error: "not_found" }); return; }
  res.json({ ok: true, data: mapRow(r) });
});

function validateBody(b: any): { title: string; content: string; from: string; to: string; status: string; image: string | null } | null {
  const title = String(b.title || "").trim().slice(0, 255);
  const content = String(b.content || "");
  const from = String(b.from_date || "").slice(0, 10);
  const to = String(b.to_date || "").slice(0, 10);
  const status = ["active", "inactive"].includes(b.status) ? b.status : "active";
  const image = b.image_path ? String(b.image_path) : null;
  if (!title) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  return { title, content, from, to, status, image };
}

// ── 생성 ──
router.post("/host/projects/:id/notifications", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  if (!(await ensureOwnership(pid, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const v = validateBody(req.body || {});
  if (!v) { res.status(400).json({ ok: false, error: "invalid", message: "제목과 노출기간을 확인해 주세요." }); return; }
  const [r] = await pool.execute(
    `INSERT INTO project_notifications (project_id, title, content, image_path, from_date, to_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [pid, v.title, v.content, v.image, v.from, v.to, v.status],
  );
  res.json({ ok: true, id: (r as any).insertId });
});

// ── 수정 ──
router.put("/host/projects/:id/notifications/:nid", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  const nid = Number(req.params.nid);
  if (!(await ensureOwnership(pid, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const v = validateBody(req.body || {});
  if (!v) { res.status(400).json({ ok: false, error: "invalid", message: "제목과 노출기간을 확인해 주세요." }); return; }
  const [r] = await pool.execute(
    `UPDATE project_notifications
        SET title = ?, content = ?, image_path = ?, from_date = ?, to_date = ?, status = ?, updated_at = NOW()
      WHERE id = ? AND project_id = ?`,
    [v.title, v.content, v.image, v.from, v.to, v.status, nid, pid],
  );
  if (!((r as any).affectedRows > 0)) { res.status(404).json({ ok: false, error: "not_found" }); return; }
  res.json({ ok: true });
});

// ── 삭제 ──
router.delete("/host/projects/:id/notifications/:nid", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  const nid = Number(req.params.nid);
  if (!(await ensureOwnership(pid, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  await pool.execute(
    "DELETE FROM project_notifications WHERE id = ? AND project_id = ?", [nid, pid],
  );
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
//  Public — 랜딩페이지 활성 알림 팝업
// ═══════════════════════════════════════════════════════════════
router.get("/public/projects/:serial/notification/active", async (req, res) => {
  const serial = String(req.params.serial || "").trim();
  const [pr] = await pool.execute(
    "SELECT id FROM projects WHERE project_serial = ?", [serial],
  );
  const proj = (Array.isArray(pr) ? pr[0] : null) as any;
  if (!proj) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
  // 오늘 날짜가 노출기간 안 + status active 인 알림 전체 (등록 순)
  const [rows] = await pool.execute(
    `SELECT id, title, content, image_path FROM project_notifications
      WHERE project_id = ? AND status = 'active'
        AND CURDATE() BETWEEN from_date AND to_date
      ORDER BY created_at ASC, id ASC`,
    [proj.id],
  );
  const list = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    id: r.id,
    title: r.title,
    content: r.content || "",
    image_url: toUploadUrl(r.image_path),
  }));
  res.json({
    ok: true,
    notifications: list,
    notification: list[0] || null,   // 하위호환 (단건 사용처 대비)
  });
});

export default router;
