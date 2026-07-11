import path from "node:path";
import fs from "node:fs";
import { Router } from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import pool from "../config/database";
import { requireHost } from "../middleware/auth";
import {
  sendEmailVerifyCode,
  sendHostRegistrationEmail,
  sendHostTempPasswordEmail,
  sendSupervisorNewHostNotification,
} from "../services/email.service";
import { nextHostSerial } from "../services/project.service";
import { encKey, dec, ENC } from "../utils/encrypt";

const router = Router();

const PW_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BIZ_NO_REGEX = /^\d{10}$/;
const MOBILE_REGEX = /^01[016789]\d{7,8}$/;

const certUploadDir = path.join(process.cwd(), "uploads", "biz-certs");
fs.mkdirSync(certUploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, certUploadDir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/\s+/g, "_");
      cb(null, `${Date.now()}_${safeName}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("PDF, JPG, PNG 파일만 업로드 가능합니다."));
    }
  },
});

function clientIp(req: any): string {
  return String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "");
}

function generateTempPassword(): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%^&*";
  const all = upper + lower + digits + special;
  const chars = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = 0; i < 4; i++) {
    chars.push(all[Math.floor(Math.random() * all.length)]);
  }
  return chars.sort(() => Math.random() - 0.5).join("");
}

// ── 이메일 인증 코드 발송 ──
router.post("/email-verify/send", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email?.trim() || !EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: "올바른 이메일 주소를 입력해 주세요." });
    return;
  }

  const k = encKey();
  const [dupRows] = await pool.execute(
    `SELECT id FROM hosts WHERE host_email = ${ENC}`,
    [email.trim(), k],
  );
  if (Array.isArray(dupRows) && dupRows.length > 0) {
    res.status(400).json({ error: "이미 등록된 이메일입니다." });
    return;
  }

  const [recentRows] = await pool.execute(
    "SELECT id FROM host_email_verify_codes WHERE email = ? AND used = 0 AND expires_at > NOW() AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)",
    [email.trim()],
  );
  if (Array.isArray(recentRows) && recentRows.length > 0) {
    res.status(429).json({ error: "1분 후 다시 시도해 주세요." });
    return;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await pool.execute(
    "INSERT INTO host_email_verify_codes (email, code, expires_at) VALUES (?, ?, ?)",
    [email.trim(), code, expires],
  );

  try { await sendEmailVerifyCode(email.trim(), code); } catch (_) {}

  res.json({ ok: true, message: "인증코드가 발송되었습니다." });
});

// ── 이메일 인증 코드 확인 ──
router.post("/email-verify/check", async (req, res) => {
  const { email, code } = req.body as { email?: string; code?: string };
  if (!email?.trim() || !code?.trim()) {
    res.status(400).json({ error: "이메일과 인증코드를 입력해 주세요." });
    return;
  }

  const [rows] = await pool.execute(
    "SELECT id FROM host_email_verify_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1",
    [email.trim(), code.trim()],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "인증코드가 올바르지 않거나 만료되었습니다." });
    return;
  }

  await pool.execute("UPDATE host_email_verify_codes SET used = 1 WHERE id = ?", [(rows[0] as any).id]);
  req.session.emailVerified = email.trim();
  res.json({ ok: true });
});

// ── 회원가입 ──
router.post("/register", upload.single("biz_cert"), async (req, res) => {
  const {
    host_name, host_email, password,
    organization_name, biz_no,
    mobile_phone, phone,
    address_zip, address1, address2,
  } = req.body as Record<string, string>;
  const certFile = req.file;

  if (!host_name?.trim()) { res.status(400).json({ error: "담당자명을 입력해 주세요." }); return; }
  if (!host_email?.trim() || !EMAIL_REGEX.test(host_email)) { res.status(400).json({ error: "올바른 이메일 주소를 입력해 주세요." }); return; }
  if (req.session.emailVerified !== host_email.trim()) { res.status(400).json({ error: "이메일 인증을 완료해 주세요." }); return; }
  if (!organization_name?.trim()) { res.status(400).json({ error: "소속기관명을 입력해 주세요." }); return; }
  if (!biz_no?.trim() || !BIZ_NO_REGEX.test(biz_no.replace(/-/g, ""))) { res.status(400).json({ error: "사업자등록번호는 10자리 숫자로 입력해 주세요." }); return; }
  if (!mobile_phone?.trim() || !MOBILE_REGEX.test(mobile_phone.replace(/-/g, ""))) { res.status(400).json({ error: "올바른 모바일폰 번호를 입력해 주세요." }); return; }
  if (!address1?.trim()) { res.status(400).json({ error: "주소를 입력해 주세요." }); return; }
  if (!password) { res.status(400).json({ error: "비밀번호를 입력해 주세요." }); return; }
  if (!PW_REGEX.test(password)) { res.status(400).json({ error: "비밀번호는 대소문자·숫자·특수문자를 포함한 8자 이상이어야 합니다." }); return; }

  const k = encKey();
  const bizNoDigits = biz_no.replace(/-/g, "");

  const [dupRows] = await pool.execute(
    `SELECT id FROM hosts WHERE host_email = ${ENC}`,
    [host_email.trim(), k],
  );
  if (Array.isArray(dupRows) && dupRows.length > 0) {
    res.status(400).json({ error: "이미 등록된 이메일입니다." });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const connection = await pool.getConnection();
  let hostId = 0;
  let hostSerial = "";
  try {
    await connection.beginTransaction();
    hostSerial = await nextHostSerial(connection, new Date());
    const [result] = await connection.execute(
      `INSERT INTO hosts
       (host_serial, host_name, host_email, mobile_phone, phone,
        organization_name, biz_no, biz_cert_path, biz_cert_name,
        address_zip, address1, address2,
        password_hash, status)
       VALUES (?, ${ENC}, ${ENC}, ${ENC}, ${ENC}, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        hostSerial,
        host_name.trim(), k,
        host_email.trim(), k,
        mobile_phone.trim(), k,
        phone?.trim() || null, k,
        organization_name.trim(),
        bizNoDigits,
        certFile?.path ?? null,
        certFile?.originalname ?? null,
        address_zip?.trim() || null,
        address1.trim(),
        address2?.trim() || null,
        hash,
      ],
    ) as any;
    hostId = Number(result.insertId);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  req.session.emailVerified = undefined;

  try { await sendHostRegistrationEmail(host_email.trim(), host_name.trim(), hostId); } catch (_) {}
  try {
    await sendSupervisorNewHostNotification({
      hostName: host_name.trim(),
      hostEmail: host_email.trim(),
      organizationName: organization_name.trim(),
      bizNo: bizNoDigits,
      hostId,
      hostSerial,
    });
  } catch (_) {}

  res.json({
    ok: true,
    message: "가입 신청이 완료되었습니다.\n승인 요청 메일이 관리자에게 발송되었습니다.\n관리자 승인 후 로그인할 수 있습니다.",
  });
});

// ── 로그인 ──
router.post("/login", async (req, res) => {
  const { host_email, password } = req.body as { host_email?: string; password?: string };
  if (!host_email || !password) {
    res.status(400).json({ error: "이메일과 비밀번호를 입력해 주세요." });
    return;
  }

  const k = encKey();
  const [rows] = await pool.execute(
    `SELECT id, host_serial, ${dec("host_name")}, ${dec("host_email")}, organization_name,
            password_hash, status, project_locked,
            password_reset_required, last_login_ip, last_logout_at
     FROM hosts WHERE host_email = ${ENC}`,
    [k, k, host_email.trim(), k],
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
    return;
  }

  const host = rows[0] as any;
  const ok = await bcrypt.compare(password, String(host.password_hash));
  if (!ok) {
    res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
    return;
  }

  if (host.status === "pending")    { res.status(403).json({ error: "관리자 승인 대기 중입니다." }); return; }
  if (host.status === "cancelled")  { res.status(403).json({ error: "가입이 취소된 계정입니다." }); return; }
  if (host.status === "terminated") { res.status(403).json({ error: "종료된 계정입니다." }); return; }
  if (host.status === "locked")     { res.status(403).json({ error: "잠긴 계정입니다. 관리자에게 문의하세요." }); return; }

  req.session.host = {
    id: Number(host.id),
    host_serial: String(host.host_serial || ""),
    name: String(host.host_name),
    email: String(host.host_email),
    organization_name: host.organization_name ? String(host.organization_name) : "",
  };
  req.session.lastActivity = Date.now();

  const ip = clientIp(req);
  await pool.execute("UPDATE hosts SET last_login_ip = ?, last_login_at = NOW() WHERE id = ?", [ip, host.id]);
  await pool.execute(
    "INSERT INTO login_histories (user_type, user_id, login_ip, session_id) VALUES ('host', ?, ?, ?)",
    [String(host.id), ip, req.sessionID],
  );

  res.json({
    ok: true,
    host: req.session.host,
    resetRequired: Number(host.password_reset_required) === 1,
    prevIp: host.last_login_ip,
    prevLogoutAt: host.last_logout_at,
    projectLocked: Number(host.project_locked) === 1,
  });
});

// ── 로그아웃 ──
router.post("/logout", requireHost, async (req, res) => {
  const hostId = req.session.host?.id;
  await pool.execute("UPDATE login_histories SET logout_at = NOW() WHERE session_id = ? AND logout_at IS NULL", [req.sessionID]);
  if (hostId) {
    await pool.execute("UPDATE hosts SET last_logout_at = NOW() WHERE id = ?", [hostId]);
  }
  req.session.destroy(() => {});
  res.json({ ok: true });
});

// ── 세션 확인 ──
router.get("/me", requireHost, (req, res) => {
  res.json({ ok: true, host: req.session.host });
});

// ── 비밀번호 분실 ──
router.post("/forgot-password", async (req, res) => {
  const { host_email } = req.body as { host_email?: string };
  if (!host_email) {
    res.status(400).json({ error: "이메일을 입력해 주세요." });
    return;
  }

  const k = encKey();
  const [rows] = await pool.execute(
    `SELECT id, ${dec("host_name")}, status FROM hosts WHERE host_email = ${ENC}`,
    [k, host_email.trim(), k],
  );

  const msg = { ok: true, message: "입력하신 이메일과 일치하는 계정이 있으면 임시 비밀번호가 발송됩니다." };
  if (!Array.isArray(rows) || rows.length === 0) { res.json(msg); return; }

  const host = rows[0] as any;
  if (host.status !== "approved") { res.json(msg); return; }

  const tempPw = generateTempPassword();
  const hash = await bcrypt.hash(tempPw, 12);
  await pool.execute(
    "UPDATE hosts SET password_hash = ?, password_reset_required = 1 WHERE id = ?",
    [hash, host.id],
  );

  try { await sendHostTempPasswordEmail(host_email.trim(), String(host.host_name), tempPw, Number(host.id)); } catch (_) {}

  res.json(msg);
});

// ── 비밀번호 재설정 ──
router.post("/reset-password", requireHost, async (req, res) => {
  const { current_password, new_password } = req.body as {
    current_password?: string;
    new_password?: string;
  };

  if (!current_password || !new_password) {
    res.status(400).json({ error: "현재 비밀번호와 새 비밀번호를 모두 입력해 주세요." });
    return;
  }
  if (!PW_REGEX.test(new_password)) {
    res.status(400).json({ error: "새 비밀번호는 대소문자·숫자·특수문자를 포함한 8자 이상이어야 합니다." });
    return;
  }

  const hostId = req.session.host!.id;
  const [rows] = await pool.execute("SELECT password_hash FROM hosts WHERE id = ?", [hostId]);
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(404).json({ error: "계정을 찾을 수 없습니다." });
    return;
  }

  const ok = await bcrypt.compare(current_password, String((rows[0] as any).password_hash));
  if (!ok) {
    res.status(400).json({ error: "현재 비밀번호가 올바르지 않습니다." });
    return;
  }

  const newHash = await bcrypt.hash(new_password, 12);
  await pool.execute(
    "UPDATE hosts SET password_hash = ?, password_reset_required = 0 WHERE id = ?",
    [newHash, hostId],
  );

  res.json({ ok: true, message: "비밀번호가 변경되었습니다." });
});

// ── 기본 정보 조회 ──
router.get("/profile", requireHost, async (req, res) => {
  const hostId = req.session.host!.id;
  const k = encKey();
  const [rows] = await pool.execute(
    `SELECT host_serial, ${dec("host_name")}, ${dec("host_email")}, ${dec("mobile_phone")}, ${dec("phone")},
            organization_name, biz_no, address_zip, address1, address2
     FROM hosts WHERE id = ?`,
    [k, k, k, k, hostId],
  );
  const h = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!h) { res.status(404).json({ error: "계정을 찾을 수 없습니다." }); return; }
  res.json({
    ok: true,
    profile: {
      host_name: h.host_name, host_email: h.host_email,
      host_serial: h.host_serial,
      mobile_phone: h.mobile_phone, phone: h.phone,
      organization_name: h.organization_name, biz_no: h.biz_no,
      address_zip: h.address_zip, address1: h.address1, address2: h.address2,
    },
  });
});

// ── 기본 정보 수정 (이메일·사업자번호는 변경 불가) ──
router.put("/profile", requireHost, async (req, res) => {
  const hostId = req.session.host!.id;
  const { host_name, organization_name, mobile_phone, phone, address_zip, address1, address2,
          current_password, new_password } = req.body as Record<string, string>;

  if (!host_name?.trim()) { res.status(400).json({ error: "담당자명을 입력해 주세요." }); return; }
  if (!organization_name?.trim()) { res.status(400).json({ error: "소속기관명을 입력해 주세요." }); return; }
  const mobileDigits = (mobile_phone || "").replace(/[^0-9]/g, "");
  if (!MOBILE_REGEX.test(mobileDigits)) { res.status(400).json({ error: "올바른 모바일폰 번호를 입력해 주세요." }); return; }
  const phoneDigits = (phone || "").replace(/[^0-9]/g, "");

  // ── 본인 확인: 현재 비밀번호 검증 (담당자 확인 절차) ──
  if (!current_password) { res.status(400).json({ error: "본인 확인을 위해 현재 비밀번호를 입력해 주세요." }); return; }
  const [pwRows] = await pool.execute("SELECT password_hash FROM hosts WHERE id = ?", [hostId]);
  if (!Array.isArray(pwRows) || pwRows.length === 0) { res.status(404).json({ error: "계정을 찾을 수 없습니다." }); return; }
  const pwOk = await bcrypt.compare(current_password, String((pwRows[0] as any).password_hash));
  if (!pwOk) { res.status(400).json({ error: "현재 비밀번호가 올바르지 않습니다." }); return; }

  // 새 비밀번호 변경(선택)
  let newHash: string | null = null;
  if (new_password) {
    if (!PW_REGEX.test(new_password)) { res.status(400).json({ error: "새 비밀번호는 대소문자·숫자·특수문자를 포함한 8자 이상이어야 합니다." }); return; }
    newHash = await bcrypt.hash(new_password, 12);
  }

  const k = encKey();
  const setParts = [
    `host_name = ${ENC}`, `organization_name = ?`, `mobile_phone = ${ENC}`, `phone = ${ENC}`,
    `address_zip = ?`, `address1 = ?`, `address2 = ?`,
  ];
  const params: Array<string | null> = [
    host_name.trim(), k, organization_name.trim(), mobileDigits, k, (phoneDigits || null), k,
    (address_zip?.trim() || null), (address1?.trim() || null), (address2?.trim() || null),
  ];
  if (newHash) { setParts.push("password_hash = ?", "password_reset_required = 0"); params.push(newHash); }
  setParts.push("updated_at = NOW()");
  params.push(String(hostId));

  await pool.execute(`UPDATE hosts SET ${setParts.join(", ")} WHERE id = ?`, params);

  req.session.host!.name = host_name.trim();
  req.session.host!.organization_name = organization_name.trim();
  res.json({ ok: true, message: newHash ? "기본 정보와 비밀번호가 저장되었습니다." : "기본 정보가 저장되었습니다." });
});

export default router;
