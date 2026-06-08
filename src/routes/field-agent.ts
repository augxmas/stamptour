// ============================================================
//  현장요원관리 (Field Agent) — 공개 등록 + 근태 + Admin 조회
// ============================================================
import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import multer from "multer";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import pool from "../config/database";
import { publicBaseUrl } from "../services/qr.service";
import { sendEmail } from "../services/email.service";
import { requireHost } from "../middleware/auth";

const router = Router();

const AGENT_UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "field-agents");
const QR_UPLOAD_DIR    = path.resolve(process.cwd(), "uploads", "field-agent-qr");
[AGENT_UPLOAD_DIR, QR_UPLOAD_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AGENT_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const id = crypto.randomBytes(12).toString("hex");
      const ext = (path.extname(file.originalname) || ".png").toLowerCase();
      cb(null, `${Date.now()}_${id}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("invalid_file_type"));
  },
});

function toUploadUrl(p?: string | null): string | null {
  if (!p) return null;
  const base = path.resolve(process.cwd(), "uploads");
  const rel = path.relative(base, p).replace(/\\/g, "/");
  return `/uploads/${rel}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// =====================================================================
// (공개) 현장요원 등록 폼이 필요한 프로젝트 정보
// =====================================================================
router.get("/projects/:serial", async (req, res) => {
  const serial = String(req.params.serial || "");
  const [rows] = await pool.execute(
    `SELECT id, project_name, project_serial, status, from_date, to_date, field_agent_use
     FROM projects WHERE project_serial = ?`, [serial],
  );
  const p = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!p) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
  if (Number(p.field_agent_use) !== 1) {
    res.status(403).json({ ok: false, error: "field_agent_disabled", message: "이 프로젝트는 현장요원관리 옵션을 사용하지 않습니다." });
    return;
  }
  res.json({
    ok: true,
    project: {
      id: p.id, name: p.project_name, serial: p.project_serial, status: p.status,
      from_date: p.from_date, to_date: p.to_date,
    },
  });
});

// =====================================================================
// (공개) 인증된 이메일로 이 프로젝트에 이미 등록된 요원이 있는지 조회
//   body: { email, code } — host_email_verify_codes 검증 통과해야만 노출
// =====================================================================
router.post("/projects/:serial/lookup", async (req, res) => {
  const serial = String(req.params.serial || "");
  const email  = String((req.body || {}).email || "").trim().toLowerCase();
  const code   = String((req.body || {}).code || "").trim();
  if (!email || !code) { res.status(400).json({ ok:false, error: "missing" }); return; }
  const [codeRows] = await pool.execute(
    `SELECT id FROM host_email_verify_codes
     WHERE email = ? AND code = ? AND used = 0 AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [email, code],
  );
  if (!Array.isArray(codeRows) || codeRows.length === 0) {
    res.status(400).json({ ok:false, error: "invalid_or_expired" }); return;
  }
  const [pr] = await pool.execute(
    `SELECT id, project_name, project_serial FROM projects WHERE project_serial = ?`, [serial],
  );
  const proj = (Array.isArray(pr) ? pr[0] : null) as any;
  if (!proj) { res.status(404).json({ ok:false, error: "project_not_found" }); return; }
  const [rows] = await pool.execute(
    `SELECT id, name, mobile, email, qr_token, qr_image_path, status, created_at
     FROM field_agents WHERE project_id = ? AND email_lower = ?`,
    [proj.id, email],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    res.json({ ok:true, found: false }); return;
  }
  const a = rows[0] as any;
  res.json({
    ok: true, found: true,
    agent: {
      id: a.id, name: a.name, mobile: a.mobile, email: a.email,
      qr_token: a.qr_token,
      qr_image_url: toUploadUrl(a.qr_image_path),
      attendance_url: `${publicBaseUrl()}/agent-att/${serial}/scan?t=${a.qr_token}`,
      status: a.status, created_at: a.created_at,
    },
    project: { name: proj.project_name, serial: proj.project_serial },
  });
});

// =====================================================================
// (공개) 현장요원 등록 — multipart 폼
//   files: id_card_image, bankbook_image (각각 1개)
//   body: name, mobile, email, address, code (인증코드),
//         terms_accepted, privacy_accepted, email_optin, push_optin
//   응답: { ok, agent_id, qr_image_url, attendance_url, project, agent }
// =====================================================================
router.post(
  "/projects/:serial/register",
  upload.fields([
    { name: "id_card_image", maxCount: 1 },
    { name: "bankbook_image", maxCount: 1 },
  ]),
  async (req, res) => {
    const serial = String(req.params.serial || "");
    const files = req.files as { [k: string]: Express.Multer.File[] | undefined };

    // 프로젝트 검증
    const [pr] = await pool.execute(
      `SELECT id, project_name, project_serial, field_agent_use FROM projects WHERE project_serial = ?`, [serial],
    );
    const proj = (Array.isArray(pr) ? pr[0] : null) as any;
    if (!proj || Number(proj.field_agent_use) !== 1) {
      cleanupFiles(files);
      res.status(404).json({ ok: false, error: "project_not_available" }); return;
    }

    const body = req.body || {};
    const name    = String(body.name || "").trim();
    const mobile  = String(body.mobile || "").trim();
    const email   = String(body.email || "").trim();
    const address = String(body.address || "").trim();
    const terms   = body.terms_accepted   === "1" || body.terms_accepted   === true ? 1 : 0;
    const privacy = body.privacy_accepted === "1" || body.privacy_accepted === true ? 1 : 0;
    const eOpt    = body.email_optin      === "1" || body.email_optin      === true ? 1 : 0;
    const pOpt    = body.push_optin       === "1" || body.push_optin       === true ? 1 : 0;

    if (!name || !mobile || !email || !address) { cleanupFiles(files); res.status(400).json({ ok:false, error: "missing_required" }); return; }
    if (!EMAIL_RE.test(email)) { cleanupFiles(files); res.status(400).json({ ok:false, error: "invalid_email" }); return; }
    if (!terms || !privacy) { cleanupFiles(files); res.status(400).json({ ok:false, error: "consent_required" }); return; }
    const idCard = files?.id_card_image?.[0];
    const bankbook = files?.bankbook_image?.[0];
    if (!idCard || !bankbook) { cleanupFiles(files); res.status(400).json({ ok:false, error: "files_required" }); return; }

    // 인증코드 검증 (host_email_verify_codes 재사용)
    const code = String(body.code || "").trim();
    if (!code) { cleanupFiles(files); res.status(400).json({ ok:false, error: "email_not_verified" }); return; }
    const emailLower = email.toLowerCase();
    const [codeRows] = await pool.execute(
      `SELECT id FROM host_email_verify_codes
       WHERE email = ? AND code = ? AND used = 0 AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [emailLower, code],
    );
    if (!Array.isArray(codeRows) || codeRows.length === 0) {
      cleanupFiles(files);
      res.status(400).json({ ok:false, error: "email_not_verified", message: "이메일 인증을 다시 진행해 주세요." });
      return;
    }
    await pool.execute(`UPDATE host_email_verify_codes SET used = 1 WHERE id = ?`, [(codeRows as any)[0].id]);

    // 동일 프로젝트 + 동일 이메일 중복 차단
    const [dup] = await pool.execute(
      `SELECT id FROM field_agents WHERE project_id = ? AND email_lower = ?`, [proj.id, emailLower],
    );
    if (Array.isArray(dup) && dup.length > 0) {
      cleanupFiles(files);
      res.status(409).json({ ok:false, error: "already_registered", message: "이 프로젝트에 이미 등록된 이메일입니다." });
      return;
    }
    // 동일 프로젝트 + 동일 모바일 번호 중복 차단 (디지트만 비교)
    const mobileDigits = mobile.replace(/\D/g, "");
    if (mobileDigits.length >= 9) {
      const [dupMob] = await pool.execute(
        `SELECT id FROM field_agents
         WHERE project_id = ?
           AND REPLACE(REPLACE(REPLACE(mobile,'-',''),' ',''),'.','') = ?`,
        [proj.id, mobileDigits],
      );
      if (Array.isArray(dupMob) && dupMob.length > 0) {
        cleanupFiles(files);
        res.status(409).json({ ok:false, error: "mobile_duplicate", message: "이 프로젝트에 이미 등록된 모바일 번호입니다." });
        return;
      }
    }

    const qrToken = crypto.randomBytes(20).toString("hex");
    const attUrl  = `${publicBaseUrl()}/agent-att/${serial}/scan?t=${qrToken}`;

    // QR PNG 저장
    const qrFile = path.join(QR_UPLOAD_DIR, `${qrToken}.png`);
    try { await QRCode.toFile(qrFile, attUrl, { width: 540, margin: 2 }); }
    catch (e) { cleanupFiles(files); res.status(500).json({ ok:false, error: "qr_failed" }); return; }

    const [ins] = await pool.execute(
      `INSERT INTO field_agents
       (project_id, name, mobile, email, email_lower, address,
        id_card_image_path, bankbook_image_path,
        terms_accepted, privacy_accepted, email_optin, push_optin,
        qr_token, qr_image_path, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [proj.id, name, mobile, email, emailLower, address,
       idCard.path, bankbook.path,
       terms, privacy, eOpt, pOpt,
       qrToken, qrFile],
    );
    const agentId = Number((ins as any).insertId);

    res.json({
      ok: true,
      agent_id: agentId,
      qr_token: qrToken,
      qr_image_url: toUploadUrl(qrFile),
      attendance_url: attUrl,
      project: { name: proj.project_name, serial: proj.project_serial },
      agent: { name, mobile, email },
    });
  },
);

function cleanupFiles(files: { [k: string]: Express.Multer.File[] | undefined } | undefined) {
  if (!files) return;
  Object.values(files).forEach(arr => arr?.forEach(f => { try { fs.unlinkSync(f.path); } catch {/* */} }));
}

// =====================================================================
// (공개 · 근태 PWA) 관리자 PIN 로그인 — 프로젝트 6자리 PIN 검증
//   body: { pin }
//   응답: { ok, project: { name, serial } } + 세션 쿠키
// =====================================================================
router.post("/projects/:serial/att/login", async (req, res) => {
  const serial = String(req.params.serial || "");
  const pin = String((req.body || {}).pin || "").trim();
  if (!/^\d{6}$/.test(pin)) { res.status(400).json({ ok:false, error: "invalid_pin" }); return; }
  const [pr] = await pool.execute(
    `SELECT id, project_name, project_serial, pin_hash, field_agent_use FROM projects WHERE project_serial = ?`, [serial],
  );
  const proj = (Array.isArray(pr) ? pr[0] : null) as any;
  if (!proj || Number(proj.field_agent_use) !== 1) { res.status(404).json({ ok:false, error: "project_not_available" }); return; }
  const ok = await bcrypt.compare(pin, String(proj.pin_hash || ""));
  if (!ok) { res.status(401).json({ ok:false, error: "pin_mismatch" }); return; }
  // 세션에 저장 (req.session 사용)
  (req.session as any).agentAttProjectId = proj.id;
  (req.session as any).agentAttSerial    = proj.project_serial;
  res.json({ ok: true, project: { id: proj.id, name: proj.project_name, serial: proj.project_serial } });
});

router.post("/projects/:serial/att/logout", (req, res) => {
  delete (req.session as any).agentAttProjectId;
  delete (req.session as any).agentAttSerial;
  res.json({ ok: true });
});

router.get("/projects/:serial/att/me", (req, res) => {
  const serial = String(req.params.serial || "");
  const sess = req.session as any;
  if (sess?.agentAttSerial === serial && sess.agentAttProjectId) {
    res.json({ ok: true, project_id: sess.agentAttProjectId, serial });
  } else {
    res.json({ ok: false });
  }
});

// =====================================================================
// (공개 · 인증) QR 스캔 → 요원 정보 + 오늘 출근 여부 조회
//   query: t (qr_token)
// =====================================================================
router.get("/projects/:serial/att/lookup", async (req, res) => {
  const serial = String(req.params.serial || "");
  const sess = req.session as any;
  if (sess?.agentAttSerial !== serial || !sess.agentAttProjectId) {
    res.status(401).json({ ok:false, error: "not_logged_in" }); return;
  }
  const token = String(req.query.t || "").trim();
  if (!token) { res.status(400).json({ ok:false, error: "missing_token" }); return; }
  const [rows] = await pool.execute(
    `SELECT id, name, mobile, email FROM field_agents
     WHERE project_id = ? AND qr_token = ? AND status='active'`, [sess.agentAttProjectId, token],
  );
  const a = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!a) { res.status(404).json({ ok:false, error: "agent_not_found" }); return; }
  const today = ymdToday();
  const [att] = await pool.execute(
    `SELECT id, attendance_type, checked_in_at FROM field_agent_attendance
     WHERE agent_id = ? AND attended_date = ?`, [a.id, today],
  );
  const todayAtt = (Array.isArray(att) ? att[0] : null) as any;
  res.json({
    ok: true,
    agent: { id: a.id, name: a.name, mobile: a.mobile, email: a.email },
    today: todayAtt
      ? { date: today, attendance_type: todayAtt.attendance_type, checked_in_at: todayAtt.checked_in_at }
      : null,
  });
});

// =====================================================================
// (Host) QR 스캔으로 현장요원 근태 등록 — 관리자 PWA 의 QR 스캔 기능
//   body: { qr_token, attendance_type: 'on_time' | 'late', note? }
//   - 호스트 인증 + 본인 프로젝트 + QR 토큰의 요원이 프로젝트 소속이어야 함
// =====================================================================
router.post("/host/projects/:id/agent-check-in", requireHost, async (req, res) => {
  const host = (req.session as any).host;
  const projectId = Number(req.params.id);
  // 프로젝트 소유 검증
  const [pRows] = await pool.execute(
    "SELECT id FROM projects WHERE id = ? AND host_id = ?",
    [projectId, host.id],
  );
  if (!Array.isArray(pRows) || pRows.length === 0) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }

  const body = req.body || {};
  const qrToken = String(body.qr_token || "").trim();
  const type    = String(body.attendance_type || "on_time");
  const note    = String(body.note || "").slice(0, 255) || null;
  if (!qrToken) {
    res.status(400).json({ ok: false, error: "qr_required",
      message: "QR 스캔 후 진행해 주세요." }); return;
  }
  if (!["on_time","late"].includes(type)) {
    res.status(400).json({ ok: false, error: "invalid_type" }); return;
  }

  // QR 토큰으로 요원 조회 — 반드시 같은 프로젝트 + 활성
  const [chk] = await pool.execute(
    `SELECT id, name, mobile, email FROM field_agents
     WHERE qr_token = ? AND project_id = ? AND status='active'`,
    [qrToken, projectId],
  );
  const a = (Array.isArray(chk) ? chk[0] : null) as any;
  if (!a) {
    res.status(404).json({ ok: false, error: "agent_not_found",
      message: "이 프로젝트에서 발급된 QR 이 아니거나 비활성 요원입니다." }); return;
  }

  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();

  // 이미 출근 여부 확인
  const [todayRows] = await pool.execute(
    `SELECT id, attendance_type, checked_in_at FROM field_agent_attendance
     WHERE agent_id = ? AND attended_date = ?`,
    [a.id, today],
  );
  const existing = (Array.isArray(todayRows) ? todayRows[0] : null) as any;
  if (existing) {
    res.json({
      ok: true,
      already_checked_in: true,
      agent: { id: a.id, name: a.name, mobile: a.mobile, email: a.email },
      date: today,
      attendance_type: existing.attendance_type,
      checked_in_at: existing.checked_in_at,
    });
    return;
  }

  try {
    await pool.execute(
      `INSERT INTO field_agent_attendance (agent_id, project_id, attended_date, checked_in_at, attendance_type, note)
       VALUES (?, ?, ?, NOW(), ?, ?)`,
      [a.id, projectId, today, type, note],
    );
  } catch (e: any) {
    if (String(e?.code) === "ER_DUP_ENTRY") {
      res.status(409).json({ ok: false, error: "already_checked_in",
        message: "오늘은 이미 출근 처리되었습니다." }); return;
    }
    throw e;
  }

  res.json({
    ok: true,
    already_checked_in: false,
    agent: { id: a.id, name: a.name, mobile: a.mobile, email: a.email },
    date: today,
    attendance_type: type,
    checked_in_at: new Date().toISOString(),
  });
});

// =====================================================================
// (공개 · 인증) 근태 기록 (정시/지각) — **반드시 QR 스캔으로 식별된 당사자에 대해서만 허용**
//   body: { qr_token, attendance_type: 'on_time' | 'late', note? }
//   - 관리자가 직접 agent_id 를 지정해서 임의 등록할 수 없도록 QR 토큰으로 당사자 식별
// =====================================================================
router.post("/projects/:serial/att/check-in", async (req, res) => {
  const serial = String(req.params.serial || "");
  const sess = req.session as any;
  if (sess?.agentAttSerial !== serial || !sess.agentAttProjectId) {
    res.status(401).json({ ok:false, error: "not_logged_in" }); return;
  }
  const body = req.body || {};
  const qrToken = String(body.qr_token || "").trim();
  const type    = String(body.attendance_type || "");
  const note    = String(body.note || "").slice(0, 255) || null;
  if (!qrToken) {
    res.status(400).json({ ok:false, error: "qr_required",
      message: "QR 스캔을 먼저 진행해 주세요. (당건 식별 필요)" });
    return;
  }
  if (!["on_time","late"].includes(type)) {
    res.status(400).json({ ok:false, error: "invalid_input" }); return;
  }
  // QR 토큰 → 요원 확인 (반드시 같은 프로젝트 + 활성)
  const [chk] = await pool.execute(
    `SELECT id, name FROM field_agents
     WHERE qr_token = ? AND project_id = ? AND status='active'`,
    [qrToken, sess.agentAttProjectId],
  );
  const a = (Array.isArray(chk) ? chk[0] : null) as any;
  if (!a) { res.status(404).json({ ok:false, error: "agent_not_found",
    message: "이 프로젝트에서 발급된 QR 코드가 아니거나 비활성 요원입니다." }); return; }
  const today = ymdToday();
  try {
    await pool.execute(
      `INSERT INTO field_agent_attendance (agent_id, project_id, attended_date, checked_in_at, attendance_type, note)
       VALUES (?, ?, ?, NOW(), ?, ?)`,
      [a.id, sess.agentAttProjectId, today, type, note],
    );
  } catch (e: any) {
    if (String(e?.code) === "ER_DUP_ENTRY") {
      res.status(409).json({ ok:false, error: "already_checked_in", message: "오늘은 이미 출근 처리되었습니다." });
      return;
    }
    throw e;
  }
  res.json({ ok: true, agent_name: a.name, date: today, attendance_type: type });
});

// =====================================================================
// (Admin) 프로젝트별 현장요원 목록 + 근태 통계
// =====================================================================
router.get("/host/projects/:id/agents", async (req, res) => {
  const sess = req.session as any;
  if (!sess?.host) { res.status(401).json({ ok:false }); return; }
  const projectId = Number(req.params.id);
  // host 소유 확인
  const [own] = await pool.execute(
    `SELECT id, from_date, to_date, field_agent_use FROM projects WHERE id = ? AND host_id = ?`,
    [projectId, sess.host.id],
  );
  const proj = (Array.isArray(own) ? own[0] : null) as any;
  if (!proj) { res.status(404).json({ ok:false, error:"project_not_found" }); return; }
  // 요원 + 근태 집계
  const [rows] = await pool.execute(
    `SELECT a.id, a.name, a.mobile, a.email, a.address, a.qr_token,
            a.id_card_image_path, a.bankbook_image_path, a.qr_image_path,
            a.status, a.created_at,
            (SELECT COUNT(*) FROM field_agent_attendance x WHERE x.agent_id = a.id AND x.attendance_type='on_time') AS on_time_count,
            (SELECT COUNT(*) FROM field_agent_attendance x WHERE x.agent_id = a.id AND x.attendance_type='late') AS late_count
     FROM field_agents a
     WHERE a.project_id = ?
     ORDER BY a.created_at DESC`, [projectId],
  );
  // 전체 출근일수 = 프로젝트 from_date ~ today (또는 to_date 중 빠른 것)
  const today = new Date(); today.setHours(0,0,0,0);
  const fromD = new Date(proj.from_date); fromD.setHours(0,0,0,0);
  const toD   = new Date(proj.to_date);   toD.setHours(0,0,0,0);
  const endRef = today < toD ? today : toD;
  const totalDays = Math.max(0, Math.floor((endRef.getTime() - fromD.getTime()) / 86400000) + 1);
  res.json({
    ok: true,
    project: { id: proj.id, from_date: proj.from_date, to_date: proj.to_date, total_days: totalDays },
    agents: (Array.isArray(rows) ? rows : []).map((r: any) => ({
      id: r.id, name: r.name, mobile: r.mobile, email: r.email, address: r.address,
      qr_token: r.qr_token,
      id_card_image_url: toUploadUrl(r.id_card_image_path),
      bankbook_image_url: toUploadUrl(r.bankbook_image_path),
      qr_image_url: toUploadUrl(r.qr_image_path),
      status: r.status, created_at: r.created_at,
      attendance_summary: {
        on_time: Number(r.on_time_count || 0),
        late:    Number(r.late_count || 0),
        total:   totalDays,
      },
    })),
  });
});

// (Admin) 일별 근태 집계 — 프로젝트 시작일~오늘 각 날짜 + 요원별 status 매트릭스
router.get("/host/projects/:id/agents/by-day", async (req, res) => {
  const sess = req.session as any;
  if (!sess?.host) { res.status(401).json({ ok:false }); return; }
  const projectId = Number(req.params.id);
  const [own] = await pool.execute(
    `SELECT id, from_date, to_date FROM projects WHERE id = ? AND host_id = ?`,
    [projectId, sess.host.id],
  );
  const proj = (Array.isArray(own) ? own[0] : null) as any;
  if (!proj) { res.status(404).json({ ok:false }); return; }
  // 활성 요원
  const [agentRows] = await pool.execute(
    `SELECT id, name FROM field_agents WHERE project_id = ? AND status='active' ORDER BY id ASC`, [projectId],
  );
  const agents = Array.isArray(agentRows) ? agentRows : [];
  // 모든 근태 기록
  const [attRows] = await pool.execute(
    `SELECT agent_id, attended_date, attendance_type, checked_in_at FROM field_agent_attendance
     WHERE project_id = ?`, [projectId],
  );
  // 키: attended_date string YYYY-MM-DD → Map<agent_id, { type, checked_in_at }>
  const recMap = new Map<string, Map<number, { type: string; checked_in_at: any }>>();
  for (const r of (Array.isArray(attRows) ? attRows : []) as any[]) {
    const dt = new Date(r.attended_date);
    const z = (n: number) => String(n).padStart(2, "0");
    const key = `${dt.getFullYear()}-${z(dt.getMonth()+1)}-${z(dt.getDate())}`;
    if (!recMap.has(key)) recMap.set(key, new Map());
    recMap.get(key)!.set(Number(r.agent_id), { type: String(r.attendance_type), checked_in_at: r.checked_in_at });
  }
  // 날짜 범위 — 프로젝트 시작일 ~ 종료일 전체 (시작 전·미래 일자도 포함)
  const today = new Date(); today.setHours(0,0,0,0);
  const fromD = new Date(proj.from_date); fromD.setHours(0,0,0,0);
  const toD   = new Date(proj.to_date);   toD.setHours(0,0,0,0);
  const days: any[] = [];
  for (let d = new Date(fromD); d <= toD; d.setDate(d.getDate()+1)) {
    const z = (n: number) => String(n).padStart(2, "0");
    const key = `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
    const isFuture = d > today;
    const dayMap = recMap.get(key) || new Map();
    let onT = 0, late = 0;
    const onTList: any[] = [], lateList: any[] = [], absentList: any[] = [];
    for (const a of agents as any[]) {
      const rec = dayMap.get(Number(a.id));
      if (rec?.type === "on_time") { onT++; onTList.push({ id: a.id, name: a.name, checked_in_at: rec.checked_in_at }); }
      else if (rec?.type === "late") { late++; lateList.push({ id: a.id, name: a.name, checked_in_at: rec.checked_in_at }); }
      else if (!isFuture)  { absentList.push({ id: a.id, name: a.name }); } // 미래 일자는 결근 처리 X
    }
    days.push({
      date: key,
      day_of_week: d.getDay(),
      is_future: isFuture,
      on_time: onT,
      late,
      absent: isFuture ? 0 : (agents.length - onT - late),
      total: agents.length,
      on_time_agents: onTList,
      late_agents: lateList,
      absent_agents: absentList,
    });
  }
  res.json({
    ok: true,
    project: { id: proj.id, from_date: proj.from_date, to_date: proj.to_date },
    agents_count: agents.length,
    days,
  });
});

// (Admin) 특정 요원에게 출퇴근 QR 메일 발송
router.post("/host/projects/:id/agents/:agentId/send-qr-email", async (req, res) => {
  const sess = req.session as any;
  if (!sess?.host) { res.status(401).json({ ok:false }); return; }
  const projectId = Number(req.params.id);
  const agentId   = Number(req.params.agentId);
  // host 소유 확인
  const [own] = await pool.execute(
    `SELECT id, project_name, project_serial FROM projects WHERE id = ? AND host_id = ?`,
    [projectId, sess.host.id],
  );
  const proj = (Array.isArray(own) ? own[0] : null) as any;
  if (!proj) { res.status(404).json({ ok:false, error:"project_not_found" }); return; }
  // 요원 조회
  const [rows] = await pool.execute(
    `SELECT id, name, email, mobile, qr_token, qr_image_path FROM field_agents
     WHERE id = ? AND project_id = ? AND status='active'`, [agentId, projectId],
  );
  const a = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!a) { res.status(404).json({ ok:false, error:"agent_not_found" }); return; }
  if (!a.qr_image_path || !fs.existsSync(a.qr_image_path)) {
    res.status(500).json({ ok:false, error:"qr_file_missing" }); return;
  }
  const attUrl  = `${publicBaseUrl()}/agent-att/${proj.project_serial}/scan?t=${a.qr_token}`;
  const registerUrl = `${publicBaseUrl()}/agent-register/${proj.project_serial}`;
  const cid = `agent-qr-${a.id}`;
  try {
    await sendEmail({
      templateKey: "agent_qr",
      to: a.email,
      subject: `[모노라마] ${proj.project_name} 현장요원 출퇴근 QR 코드`,
      projectId, hostId: sess.host.id,
      triggerType: "manual",   // 관리자가 QR 모달에서 '메일 전송' 클릭한 수동 발송

      html: `<div style="font-family:'Malgun Gothic',sans-serif;max-width:520px;">
        <h3 style="color:#15803d;">출퇴근 QR 코드 전달</h3>
        <p>${escHtml(a.name)} 님,<br><b>${escHtml(proj.project_name)}</b> 프로젝트의 출퇴근 QR 코드를 보내드립니다.</p>
        <div style="text-align:center;margin:24px 0;background:#f0fdf4;border:2px dashed #86efac;border-radius:12px;padding:20px;">
          <img src="cid:${cid}" alt="출퇴근 QR" style="width:260px;height:260px;display:block;margin:0 auto;background:#fff;">
          <div style="margin-top:14px;font-size:13px;color:#166534;font-weight:700;">📌 출근 시 관리자에게 이 QR을 보여주세요</div>
        </div>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;font-size:12px;color:#1e40af;line-height:1.6;">
          <b>📱 PWA 앱 사용</b><br>아래 링크에서 이메일 인증 후 본인 페이지로 들어가시면 QR + 근태 달력을 언제든 확인하실 수 있습니다.<br>
          <a href="${registerUrl}" style="color:#15803d;font-weight:600;word-break:break-all;">${registerUrl}</a>
        </div>
        <p style="color:#64748b;font-size:12px;margin-top:18px;">본 메일은 시스템이 자동 발송하였습니다.</p>
      </div>`,
      attachments: [
        { filename: `qr_${a.name}_${proj.project_serial}.png`, path: a.qr_image_path, cid },
      ],
    });
  } catch (e: any) {
    res.status(500).json({ ok:false, error:"send_failed", message: e?.message || "메일 전송 실패" });
    return;
  }
  res.json({ ok: true, sent_to: a.email });
});

function escHtml(s: string): string {
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));
}

// (Admin) 특정 요원의 근태 상세 (달력용)
router.get("/host/projects/:id/agents/:agentId/attendance", async (req, res) => {
  const sess = req.session as any;
  if (!sess?.host) { res.status(401).json({ ok:false }); return; }
  const projectId = Number(req.params.id);
  const agentId   = Number(req.params.agentId);
  const [own] = await pool.execute(
    `SELECT id, from_date, to_date FROM projects WHERE id = ? AND host_id = ?`,
    [projectId, sess.host.id],
  );
  const proj = (Array.isArray(own) ? own[0] : null) as any;
  if (!proj) { res.status(404).json({ ok:false }); return; }
  const [rows] = await pool.execute(
    `SELECT attended_date, attendance_type, checked_in_at FROM field_agent_attendance
     WHERE agent_id = ? AND project_id = ?
     ORDER BY attended_date ASC`, [agentId, projectId],
  );
  res.json({
    ok: true,
    from_date: proj.from_date, to_date: proj.to_date,
    records: rows,
  });
});

// =====================================================================
// (공개) QR 토큰 기반 — 현장요원 본인 정보 + 근태 조회 (PWA 메인)
//   query: t (qr_token)
// =====================================================================
router.get("/projects/:serial/me", async (req, res) => {
  const serial = String(req.params.serial || "");
  const token  = String(req.query.t || "").trim();
  if (!token) { res.status(400).json({ ok:false, error: "missing_token" }); return; }
  const [pr] = await pool.execute(
    `SELECT id, project_name, project_serial, from_date, to_date FROM projects WHERE project_serial = ?`, [serial],
  );
  const proj = (Array.isArray(pr) ? pr[0] : null) as any;
  if (!proj) { res.status(404).json({ ok:false, error: "project_not_found" }); return; }
  const [rows] = await pool.execute(
    `SELECT id, name, mobile, email, qr_token, qr_image_path, status, created_at
     FROM field_agents WHERE project_id = ? AND qr_token = ?`, [proj.id, token],
  );
  const a = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!a) { res.status(404).json({ ok:false, error: "agent_not_found" }); return; }
  const [att] = await pool.execute(
    `SELECT attended_date, attendance_type, checked_in_at FROM field_agent_attendance
     WHERE agent_id = ? AND project_id = ? ORDER BY attended_date ASC`, [a.id, proj.id],
  );
  res.json({
    ok: true,
    project: { name: proj.project_name, serial: proj.project_serial,
               from_date: proj.from_date, to_date: proj.to_date },
    agent: {
      id: a.id, name: a.name, mobile: a.mobile, email: a.email,
      qr_token: a.qr_token,
      qr_image_url: toUploadUrl(a.qr_image_path),
      attendance_url: `${publicBaseUrl()}/agent-att/${serial}/scan?t=${a.qr_token}`,
      created_at: a.created_at,
    },
    records: att,
  });
});

function ymdToday(): string {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
}

export default router;
