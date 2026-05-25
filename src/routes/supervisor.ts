import path from "node:path";
import fs from "node:fs";
import ExcelJS from "exceljs";
import { Router } from "express";
import multer from "multer";
import pool from "../config/database";
import { requireSupervisor } from "../middleware/auth";
import { createQrZip, generateProjectQrs } from "../services/qr.service";
import { sendHostStatusEmail, sendMerchantStatusEmail, sendProjectSupportRequestEmail } from "../services/email.service";
import { encKey, dec, ENC } from "../utils/encrypt";

const router = Router();

const uploadDir = path.join(process.cwd(), "uploads", "supervisor-assets");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`),
  }),
});

function clientIp(req: any): string {
  return String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "");
}

// 디스크 절대경로 → /uploads/... 정적 URL 변환
function toUploadUrl(p?: string | null): string | null {
  if (!p) return null;
  const norm = String(p).replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/uploads/");
  if (idx >= 0) return norm.slice(idx);
  const rel = norm.indexOf("uploads/");
  return rel >= 0 ? `/${norm.slice(rel)}` : norm;
}

router.post("/login", async (req, res) => {
  const { username, password } = req.body as Record<string, string>;

  if (username !== (process.env.SUPERVISOR_USERNAME ?? "supervisor") || password !== (process.env.SUPERVISOR_PASSWORD ?? "change_me")) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  const ip = clientIp(req);

  // 직전 supervisor 접속 이력(IP/로그아웃 시간)을 조회해 로그인 안내에 사용
  const [prevRows] = await pool.execute(
    "SELECT login_ip, login_at, logout_at FROM login_histories WHERE user_type = 'supervisor' AND user_id = ? ORDER BY id DESC LIMIT 1",
    [username],
  );
  const prev = (Array.isArray(prevRows) && prevRows.length > 0) ? (prevRows as any)[0] : null;

  req.session.supervisor = { username };
  req.session.lastActivity = Date.now();

  await pool.execute(
    "INSERT INTO login_histories (user_type, user_id, login_ip, session_id) VALUES ('supervisor', ?, ?, ?)",
    [username, ip, req.sessionID],
  );

  res.json({
    ok: true,
    username,
    prevIp: prev?.login_ip ?? null,
    prevLoginAt: prev?.login_at ?? null,
    prevLogoutAt: prev?.logout_at ?? null,
  });
});

router.post("/logout", requireSupervisor, async (req, res) => {
  await pool.execute("UPDATE login_histories SET logout_at = NOW() WHERE session_id = ? AND logout_at IS NULL", [req.sessionID]);
  req.session.destroy(() => {});
  res.json({ ok: true });
});

router.get("/me", requireSupervisor, (req, res) => {
  res.json({ ok: true, user: req.session.supervisor });
});

const HOST_SORT_COLS: Record<string, string> = {
  id: "h.id",
  organization_name: "h.organization_name",
  biz_no: "h.biz_no",
  status: "h.status",
  created_at: "h.created_at",
};

function buildHostWhere(q: Record<string, string>, k: string) {
  const { host_name = "", organization_name = "", biz_no = "", status = "", from = "", to = "" } = q;
  let where = "WHERE 1=1";
  const params: Array<string | number> = [];
  if (host_name) { where += " AND fn_decrypt(h.host_name, ?) LIKE ?"; params.push(k, `%${host_name}%`); }
  if (organization_name) { where += " AND h.organization_name LIKE ?"; params.push(`%${organization_name}%`); }
  if (biz_no) { where += " AND h.biz_no LIKE ?"; params.push(`%${biz_no.replace(/-/g, "")}%`); }
  if (status) { where += " AND h.status = ?"; params.push(status); }
  if (from) { where += " AND DATE(h.created_at) >= ?"; params.push(from); }
  if (to) { where += " AND DATE(h.created_at) <= ?"; params.push(to); }
  return { where, params };
}

router.get("/hosts", requireSupervisor, async (req, res) => {
  const q = req.query as Record<string, string>;
  const { sort_by = "created_at", sort_dir = "desc", page = "1", size = "10" } = q;
  const pageNo = Math.max(1, Number(page));
  const pageSize = [10, 25, 50, 100].includes(Number(size)) ? Number(size) : 10;
  const offset = (pageNo - 1) * pageSize;
  const k = encKey();
  const orderCol = HOST_SORT_COLS[sort_by] ?? "h.created_at";
  const orderDir = sort_dir === "asc" ? "ASC" : "DESC";

  const { where, params } = buildHostWhere(q, k);

  const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM hosts h ${where}`, params);
  const total = Number((countRows as any)[0].total);

  const [rows] = await pool.execute(
    `SELECT h.id,
            ${dec("h.host_name")}, ${dec("h.host_email")},
            ${dec("h.mobile_phone")}, ${dec("h.phone")},
            h.organization_name, h.biz_no, h.biz_cert_path, h.biz_cert_name,
            h.status, h.status_reason,
            h.address_zip, h.address1, h.address2,
            h.project_pin_fail_count, h.project_locked,
            h.created_at, h.updated_at,
            (SELECT COUNT(*) FROM projects p WHERE p.host_id = h.id) AS project_count
     FROM hosts h ${where}
     ORDER BY ${orderCol} ${orderDir}
     LIMIT ? OFFSET ?`,
    [k, k, k, k, ...params, pageSize, offset],
  );

  res.json({ ok: true, data: rows, total, page: pageNo, size: pageSize });
});

router.get("/hosts/export", requireSupervisor, async (req, res) => {
  const q = req.query as Record<string, string>;
  const { sort_by = "created_at", sort_dir = "desc" } = q;
  const k = encKey();
  const orderCol = HOST_SORT_COLS[sort_by] ?? "h.created_at";
  const orderDir = sort_dir === "asc" ? "ASC" : "DESC";
  const { where, params } = buildHostWhere(q, k);

  const [rows] = await pool.execute(
    `SELECT h.id,
            ${dec("h.host_name")}, ${dec("h.host_email")},
            ${dec("h.mobile_phone")}, ${dec("h.phone")},
            h.organization_name, h.biz_no, h.status, h.status_reason,
            h.address_zip, h.address1, h.address2, h.created_at
     FROM hosts h ${where}
     ORDER BY ${orderCol} ${orderDir}`,
    [k, k, k, k, ...params],
  );

  const STATUS_KO: Record<string, string> = {
    pending: "승인대기", approved: "승인", cancelled: "취소", terminated: "종료", locked: "잠김",
  };

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Host 목록");
  ws.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "담당자명", key: "host_name", width: 16 },
    { header: "소속기관", key: "organization_name", width: 22 },
    { header: "사업자번호", key: "biz_no", width: 16 },
    { header: "이메일", key: "host_email", width: 28 },
    { header: "모바일폰", key: "mobile_phone", width: 15 },
    { header: "연락처", key: "phone", width: 15 },
    { header: "주소", key: "address", width: 40 },
    { header: "상태", key: "status", width: 10 },
    { header: "처리사유", key: "status_reason", width: 24 },
    { header: "가입일", key: "created_at", width: 20 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

  for (const h of rows as any[]) {
    const bizFmt = h.biz_no ? String(h.biz_no).replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3") : "";
    const addr = [h.address_zip ? `[${h.address_zip}]` : "", h.address1, h.address2].filter(Boolean).join(" ");
    ws.addRow({
      id: h.id,
      host_name: h.host_name,
      organization_name: h.organization_name ?? "",
      biz_no: bizFmt,
      host_email: h.host_email,
      mobile_phone: h.mobile_phone ?? "",
      phone: h.phone ?? "",
      address: addr,
      status: STATUS_KO[h.status] ?? h.status,
      status_reason: h.status_reason ?? "",
      created_at: h.created_at ? new Date(h.created_at).toLocaleString("ko-KR") : "",
    });
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''hosts_${Date.now()}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
});

router.get("/hosts/:id/biz-cert", requireSupervisor, async (req, res) => {
  const hostId = Number(req.params.id);
  const mode = req.query.mode; // 'view' = inline, otherwise download
  const [rows] = await pool.execute("SELECT biz_cert_path, biz_cert_name FROM hosts WHERE id = ?", [hostId]);
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(404).json({ error: "host_not_found" });
    return;
  }
  const host = (rows as any)[0];
  if (!host.biz_cert_path) {
    res.status(404).json({ error: "파일이 없습니다." });
    return;
  }
  if (mode === "view") {
    res.sendFile(String(host.biz_cert_path));
  } else {
    res.download(String(host.biz_cert_path), String(host.biz_cert_name ?? "biz_cert"));
  }
});

router.put("/hosts/:id/status", requireSupervisor, async (req, res) => {
  const hostId = Number(req.params.id);
  const { status, reason = "" } = req.body as Record<string, string>;

  if (!["pending", "approved", "cancelled", "terminated", "locked"].includes(status)) {
    res.status(400).json({ error: "invalid_status" });
    return;
  }

  const k = encKey();
  const [hostRows] = await pool.execute(
    `SELECT ${dec("host_name")}, ${dec("host_email")} FROM hosts WHERE id = ?`,
    [k, k, hostId],
  );
  if (!Array.isArray(hostRows) || hostRows.length === 0) {
    res.status(404).json({ error: "host_not_found" });
    return;
  }
  const host = (hostRows as any)[0];

  await pool.execute(
    "UPDATE hosts SET status = ?, status_reason = ?, updated_at = NOW() WHERE id = ?",
    [status, reason || null, hostId],
  );

  if (["approved", "cancelled", "terminated"].includes(status)) {
    try {
      await sendHostStatusEmail(String(host.host_email), String(host.host_name), status, reason, hostId);
    } catch (_) {}
  }

  res.json({ ok: true });
});

// 가맹점 지원 대상 프로젝트(시작대기/진행중) 목록
router.get("/support-projects", requireSupervisor, async (_req, res) => {
  const [rows] = await pool.execute(
    `SELECT p.id, p.project_name, p.project_serial, p.status, p.from_date, p.to_date,
            h.organization_name
     FROM projects p INNER JOIN hosts h ON h.id = p.host_id
     WHERE p.status IN ('ready_to_start', 'started')
     ORDER BY p.from_date ASC, p.id DESC`,
  );
  res.json({ ok: true, data: rows });
});

// 가맹점 프로젝트 지원 요청 → 해당 프로젝트 담당자(host)에게 메일
router.post("/projects/:id/support-request", requireSupervisor, async (req, res) => {
  const id = Number(req.params.id);
  const k = encKey();
  const [rows] = await pool.execute(
    `SELECT p.project_name, p.project_serial, ${dec("h.host_name")}, ${dec("h.host_email")}
     FROM projects p INNER JOIN hosts h ON h.id = p.host_id WHERE p.id = ?`,
    [k, k, id],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const p = (rows as any)[0];
  try {
    await sendProjectSupportRequestEmail(String(p.host_email), String(p.host_name), String(p.project_name), String(p.project_serial));
  } catch (e) {
    res.status(500).json({ error: "메일 발송에 실패했습니다." });
    return;
  }
  res.json({ ok: true });
});

// ───────────────────────── 가맹점(merchant) 관리 ─────────────────────────
const MERCHANT_SORT_COLS: Record<string, string> = {
  id: "m.id",
  biz_no: "m.biz_no",
  bank_name: "m.bank_name",
  status: "m.status",
  created_at: "m.created_at",
};

function buildMerchantWhere(q: Record<string, string>, k: string) {
  const { merchant_name = "", biz_no = "", status = "" } = q;
  let where = "WHERE 1=1";
  const params: Array<string | number> = [];
  if (merchant_name) { where += " AND fn_decrypt(m.merchant_name, ?) LIKE ?"; params.push(k, `%${merchant_name}%`); }
  if (biz_no) { where += " AND m.biz_no LIKE ?"; params.push(`%${biz_no.replace(/-/g, "")}%`); }
  if (status) { where += " AND m.status = ?"; params.push(status); }
  return { where, params };
}

router.get("/merchants", requireSupervisor, async (req, res) => {
  const q = req.query as Record<string, string>;
  const { sort_by = "created_at", sort_dir = "desc", page = "1", size = "10" } = q;
  const pageNo = Math.max(1, Number(page));
  const pageSize = [10, 25, 50, 100].includes(Number(size)) ? Number(size) : 10;
  const offset = (pageNo - 1) * pageSize;
  const k = encKey();
  const orderCol = MERCHANT_SORT_COLS[sort_by] ?? "m.created_at";
  const orderDir = sort_dir === "asc" ? "ASC" : "DESC";
  const { where, params } = buildMerchantWhere(q, k);

  const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM merchants m ${where}`, params);
  const total = Number((countRows as any)[0].total);

  const [rows] = await pool.execute(
    `SELECT m.id, ${dec("m.merchant_name")}, ${dec("m.email")}, ${dec("m.bank_account")},
            m.biz_no, m.biz_cert_path, m.biz_cert_name, m.bank_name, m.bank_copy_path, m.bank_copy_name,
            m.status, m.status_reason, m.created_at, m.updated_at
     FROM merchants m ${where}
     ORDER BY ${orderCol} ${orderDir}
     LIMIT ? OFFSET ?`,
    [k, k, k, ...params, pageSize, offset],
  );

  res.json({ ok: true, data: rows, total, page: pageNo, size: pageSize });
});

router.get("/merchants/:id/biz-cert", requireSupervisor, async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.execute("SELECT biz_cert_path, biz_cert_name FROM merchants WHERE id = ?", [id]);
  const m = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!m || !m.biz_cert_path) { res.status(404).json({ error: "파일이 없습니다." }); return; }
  if (req.query.mode === "view") res.sendFile(String(m.biz_cert_path));
  else res.download(String(m.biz_cert_path), String(m.biz_cert_name ?? "biz_cert"));
});

router.get("/merchants/:id/bank-copy", requireSupervisor, async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.execute("SELECT bank_copy_path, bank_copy_name FROM merchants WHERE id = ?", [id]);
  const m = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!m || !m.bank_copy_path) { res.status(404).json({ error: "파일이 없습니다." }); return; }
  if (req.query.mode === "view") res.sendFile(String(m.bank_copy_path));
  else res.download(String(m.bank_copy_path), String(m.bank_copy_name ?? "bank_copy"));
});

router.put("/merchants/:id/status", requireSupervisor, async (req, res) => {
  const id = Number(req.params.id);
  const { status, reason = "" } = req.body as Record<string, string>;
  if (!["pending", "approved", "cancelled", "terminated", "locked"].includes(status)) {
    res.status(400).json({ error: "invalid_status" });
    return;
  }
  const k = encKey();
  const [mRows] = await pool.execute(
    `SELECT ${dec("merchant_name")}, ${dec("email")} FROM merchants WHERE id = ?`,
    [k, k, id],
  );
  if (!Array.isArray(mRows) || mRows.length === 0) {
    res.status(404).json({ error: "merchant_not_found" });
    return;
  }
  const m = (mRows as any)[0];

  await pool.execute(
    "UPDATE merchants SET status = ?, status_reason = ?, updated_at = NOW() WHERE id = ?",
    [status, reason || null, id],
  );

  if (["approved", "cancelled", "terminated"].includes(status)) {
    try { await sendMerchantStatusEmail(String(m.email), String(m.merchant_name), status, reason); } catch (_) {}
  }

  res.json({ ok: true });
});

const PROJ_SORT_COLS: Record<string, string> = {
  id: "p.id",
  project_name: "p.project_name",
  project_serial: "p.project_serial",
  from_date: "p.from_date",
  to_date: "p.to_date",
  status: "p.status",
  quote_sent_at: "p.quote_sent_at",
  quote_read: "p.quote_read",
  deposit_confirmed_at: "p.deposit_confirmed_at",
  created_at: "p.created_at",
  organization_name: "h.organization_name",
};

function buildProjWhere(q: Record<string, string>, k: string) {
  const { organization_name = "", project_name = "", project_serial = "", status = "",
          quote_read = "", deposit = "", from_date = "", to_date = "" } = q;
  let where = "WHERE 1=1";
  const params: Array<string | number> = [];
  if (organization_name) { where += " AND h.organization_name LIKE ?"; params.push(`%${organization_name}%`); }
  if (project_name) { where += " AND p.project_name LIKE ?"; params.push(`%${project_name}%`); }
  if (project_serial) { where += " AND p.project_serial LIKE ?"; params.push(`%${project_serial}%`); }
  if (status) { where += " AND p.status = ?"; params.push(status); }
  if (quote_read === "1") { where += " AND p.quote_read = 1"; }
  else if (quote_read === "0") { where += " AND p.quote_read = 0"; }
  if (deposit === "1") { where += " AND p.deposit_confirmed_at IS NOT NULL"; }
  else if (deposit === "0") { where += " AND p.deposit_confirmed_at IS NULL"; }
  if (from_date) { where += " AND p.from_date >= ?"; params.push(from_date); }
  if (to_date) { where += " AND p.to_date <= ?"; params.push(to_date); }
  return { where, params };
}

router.get("/projects", requireSupervisor, async (req, res) => {
  const q = req.query as Record<string, string>;
  const { sort_by = "created_at", sort_dir = "desc", page = "1", size = "20" } = q;
  const pageNo = Math.max(1, Number(page));
  const pageSize = [10, 20, 25, 50, 100].includes(Number(size)) ? Number(size) : 20;
  const offset = (pageNo - 1) * pageSize;
  const k = encKey();
  const orderCol = PROJ_SORT_COLS[sort_by] ?? "p.created_at";
  const orderDir = sort_dir === "asc" ? "ASC" : "DESC";

  const { where, params } = buildProjWhere(q, k);

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM projects p INNER JOIN hosts h ON h.id = p.host_id ${where}`,
    params,
  );
  const total = Number((countRows as any)[0].total);

  const [rows] = await pool.execute(
    `SELECT p.id, p.project_name, p.project_serial, p.description,
            p.from_date, p.to_date, p.gift_amount, p.gift_qty, p.budget_amount,
            p.status, p.quote_days, p.quote_amount, p.quote_sent_at,
            p.quote_read, p.quote_read_at,
            p.deposit_confirmed_at, p.approved_at, p.started_at, p.created_at, p.updated_at,
            p.supervisor_mobile_image_path, p.supervisor_favicon_path,
            ${dec("h.host_name")}, ${dec("h.host_email")},
            h.id AS host_id, h.organization_name,
            (SELECT COUNT(*) FROM project_locations pl WHERE pl.project_id = p.id AND pl.disabled = 0) AS location_count,
            (SELECT COUNT(*) FROM visitors v WHERE v.project_id = p.id) AS visitor_count
     FROM projects p
     INNER JOIN hosts h ON h.id = p.host_id
     ${where}
     ORDER BY ${orderCol} ${orderDir}
     LIMIT ? OFFSET ?`,
    [k, k, ...params, pageSize, offset],
  );

  res.json({ ok: true, data: rows, total, page: pageNo, size: pageSize });
});

// 방문현황 집계용 정렬 화이트리스트 (별칭/표현식)
const VS_SORT: Record<string, string> = {
  organization_name: "h.organization_name",
  project_name: "p.project_name",
  status: "p.status",
  gift_amount: "p.gift_amount",
  gift_qty: "p.gift_qty",
  budget_amount: "p.budget_amount",
  issued_gifts: "issued_gifts",
  used_gifts: "used_gifts",
  used_gift_amount: "used_gift_amount",
  grant_gift_amount: "grant_gift_amount",
  gift_spent: "gift_spent",
  active_locations: "active_locations",
  visitor_count: "visitor_count",
  gift_recipients: "issued_gifts",
  budget_consumption_rate: "(SELECT COALESCE(SUM(gr.amount),0) FROM gift_redemptions gr WHERE gr.project_id = p.id) / NULLIF(p.budget_amount,0)",
  gift_receipt_rate: "(SELECT COUNT(*) FROM gifts gf WHERE gf.project_id = p.id) / NULLIF((SELECT COUNT(DISTINCT vv.visitor_id) FROM visitor_visits vv JOIN project_locations plv ON plv.id = vv.location_id AND plv.disabled = 0 WHERE vv.project_id = p.id),0)",
};

router.get("/visit-status", requireSupervisor, async (req, res) => {
  const q = req.query as Record<string, string>;
  const { sort_by = "", sort_dir = "desc", page = "1", size = "10" } = q;
  const pageNo = Math.max(1, Number(page));
  const pageSize = [10, 25, 50, 100].includes(Number(size)) ? Number(size) : 10;
  const offset = (pageNo - 1) * pageSize;
  const k = encKey();
  const orderCol = VS_SORT[sort_by] ?? "p.created_at";
  const orderDir = sort_dir === "asc" ? "ASC" : "DESC";
  const { where, params } = buildProjWhere(q, k);

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM projects p INNER JOIN hosts h ON h.id = p.host_id ${where}`,
    params,
  );
  const total = Number((countRows as any)[0].total);

  const [rows] = await pool.execute(
    `SELECT p.id, p.project_name, p.project_serial, p.status, p.gift_amount, p.gift_qty, p.budget_amount,
            h.organization_name,
            (SELECT COUNT(*) FROM project_locations pl WHERE pl.project_id = p.id AND pl.disabled = 0) AS active_locations,
            (SELECT COUNT(DISTINCT vv.visitor_id) FROM visitor_visits vv JOIN project_locations plv ON plv.id = vv.location_id AND plv.disabled = 0 WHERE vv.project_id = p.id) AS visitor_count,
            (SELECT COUNT(*) FROM gifts gf WHERE gf.project_id = p.id) AS issued_gifts,
            (SELECT COUNT(*) FROM gifts gf WHERE gf.project_id = p.id AND gf.status = 'used') AS used_gifts,
            (SELECT COALESCE(SUM(gf.amount),0) FROM gifts gf WHERE gf.project_id = p.id AND gf.status = 'used') AS used_gift_amount,
            (SELECT COALESCE(SUM(gr.amount),0) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'grant') AS grant_gift_amount,
            (SELECT COALESCE(SUM(gr.amount),0) FROM gift_redemptions gr WHERE gr.project_id = p.id) AS gift_spent
     FROM projects p INNER JOIN hosts h ON h.id = p.host_id
     ${where}
     ORDER BY ${orderCol} ${orderDir}
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  const data = (Array.isArray(rows) ? rows : []).map((r: any) => {
    const budget = Number(r.budget_amount) || 0;
    const spent = Number(r.gift_spent) || 0;
    const visitors = Number(r.visitor_count) || 0;
    const recipients = Number(r.issued_gifts) || 0;
    return {
      organization_name: r.organization_name,
      project_name: r.project_name,
      project_serial: r.project_serial,
      status: r.status,
      gift_amount: Number(r.gift_amount) || 0,
      gift_qty: Number(r.gift_qty) || 0,
      budget_amount: budget,
      issued_gifts: Number(r.issued_gifts) || 0,
      used_gifts: Number(r.used_gifts) || 0,
      used_gift_amount: Number(r.used_gift_amount) || 0,
      grant_gift_amount: Number(r.grant_gift_amount) || 0,
      gift_spent: spent,
      budget_consumption_rate: budget > 0 ? Math.round((spent / budget) * 10000) / 100 : 0,
      active_locations: Number(r.active_locations) || 0,
      visitor_count: visitors,
      gift_recipients: recipients,
      gift_receipt_rate: visitors > 0 ? Math.round((recipients / visitors) * 10000) / 100 : 0,
    };
  });

  res.json({ ok: true, data, total, page: pageNo, size: pageSize });
});

router.get("/projects/:id", requireSupervisor, async (req, res) => {
  const projectId = Number(req.params.id);
  const k = encKey();
  const [rows] = await pool.execute(
    `SELECT p.*,
            ${dec("h.host_name")}, ${dec("h.host_email")},
            ${dec("h.mobile_phone")},
            h.id AS host_id, h.organization_name,
            (SELECT COUNT(*) FROM project_locations pl WHERE pl.project_id = p.id AND pl.disabled = 0) AS location_count,
            (SELECT COUNT(*) FROM visitors v WHERE v.project_id = p.id) AS visitor_count
     FROM projects p
     INNER JOIN hosts h ON h.id = p.host_id
     WHERE p.id = ?`,
    [k, k, k, projectId],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const row = (rows as any)[0];
  row.mobile_image_url = toUploadUrl(row.supervisor_mobile_image_path);
  row.favicon_url = toUploadUrl(row.supervisor_favicon_path);
  res.json({ ok: true, data: row });
});

// 프로젝트의 목적지 목록 (supervisor 전용)
router.get("/projects/:id/locations", requireSupervisor, async (req, res) => {
  const projectId = Number(req.params.id);
  const [rows] = await pool.execute(
    `SELECT pl.display_seq, pl.location_seq, pl.dest_type, pl.location_name, pl.location_desc,
            pl.kakao_lat, pl.kakao_lng, pl.image_path, pl.disabled
     FROM project_locations pl
     WHERE pl.project_id = ?
     ORDER BY pl.disabled ASC, pl.display_seq ASC`,
    [projectId],
  );
  const data = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    display_seq: r.display_seq,
    dest_type: r.dest_type,
    location_name: r.location_name,
    location_desc: r.location_desc,
    kakao_lat: r.kakao_lat,
    kakao_lng: r.kakao_lng,
    image_url: toUploadUrl(r.image_path),
    disabled: Number(r.disabled) === 1,
  }));
  res.json({ ok: true, data });
});

const VALID_PROJECT_STATUSES = ["quoted", "deposit_wait", "deposit_confirmed", "ready_to_start", "started", "completed", "cancelled"];

router.put("/projects/:id/fields", requireSupervisor, async (req, res) => {
  const projectId = Number(req.params.id);
  const { quote_read, deposit_confirmed, status } = req.body as Record<string, any>;

  const [rows] = await pool.execute("SELECT * FROM projects WHERE id = ?", [projectId]);
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const proj = (rows as any)[0];

  const setClauses: string[] = [];
  const params: Array<string | number> = [];

  if (quote_read !== undefined) {
    const val = quote_read ? 1 : 0;
    setClauses.push("quote_read = ?");
    params.push(val);
    if (val === 1 && !proj.quote_read) {
      setClauses.push("quote_read_at = NOW()");
      if (proj.status === "quoted") {
        setClauses.push("status = 'deposit_wait'");
      }
    } else if (val === 0) {
      setClauses.push("quote_read_at = NULL");
      if (proj.status === "deposit_wait") {
        setClauses.push("status = 'quoted'");
      }
    }
  }

  if (deposit_confirmed !== undefined) {
    const effectiveQuoteRead = quote_read !== undefined ? !!quote_read : !!proj.quote_read;
    if (deposit_confirmed && !effectiveQuoteRead) {
      res.status(400).json({ error: "견적 확인이 완료되어야 입금 확인이 가능합니다." });
      return;
    }
    if (deposit_confirmed) {
      setClauses.push("deposit_confirmed_at = COALESCE(deposit_confirmed_at, NOW())");
      // 입금확인 시점에 시작일 기준으로 진행중/시작대기를 자동 결정
      if (!["completed", "cancelled", "started"].includes(proj.status)) {
        setClauses.push("status = CASE WHEN from_date <= CURDATE() THEN 'started' ELSE 'ready_to_start' END");
        setClauses.push("started_at = CASE WHEN from_date <= CURDATE() THEN COALESCE(started_at, NOW()) ELSE started_at END");
      }
    } else {
      setClauses.push("deposit_confirmed_at = NULL");
      // 입금확인 해제 시 진행 상태를 견적 단계로 되돌림
      if (["deposit_confirmed", "ready_to_start", "started"].includes(proj.status)) {
        setClauses.push("status = 'quoted'");
        setClauses.push("started_at = NULL");
      }
    }
  }

  if (status !== undefined && VALID_PROJECT_STATUSES.includes(status) && status !== proj.status) {
    if (deposit_confirmed === undefined || deposit_confirmed === true) {
      const alreadySet = setClauses.some(c => c.startsWith("status ="));
      if (!alreadySet) {
        setClauses.push("status = ?");
        params.push(status);
      }
    }
  }

  if (setClauses.length === 0) {
    res.json({ ok: true });
    return;
  }

  setClauses.push("updated_at = NOW()");
  await pool.execute(`UPDATE projects SET ${setClauses.join(", ")} WHERE id = ?`, [...params, projectId]);

  // 입금확인 처리 시 목적지별 QR 코드를 자동 생성 (멱등, 실패해도 요청은 성공)
  if (deposit_confirmed === true) {
    try {
      await generateProjectQrs(projectId, String(proj.project_serial));
    } catch (e) {
      console.error("generateProjectQrs (fields/deposit_confirmed) failed:", e);
    }
  }

  res.json({ ok: true });
});

router.put("/projects/:id/deposit-confirm", requireSupervisor, async (req, res) => {
  const projectId = Number(req.params.id);
  const [rows] = await pool.execute("SELECT quote_read FROM projects WHERE id = ?", [projectId]);
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  if (!Number((rows as any)[0].quote_read)) {
    res.status(400).json({ error: "견적 확인이 완료되어야 입금 확인이 가능합니다." });
    return;
  }
  await pool.execute(
    "UPDATE projects SET status = 'deposit_confirmed', deposit_confirmed_at = NOW(), updated_at = NOW() WHERE id = ?",
    [projectId],
  );
  // generate QR codes for each active location when deposit is confirmed
  try {
    const [projRows] = await pool.execute("SELECT project_serial FROM projects WHERE id = ?", [projectId]);
    if (Array.isArray(projRows) && projRows.length > 0) {
      const projectSerial = String((projRows as any)[0].project_serial);
      await generateProjectQrs(projectId, projectSerial);
    }
  } catch (e) {
    // log but don't fail the request
    console.error('generateProjectQrs failed:', e);
  }

  res.json({ ok: true });
});

router.post(
  "/projects/:id/assets",
  requireSupervisor,
  upload.fields([
    { name: "mobile_image", maxCount: 1 },
    { name: "favicon_image", maxCount: 1 },
  ]),
  async (req, res) => {
    const projectId = Number(req.params.id);
    const files = req.files as { [field: string]: Express.Multer.File[] };
    const mobile = files?.mobile_image?.[0];
    const favicon = files?.favicon_image?.[0];

    if (!mobile && !favicon) {
      res.status(400).json({ error: "업로드할 이미지를 선택해 주세요." });
      return;
    }

    // 제공된 이미지만 부분 업데이트 (랜딩페이지/아이콘 개별 업로드 가능)
    const sets: string[] = [];
    const params: Array<string> = [];
    if (mobile) { sets.push("supervisor_mobile_image_path = ?"); params.push(mobile.path); }
    if (favicon) { sets.push("supervisor_favicon_path = ?"); params.push(favicon.path); }
    sets.push("updated_at = NOW()");
    await pool.execute(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`, [...params, String(projectId)]);

    res.json({
      ok: true,
      mobile_image_url: mobile ? toUploadUrl(mobile.path) : undefined,
      favicon_url: favicon ? toUploadUrl(favicon.path) : undefined,
    });
  },
);

router.post("/projects/:id/start", requireSupervisor, async (req, res) => {
  const projectId = Number(req.params.id);

  const [rows] = await pool.execute(
    `SELECT id, project_serial, status, deposit_confirmed_at, supervisor_mobile_image_path, supervisor_favicon_path
     FROM projects
     WHERE id = ?`,
    [projectId],
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }

  const project = (rows as any)[0];

  if (!project.deposit_confirmed_at) {
    res.status(400).json({ error: "입금확인 완료 상태가 아닙니다." });
    return;
  }
  if (!project.supervisor_mobile_image_path || !project.supervisor_favicon_path) {
    res.status(400).json({ error: "모바일 이미지와 파비콘 업로드가 필요합니다." });
    return;
  }

  await generateProjectQrs(projectId, String(project.project_serial));

  await pool.execute(
    "UPDATE projects SET status = 'started', started_at = NOW(), approved_at = NOW(), updated_at = NOW() WHERE id = ?",
    [projectId],
  );

  res.json({ ok: true });
});

router.get("/projects/:id/qr-zip", requireSupervisor, async (req, res) => {
  const projectId = Number(req.params.id);
  const [rows] = await pool.execute("SELECT project_serial, status FROM projects WHERE id = ?", [projectId]);
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const project = (rows as any)[0];

  if (project.status !== "started") {
    res.status(400).json({ error: "프로젝트 개시 이후 다운로드 가능합니다." });
    return;
  }

  const zipPath = await createQrZip(projectId);
  res.download(zipPath, `${project.project_serial}_qr.zip`);
});

// ── 정산: 소속기관·프로젝트별 Gift 사용/증정 집계 (전체 기관 대상) ──
router.get("/settlement", requireSupervisor, async (req, res) => {
  const { organization_name = "", project_name = "", status = "" } = req.query as Record<string, string>;

  let where = "WHERE p.status IN ('ready_to_start','started','completed')";
  const params: Array<string | number> = [];
  if (organization_name.trim()) { where += " AND h.organization_name LIKE ?"; params.push(`%${organization_name.trim()}%`); }
  if (project_name.trim()) { where += " AND p.project_name LIKE ?"; params.push(`%${project_name.trim()}%`); }
  if (["ready_to_start", "started", "completed"].includes(status)) { where += " AND p.status = ?"; params.push(status); }

  const [rows] = await pool.execute(
    `SELECT p.id, p.project_name, p.project_serial, p.status, p.gift_amount,
            h.organization_name,
            (SELECT COUNT(*) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'normal') AS used_count,
            (SELECT COALESCE(SUM(gr.amount),0) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'normal') AS used_amount,
            (SELECT COUNT(*) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'grant') AS grant_count,
            (SELECT COALESCE(SUM(gr.amount),0) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'grant') AS grant_amount,
            (SELECT COUNT(DISTINCT gr.visitor_id) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'normal') AS used_users,
            (SELECT COUNT(DISTINCT gr.visitor_id) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'grant') AS grant_users
     FROM projects p
     INNER JOIN hosts h ON h.id = p.host_id
     ${where}
     ORDER BY h.organization_name ASC, FIELD(p.status, 'started', 'ready_to_start', 'completed'), p.from_date DESC, p.id DESC`,
    params,
  );

  res.json({ ok: true, data: Array.isArray(rows) ? rows : [] });
});

// ── 정산: 특정 프로젝트의 Gift 사용/증정 상세내역 (전체 권한) ──
router.get("/settlement/:projectId/usage", requireSupervisor, async (req, res) => {
  const projectId = Number(req.params.projectId);

  const [visRows] = await pool.execute(
    `SELECT p.id, p.project_name, p.project_serial, h.organization_name
     FROM projects p INNER JOIN hosts h ON h.id = p.host_id
     WHERE p.id = ?`,
    [projectId],
  );
  const project = (Array.isArray(visRows) ? visRows[0] : null) as any;
  if (!project) { res.status(404).json({ error: "project_not_found" }); return; }

  const [rows] = await pool.execute(
    `SELECT v.phone, gr.redemption_type, gr.amount, gr.redeemed_at
     FROM gift_redemptions gr
     JOIN visitors v ON v.id = gr.visitor_id
     WHERE gr.project_id = ?
     ORDER BY gr.redeemed_at DESC, gr.id DESC`,
    [projectId],
  );

  res.json({
    ok: true,
    organization_name: project.organization_name,
    project_name: project.project_name,
    project_serial: project.project_serial,
    data: Array.isArray(rows) ? rows : [],
  });
});

export default router;
