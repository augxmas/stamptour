import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import pool from "../config/database";
import { requireHost } from "../middleware/auth";
import { sendPartnerVerifyCode } from "../services/email.service";
import bcrypt from "bcryptjs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 참가기관 인증 미들웨어
function requirePartner(req: Request, res: Response, next: any) {
  if (!req.session.partner) {
    res.status(401).json({ ok: false, error: "unauthorized" }); return;
  }
  next();
}

// 코드를 영구 비밀번호로 등록/갱신 (해시 저장)
async function upsertPartnerAccount(email: string, code: string): Promise<number> {
  const hash = await bcrypt.hash(code, 8);
  await pool.execute(
    `INSERT INTO partner_accounts (email, password_hash) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), updated_at=NOW()`,
    [email.toLowerCase(), hash],
  );
  const [rows] = await pool.execute(
    `SELECT id FROM partner_accounts WHERE email = ?`, [email.toLowerCase()],
  );
  return (Array.isArray(rows) && rows.length ? (rows[0] as any).id : 0) as number;
}

function toUploadUrl(p?: string | null): string | null {
  if (!p) return null;
  const norm = p.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/uploads/");
  if (idx >= 0) return norm.slice(idx);
  const rel = norm.indexOf("uploads/");
  return rel >= 0 ? `/${norm.slice(rel)}` : norm;
}

const router = Router();

// ── multer storage ─────────────────────────────────────────────
function storageFor(subdir: string) {
  const dest = path.join(process.cwd(), "uploads", subdir);
  try { fs.mkdirSync(dest, { recursive: true }); } catch {}
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, dest),
      filename: (_req, file, cb) => {
        const safe = crypto.randomBytes(8).toString("hex");
        const ext = path.extname(file.originalname).toLowerCase().slice(0, 6) || "";
        cb(null, `${Date.now()}_${safe}${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
  });
}
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, file, cb) => {
      const sub = file.fieldname === "biz_cert" ? "partner-biz-cert" : "partner-logo";
      const dest = path.join(process.cwd(), "uploads", sub);
      try { fs.mkdirSync(dest, { recursive: true }); } catch {}
      cb(null, dest);
    },
    filename: (_req, file, cb) => {
      const safe = crypto.randomBytes(8).toString("hex");
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 6) || "";
      cb(null, `${Date.now()}_${safe}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ═══════════════════════════════════════════════════════════════
//  HOST 측 — 폼 설정 + 신청 관리
// ═══════════════════════════════════════════════════════════════

// 폼 설정 조회
router.get("/host/projects/:id/partner-form", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  const [pr] = await pool.execute(
    "SELECT id FROM projects WHERE id = ? AND host_id = ?", [pid, host.id],
  );
  if (!Array.isArray(pr) || pr.length === 0) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const [rows] = await pool.execute(
    "SELECT * FROM project_partner_form_config WHERE project_id = ?", [pid],
  );
  const cfg = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!cfg) { res.json({ ok: true, config: null }); return; }
  // JSON 컬럼 파싱
  ["field_options", "booth_type_options", "facility_options"].forEach(k => {
    try { cfg[k] = cfg[k] ? JSON.parse(cfg[k]) : []; } catch { cfg[k] = []; }
  });
  res.json({ ok: true, config: cfg });
});

// 폼 설정 저장
router.put("/host/projects/:id/partner-form", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  const [pr] = await pool.execute(
    "SELECT id FROM projects WHERE id = ? AND host_id = ?", [pid, host.id],
  );
  if (!Array.isArray(pr) || pr.length === 0) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const b = req.body || {};
  const bit = (v: any) => v === true || v === 1 || v === "1" ? 1 : 0;
  const fieldOpts = JSON.stringify(Array.isArray(b.field_options) ? b.field_options : []);
  const boothOpts = JSON.stringify(Array.isArray(b.booth_type_options) ? b.booth_type_options : []);
  const facilityOpts = JSON.stringify(Array.isArray(b.facility_options) ? b.facility_options : []);
  // 근무시간 (HH:mm) — 기본 10:00 / 18:00
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  const workFrom = hhmm.test(String(b.work_hours_from || "")) ? String(b.work_hours_from) : "10:00";
  const workTo   = hhmm.test(String(b.work_hours_to   || "")) ? String(b.work_hours_to)   : "18:00";
  await pool.execute(
    `INSERT INTO project_partner_form_config
      (project_id, use_company_name_ko, use_company_name_en, use_ceo_name, use_ceo_email, use_ceo_mobile,
       use_biz_cert_file, use_company_phone, use_company_fax, use_company_address, use_company_homepage,
       use_company_logo, use_company_fields,
       use_contact_name, use_contact_dept, use_contact_position, use_contact_phone, use_contact_email,
       use_booth_type, use_booth_count, use_facility, use_extra_request,
       field_options, booth_type_options, facility_options, work_hours_from, work_hours_to, show_work_hours,
       terms_text, privacy_text, is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       use_company_name_ko=VALUES(use_company_name_ko), use_company_name_en=VALUES(use_company_name_en),
       use_ceo_name=VALUES(use_ceo_name), use_ceo_email=VALUES(use_ceo_email), use_ceo_mobile=VALUES(use_ceo_mobile),
       use_biz_cert_file=VALUES(use_biz_cert_file), use_company_phone=VALUES(use_company_phone),
       use_company_fax=VALUES(use_company_fax), use_company_address=VALUES(use_company_address),
       use_company_homepage=VALUES(use_company_homepage), use_company_logo=VALUES(use_company_logo),
       use_company_fields=VALUES(use_company_fields),
       use_contact_name=VALUES(use_contact_name), use_contact_dept=VALUES(use_contact_dept),
       use_contact_position=VALUES(use_contact_position), use_contact_phone=VALUES(use_contact_phone),
       use_contact_email=VALUES(use_contact_email), use_booth_type=VALUES(use_booth_type),
       use_booth_count=VALUES(use_booth_count), use_facility=VALUES(use_facility),
       use_extra_request=VALUES(use_extra_request),
       field_options=VALUES(field_options), booth_type_options=VALUES(booth_type_options),
       facility_options=VALUES(facility_options),
       work_hours_from=VALUES(work_hours_from), work_hours_to=VALUES(work_hours_to), show_work_hours=VALUES(show_work_hours),
       terms_text=VALUES(terms_text),
       privacy_text=VALUES(privacy_text), is_active=VALUES(is_active), updated_at=NOW()`,
    [pid,
      bit(b.use_company_name_ko), bit(b.use_company_name_en), bit(b.use_ceo_name), bit(b.use_ceo_email), bit(b.use_ceo_mobile),
      bit(b.use_biz_cert_file), bit(b.use_company_phone), bit(b.use_company_fax), bit(b.use_company_address), bit(b.use_company_homepage),
      bit(b.use_company_logo), bit(b.use_company_fields),
      bit(b.use_contact_name), bit(b.use_contact_dept), bit(b.use_contact_position), bit(b.use_contact_phone), bit(b.use_contact_email),
      bit(b.use_booth_type), bit(b.use_booth_count), bit(b.use_facility), bit(b.use_extra_request),
      fieldOpts, boothOpts, facilityOpts, workFrom, workTo, b.show_work_hours === false ? 0 : 1,
      String(b.terms_text || ""), String(b.privacy_text || ""), b.is_active === false ? 0 : 1],
  );
  res.json({ ok: true });
});

// 참여기관 목록 (host)
router.get("/host/projects/:id/partners", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  const [pr] = await pool.execute(
    "SELECT id FROM projects WHERE id = ? AND host_id = ?", [pid, host.id],
  );
  if (!Array.isArray(pr) || pr.length === 0) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const [rows] = await pool.execute(
    `SELECT * FROM project_partners WHERE project_id = ? ORDER BY created_at DESC`, [pid],
  );
  const data = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    ...r,
    biz_cert_url: r.biz_cert_path ? toUploadUrl(r.biz_cert_path) : null,
    company_logo_url: r.company_logo_path ? toUploadUrl(r.company_logo_path) : null,
    company_fields: (() => { try { return r.company_fields ? JSON.parse(r.company_fields) : []; } catch { return []; } })(),
    facility_json: (() => { try { return r.facility_json ? (typeof r.facility_json === 'string' ? JSON.parse(r.facility_json) : r.facility_json) : []; } catch { return []; } })(),
    quote_json: (() => { try { return r.quote_json ? (typeof r.quote_json === 'string' ? JSON.parse(r.quote_json) : r.quote_json) : null; } catch { return null; } })(),
  }));
  res.json({ ok: true, data });
});

// 승인 / 거절 / 입금확인 (및 각 취소)
//   body: { decision: 'approved' | 'rejected' | 'deposit_confirmed' | 'unapprove' | 'undeposit',
//           reason?: string }
router.put("/host/projects/:id/partners/:pid/decision", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);
  const partnerId = Number(req.params.pid);
  const decision = String(req.body?.decision || "").trim();
  const reason = String(req.body?.reason || "").slice(0, 500);

  // 호스트 소유 프로젝트 검증
  const [pr] = await pool.execute(
    "SELECT id FROM projects WHERE id = ? AND host_id = ?", [projectId, host.id],
  );
  if (!Array.isArray(pr) || pr.length === 0) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }

  // 현재 상태 조회 (입금확인 시 사전 승인 필요)
  const [rows] = await pool.execute(
    `SELECT status, approved_at FROM project_partners WHERE id = ? AND project_id = ?`,
    [partnerId, projectId],
  );
  const cur = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!cur) { res.status(404).json({ ok: false, error: "partner_not_found" }); return; }

  const ts = new Date();
  let sql = "";
  let params: any[] = [];
  switch (decision) {
    case "approved":
      sql = `UPDATE project_partners SET status='approved', approved_at=?, rejected_at=NULL, rejected_reason=NULL WHERE id=? AND project_id=?`;
      params = [ts, partnerId, projectId];
      break;
    case "rejected":
      sql = `UPDATE project_partners SET status='rejected', rejected_at=?, rejected_reason=?, approved_at=NULL, deposit_confirmed_at=NULL WHERE id=? AND project_id=?`;
      params = [ts, reason, partnerId, projectId];
      break;
    case "deposit_confirmed":
      if (cur.status !== "approved") {
        res.status(400).json({ ok: false, error: "not_approved", message: "승인된 신청만 입금확인 처리 가능합니다." });
        return;
      }
      sql = `UPDATE project_partners SET deposit_confirmed_at=? WHERE id=? AND project_id=?`;
      params = [ts, partnerId, projectId];
      break;
    case "unapprove":
      // 승인 취소 — 대기 상태로 복귀 + 입금확인도 함께 해제
      sql = `UPDATE project_partners SET status='pending', approved_at=NULL, deposit_confirmed_at=NULL WHERE id=? AND project_id=?`;
      params = [partnerId, projectId];
      break;
    case "undeposit":
      // 입금확인 취소 — 승인 상태는 유지
      sql = `UPDATE project_partners SET deposit_confirmed_at=NULL WHERE id=? AND project_id=?`;
      params = [partnerId, projectId];
      break;
    default:
      res.status(400).json({ ok: false, error: "invalid_decision" });
      return;
  }
  await pool.execute(sql, params);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
//  Public 측 — 참가기관 전용 이메일 인증 (코드 = 비밀번호 안내 포함)
// ═══════════════════════════════════════════════════════════════
router.post("/public/email-verify/send", async (req, res) => {
  const email  = String((req.body || {}).email || "").trim();
  const serial = String((req.body || {}).project_serial || "").trim();
  if (!email || !EMAIL_RE.test(email)) {
    res.status(400).json({ ok: false, error: "invalid_email" }); return;
  }
  // 프로젝트명 조회 (안내 메일에 포함)
  let projectName = "";
  if (serial) {
    const [pr] = await pool.execute(
      `SELECT project_name FROM projects WHERE project_serial = ? LIMIT 1`, [serial],
    );
    const proj = (Array.isArray(pr) ? pr[0] : null) as any;
    if (proj) projectName = proj.project_name || "";
  }
  // 1분 rate-limit (host_email_verify_codes 재사용)
  const [recent] = await pool.execute(
    `SELECT id FROM host_email_verify_codes
      WHERE email = ? AND used = 0 AND expires_at > NOW() AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)`,
    [email],
  );
  if (Array.isArray(recent) && recent.length > 0) {
    res.status(429).json({ ok: false, error: "rate_limited" }); return;
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await pool.execute(
    `INSERT INTO host_email_verify_codes (email, code, expires_at) VALUES (?, ?, ?)`,
    [email, code, expires],
  );
  try {
    await sendPartnerVerifyCode(email, code, projectName);
  } catch (e) {
    res.json({ ok: true, devCode: code, message: "인증코드가 발송되었습니다." });
    return;
  }
  res.json({ ok: true, message: "인증코드가 발송되었습니다. (코드는 귀 기관의 비밀번호로 사용되므로 별도 저장해 주세요)" });
});

router.post("/public/email-verify/check", async (req, res) => {
  const email = String((req.body || {}).email || "").trim();
  const code  = String((req.body || {}).code || "").trim();
  if (!email || !code) { res.status(400).json({ ok: false, error: "missing" }); return; }
  const [rows] = await pool.execute(
    `SELECT id FROM host_email_verify_codes
      WHERE email = ? AND code = ? AND used = 0 AND expires_at > NOW()
      ORDER BY id DESC LIMIT 1`,
    [email, code],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ ok: false, error: "invalid_or_expired" }); return;
  }
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
//  Public 측 — 신청 폼 데이터 + 제출
// ═══════════════════════════════════════════════════════════════

// 폼 설정 + 프로젝트 정보 (공개)
router.get("/public/projects/:serial/partner-form", async (req, res) => {
  const serial = String(req.params.serial || "");
  const [pr] = await pool.execute(
    "SELECT id, project_name, project_serial, status FROM projects WHERE project_serial = ?", [serial],
  );
  const proj = (Array.isArray(pr) ? pr[0] : null) as any;
  if (!proj) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
  const [rows] = await pool.execute(
    "SELECT * FROM project_partner_form_config WHERE project_id = ?", [proj.id],
  );
  const cfg = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!cfg || !cfg.is_active) {
    res.status(403).json({ ok: false, error: "form_not_open", message: "현재 참여기관 신청을 받지 않습니다." }); return;
  }
  ["field_options", "booth_type_options", "facility_options"].forEach(k => {
    try { cfg[k] = cfg[k] ? JSON.parse(cfg[k]) : []; } catch { cfg[k] = []; }
  });
  res.json({ ok: true, project: { id: proj.id, name: proj.project_name, serial: proj.project_serial }, config: cfg });
});

// 공개 참여기업 목록 (랜딩 페이지용) — approved 만, 민감 정보 제외
router.get("/public/projects/:serial/partners", async (req, res) => {
  const serial = String(req.params.serial || "").trim();
  const [pr] = await pool.execute(
    "SELECT id, project_name FROM projects WHERE project_serial = ?", [serial],
  );
  const proj = (Array.isArray(pr) ? pr[0] : null) as any;
  if (!proj) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
  const [rows] = await pool.execute(
    `SELECT id, company_name_ko, company_name_en, company_homepage, company_logo_path,
            company_fields, booth_type
       FROM project_partners
      WHERE project_id = ? AND status = 'approved'
      ORDER BY company_name_ko ASC, id ASC`,
    [proj.id],
  );
  const data = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    id: r.id,
    name: r.company_name_ko || r.company_name_en || "",
    name_en: r.company_name_en || null,
    homepage: r.company_homepage || null,
    logo_url: toUploadUrl(r.company_logo_path),
    fields: (() => { try { return r.company_fields ? JSON.parse(r.company_fields) : []; } catch { return []; } })(),
    booth_type: r.booth_type || null,
  }));
  res.json({ ok: true, project: { id: proj.id, name: proj.project_name, serial }, data });
});

// 신청 제출 (공개)
router.post("/public/projects/:serial/partner/submit",
  upload.fields([{ name: "biz_cert", maxCount: 1 }, { name: "company_logo", maxCount: 1 }]),
  async (req: Request, res: Response) => {
    const serial = String(req.params.serial || "");
    const b = req.body || {};
    const files = (req.files as Record<string, Express.Multer.File[]>) || {};
    const bizCert = files.biz_cert?.[0]?.path || null;
    const companyLogo = files.company_logo?.[0]?.path || null;

    const [pr] = await pool.execute(
      "SELECT id, project_name FROM projects WHERE project_serial = ?", [serial],
    );
    const proj = (Array.isArray(pr) ? pr[0] : null) as any;
    if (!proj) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
    const [crows] = await pool.execute(
      "SELECT is_active FROM project_partner_form_config WHERE project_id = ?", [proj.id],
    );
    const cfg = (Array.isArray(crows) ? crows[0] : null) as any;
    if (!cfg || !cfg.is_active) {
      res.status(403).json({ ok: false, error: "form_not_open", message: "신청을 받지 않습니다." }); return;
    }
    if (!b.agreed_terms || !b.agreed_privacy) {
      res.status(400).json({ ok: false, error: "agreements_required", message: "약관 및 개인정보수집 동의가 필요합니다." }); return;
    }

    const fieldsJson = (() => {
      try { return Array.isArray(b.company_fields) ? JSON.stringify(b.company_fields) : (b.company_fields ? JSON.stringify([b.company_fields]) : null); }
      catch { return null; }
    })();

    // 견적 데이터 파싱
    const boothUnitCost = b.booth_unit_cost ? Number(b.booth_unit_cost) : null;
    const boothCount = b.booth_count ? Number(b.booth_count) : null;
    let facilityJson: string | null = null;
    let facilityText = b.facility || null;
    try {
      const fj = typeof b.facility_json === "string" ? JSON.parse(b.facility_json) : b.facility_json;
      if (Array.isArray(fj) && fj.length) {
        facilityJson = JSON.stringify(fj);
        // 사람이 읽을 수 있는 요약을 facility 컬럼에 함께 저장
        facilityText = fj.map((x: any) => `${x.name}×${x.count} (${(x.unit_cost*x.count).toLocaleString()}원)`).join(", ");
      }
    } catch {}
    const quoteTotal = b.quote_total ? Number(b.quote_total) : null;
    let quoteJson: string | null = null;
    try {
      const qj = typeof b.quote_json === "string" ? JSON.parse(b.quote_json) : b.quote_json;
      if (qj && typeof qj === "object") quoteJson = JSON.stringify(qj);
    } catch {}

    await pool.execute(
      `INSERT INTO project_partners
        (project_id, status, company_name_ko, company_name_en, ceo_name, ceo_email, ceo_mobile,
         biz_cert_path, company_phone, company_fax, company_address, company_homepage, company_logo_path,
         company_fields,
         contact_name, contact_dept, contact_position, contact_phone, contact_email,
         booth_type, booth_unit_cost, booth_count, facility, facility_json,
         quote_total, quote_json,
         extra_request, agreed_terms, agreed_privacy)
       VALUES (?, 'pending', ?,?,?,?,?, ?,?,?,?,?,?, ?, ?,?,?,?,?, ?,?,?,?,?, ?,?, ?, 1,1)`,
      [proj.id,
        b.company_name_ko || null, b.company_name_en || null,
        b.ceo_name || null, b.ceo_email || null, b.ceo_mobile || null,
        bizCert, b.company_phone || null, b.company_fax || null,
        b.company_address || null, b.company_homepage || null, companyLogo,
        fieldsJson,
        b.contact_name || null, b.contact_dept || null, b.contact_position || null,
        b.contact_phone || null, b.contact_email || null,
        b.booth_type || null, boothUnitCost, boothCount, facilityText, facilityJson,
        quoteTotal, quoteJson,
        b.extra_request || null,
      ],
    );
    // 참가기관 계정 생성/갱신 — 인증코드를 비밀번호로 저장
    try {
      const verifyCode = String(b.email_verify_code || "").trim();
      if (verifyCode && b.contact_email) {
        await upsertPartnerAccount(String(b.contact_email).trim().toLowerCase(), verifyCode);
      }
    } catch (e) { /* 계정 생성 실패는 신청 자체에 영향 X */ }

    res.json({ ok: true, message: "신청이 접수되었습니다. 입력하신 인증코드가 로그인 비밀번호로 등록되었습니다." });
  });

// ═══════════════════════════════════════════════════════════════
//  Partner Account — 로그인 / 비밀번호 분실 / 내 정보
// ═══════════════════════════════════════════════════════════════

// 비밀번호 분실 — 새 인증코드 메일 발송 (재설정 모드)
//   reset=1 인 경우 기존 비밀번호 해시를 새 코드로 갱신할 준비
router.post("/auth/forgot", async (req, res) => {
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    res.status(400).json({ ok: false, error: "invalid_email" }); return;
  }
  // 계정 OR 신청 이력 존재 여부 확인 (한 곳이라도 등록되어 있으면 발송)
  const [accs] = await pool.execute(
    "SELECT id FROM partner_accounts WHERE email = ? LIMIT 1", [email],
  );
  const [apps] = await pool.execute(
    "SELECT id FROM project_partners WHERE LOWER(contact_email) = ? LIMIT 1", [email],
  );
  const hasAccount = Array.isArray(accs) && accs.length > 0;
  const hasApplication = Array.isArray(apps) && apps.length > 0;
  if (!hasAccount && !hasApplication) {
    // 보안: 가입/신청 안 된 이메일에도 동일 응답
    res.json({ ok: true, message: "가입 정보가 확인되면 이메일로 새 인증코드가 발송됩니다. (메일이 오지 않으면 등록되지 않은 이메일입니다)" });
    return;
  }
  // rate limit
  const [recent] = await pool.execute(
    `SELECT id FROM host_email_verify_codes
      WHERE email = ? AND used = 0 AND expires_at > NOW() AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)`,
    [email],
  );
  if (Array.isArray(recent) && recent.length > 0) {
    res.status(429).json({ ok: false, error: "rate_limited" }); return;
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await pool.execute(
    `INSERT INTO host_email_verify_codes (email, code, expires_at) VALUES (?, ?, ?)`,
    [email, code, expires],
  );
  try {
    await sendPartnerVerifyCode(email, code);
  } catch (e) {
    res.json({ ok: true, devCode: code, message: "새 인증코드가 발송되었습니다." });
    return;
  }
  res.json({ ok: true, message: "새 인증코드가 이메일로 발송되었습니다. (10분 유효)\n새 코드는 귀 기관의 새 비밀번호가 되므로 별도 저장해 주세요." });
});

// 로그인 — 이메일 + 코드 (저장된 비밀번호 OR 미사용 인증코드)
router.post("/auth/login", async (req, res) => {
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  const code  = String((req.body || {}).code || "").trim();
  if (!email || !EMAIL_RE.test(email) || !code) {
    res.status(400).json({ ok: false, error: "invalid_input" }); return;
  }
  // 1) 미사용 인증코드 매치 (가장 최근, 미만료)
  const [codeRows] = await pool.execute(
    `SELECT id FROM host_email_verify_codes
      WHERE email = ? AND code = ? AND used = 0 AND expires_at > NOW()
      ORDER BY id DESC LIMIT 1`,
    [email, code],
  );
  let validByCode = Array.isArray(codeRows) && codeRows.length > 0;
  // 2) 저장된 password_hash 매치
  const [accRows] = await pool.execute(
    `SELECT id, password_hash FROM partner_accounts WHERE email = ? LIMIT 1`, [email],
  );
  const acc = (Array.isArray(accRows) ? accRows[0] : null) as any;
  let validByHash = false;
  if (acc) validByHash = await bcrypt.compare(code, acc.password_hash);
  if (!validByCode && !validByHash) {
    res.status(401).json({ ok: false, error: "invalid_credentials", message: "이메일 또는 인증코드가 일치하지 않습니다." });
    return;
  }
  // 미사용 인증코드로 들어왔으면 (재설정 흐름) → 해시 갱신
  let accountId = acc ? acc.id : 0;
  if (validByCode) {
    accountId = await upsertPartnerAccount(email, code);
    await pool.execute(`UPDATE host_email_verify_codes SET used=1 WHERE id=?`, [(codeRows as any)[0].id]);
  }
  await pool.execute(`UPDATE partner_accounts SET last_login_at=NOW() WHERE id=?`, [accountId]);
  req.session.partner = { id: accountId, email };
  res.json({ ok: true });
});

router.post("/auth/logout", (req, res) => {
  delete req.session.partner;
  res.json({ ok: true });
});

router.get("/me", requirePartner, async (req, res) => {
  const p = req.session.partner!;
  const [rows] = await pool.execute(
    `SELECT pp.*, pr.project_name, pr.project_serial,
            cfg.booth_type_options, cfg.facility_options,
            cfg.work_hours_from, cfg.work_hours_to, cfg.show_work_hours
       FROM project_partners pp
       JOIN projects pr ON pr.id = pp.project_id
       LEFT JOIN project_partner_form_config cfg ON cfg.project_id = pp.project_id
      WHERE LOWER(pp.contact_email) = ?
      ORDER BY pp.created_at DESC`,
    [p.email],
  );
  const parseArr = (v: any) => { try { return v ? (typeof v === 'string' ? JSON.parse(v) : v) : []; } catch { return []; } };
  const data = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    ...r,
    biz_cert_url: r.biz_cert_path ? toUploadUrl(r.biz_cert_path) : null,
    company_logo_url: r.company_logo_path ? toUploadUrl(r.company_logo_path) : null,
    company_fields: parseArr(r.company_fields),
    facility_json: parseArr(r.facility_json),
    quote_json: (() => { try { return r.quote_json ? (typeof r.quote_json === 'string' ? JSON.parse(r.quote_json) : r.quote_json) : null; } catch { return null; } })(),
    booth_type_options: parseArr(r.booth_type_options),
    facility_options:   parseArr(r.facility_options),
  }));
  res.json({ ok: true, email: p.email, applications: data });
});

// 신청 수정 — rejected 외 상태 허용 + 파일 업로드 지원
router.put("/me/applications/:id", requirePartner,
  upload.fields([{ name: "biz_cert", maxCount: 1 }, { name: "company_logo", maxCount: 1 }]),
  async (req: Request, res: Response) => {
  const p = req.session.partner!;
  const id = Number(req.params.id);
  const b = req.body || {};
  const files = (req.files as Record<string, Express.Multer.File[]>) || {};
  // 본인 신청인지 + 수정 가능 상태인지 확인
  const [rows] = await pool.execute(
    `SELECT id, status, deposit_confirmed_at FROM project_partners WHERE id = ? AND LOWER(contact_email) = ?`,
    [id, p.email],
  );
  const r0 = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!r0) { res.status(404).json({ ok: false, error: "not_found" }); return; }
  if (r0.status === "rejected") {
    res.status(403).json({ ok: false, error: "not_editable",
      message: "거절된 신청은 수정할 수 없습니다. 호스트에게 문의해 주세요." });
    return;
  }
  // 입금확인 완료 시 부스/시설/견적 필드 강제 제거 (서버단 방어)
  const depositLocked = !!r0.deposit_confirmed_at;
  if (depositLocked) {
    ["booth_type","booth_unit_cost","booth_count","facility_json","quote_total","quote_json"].forEach(k => delete b[k]);
  }
  // 업로드된 파일 처리 — 새 파일 / 삭제 플래그 / 유지
  if (files.biz_cert && files.biz_cert[0]) {
    b.biz_cert_path = files.biz_cert[0].path;
  } else if (b.remove_biz_cert === "1" || b.remove_biz_cert === true) {
    b.biz_cert_path = null;
  } else {
    delete b.biz_cert_path;   // 미전송 시 컬럼 보존
  }
  if (files.company_logo && files.company_logo[0]) {
    b.company_logo_path = files.company_logo[0].path;
  } else if (b.remove_company_logo === "1" || b.remove_company_logo === true) {
    b.company_logo_path = null;
  } else {
    delete b.company_logo_path;
  }
  // 수정 가능한 컬럼 — 개인정보 + 부스/시설/견적 + 파일 경로
  const allowed = [
    "company_name_ko","company_name_en","ceo_name","ceo_mobile",
    "company_phone","company_fax","company_address","company_homepage",
    "contact_name","contact_dept","contact_position","contact_phone",
    "extra_request", "booth_type",
    "biz_cert_path", "company_logo_path",
  ];
  const sets: string[] = [];
  const params: any[] = [];
  for (const k of allowed) {
    if (k in b) {
      sets.push(`${k} = ?`);
      params.push(b[k] == null || b[k] === "" ? null : String(b[k]));
    }
  }
  // 부스/시설/견적 수치 컬럼
  if ("booth_unit_cost" in b) { sets.push("booth_unit_cost = ?"); params.push(b.booth_unit_cost ? Number(b.booth_unit_cost) : null); }
  if ("booth_count" in b)     { sets.push("booth_count = ?");     params.push(b.booth_count ? Number(b.booth_count) : null); }
  if ("quote_total" in b)     { sets.push("quote_total = ?");     params.push(b.quote_total ? Number(b.quote_total) : null); }
  // facility_json — JSON 직렬화 + 사람용 facility 컬럼 함께 갱신
  if ("facility_json" in b) {
    try {
      const fj = typeof b.facility_json === "string" ? JSON.parse(b.facility_json) : b.facility_json;
      if (Array.isArray(fj)) {
        sets.push("facility_json = ?"); params.push(JSON.stringify(fj));
        sets.push("facility = ?");
        params.push(fj.length
          ? fj.map((x: any) => `${x.name}×${x.count} (${(x.unit_cost*x.count).toLocaleString()}원)`).join(", ")
          : null);
      } else {
        sets.push("facility_json = ?"); params.push(null);
        sets.push("facility = ?"); params.push(null);
      }
    } catch {
      sets.push("facility_json = ?"); params.push(null);
      sets.push("facility = ?"); params.push(null);
    }
  }
  // quote_json
  if ("quote_json" in b) {
    try {
      const qj = typeof b.quote_json === "string" ? JSON.parse(b.quote_json) : b.quote_json;
      sets.push("quote_json = ?");
      params.push(qj && typeof qj === "object" ? JSON.stringify(qj) : null);
    } catch { sets.push("quote_json = ?"); params.push(null); }
  }

  if (!sets.length) { res.json({ ok: true, message: "변경 사항이 없습니다." }); return; }
  params.push(id);
  await pool.execute(`UPDATE project_partners SET ${sets.join(", ")}, updated_at=NOW() WHERE id = ?`, params);
  res.json({ ok: true, message: "수정되었습니다." });
});

export default router;
