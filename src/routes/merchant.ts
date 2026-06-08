import path from "node:path";
import fs from "node:fs";
import { Router } from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import pool from "../config/database";
import { requireMerchant } from "../middleware/auth";
import {
  sendEmailVerifyCode,
  sendMerchantRegistrationEmail,
  sendSupervisorNewMerchantNotification,
  sendHostNewApplicationEmail,
  sendMerchantTempPasswordEmail,
} from "../services/email.service";
import { encKey, dec, ENC } from "../utils/encrypt";
import { publicBaseUrl } from "../services/qr.service";

const router = Router();

const PW_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BIZ_NO_REGEX = /^\d{10}$/;
const MOBILE_REGEX = /^01[016789]\d{7,8}$/;
const PHONE_REGEX = /^(02\d{7,8}|0[3-9]\d{8,9})$/;

// 은행 코드(금융기관 표준코드) → 은행명
export const BANKS: Record<string, string> = {
  "002": "KDB산업은행", "003": "IBK기업은행", "004": "KB국민은행", "007": "수협은행",
  "011": "NH농협은행", "020": "우리은행", "023": "SC제일은행", "027": "한국씨티은행",
  "031": "iM뱅크(대구)", "032": "부산은행", "034": "광주은행", "035": "제주은행",
  "037": "전북은행", "039": "경남은행", "045": "새마을금고", "048": "신협",
  "071": "우체국예금", "081": "하나은행", "088": "신한은행", "089": "케이뱅크",
  "090": "카카오뱅크", "092": "토스뱅크",
};

const docDir = path.join(process.cwd(), "uploads", "merchant-docs");
fs.mkdirSync(docDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, docDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    cb(null, allowed.includes(file.mimetype));
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

// ── 은행 목록(코드/이름) ──
router.get("/banks", (_req, res) => {
  res.json({ ok: true, banks: Object.entries(BANKS).map(([code, name]) => ({ code, name })) });
});

// ── 이메일 인증 코드 발송 ──
router.post("/email-verify/send", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email?.trim() || !EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: "올바른 이메일 주소를 입력해 주세요." });
    return;
  }

  const k = encKey();
  const [dupRows] = await pool.execute(`SELECT id FROM merchants WHERE email = ${ENC}`, [email.trim(), k]);
  if (Array.isArray(dupRows) && dupRows.length > 0) {
    res.status(400).json({ error: "이미 등록된 이메일입니다." });
    return;
  }

  const [recentRows] = await pool.execute(
    "SELECT id FROM merchant_email_verify_codes WHERE email = ? AND used = 0 AND expires_at > NOW() AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)",
    [email.trim()],
  );
  if (Array.isArray(recentRows) && recentRows.length > 0) {
    res.status(429).json({ error: "1분 후 다시 시도해 주세요." });
    return;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await pool.execute(
    "INSERT INTO merchant_email_verify_codes (email, code, expires_at) VALUES (?, ?, ?)",
    [email.trim(), code, expires],
  );

  const actionUrl = `${publicBaseUrl()}/merchant?vmail=${encodeURIComponent(email.trim())}&vcode=${code}`;
  try { await sendEmailVerifyCode(email.trim(), code, actionUrl); } catch (_) {}
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
    "SELECT id FROM merchant_email_verify_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1",
    [email.trim(), code.trim()],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "인증코드가 올바르지 않거나 만료되었습니다." });
    return;
  }
  await pool.execute("UPDATE merchant_email_verify_codes SET used = 1 WHERE id = ?", [(rows[0] as any).id]);
  req.session.merchantEmailVerified = email.trim();
  res.json({ ok: true });
});

// ── 회원가입 ──
router.post(
  "/register",
  upload.fields([{ name: "biz_cert", maxCount: 1 }, { name: "bank_copy", maxCount: 1 }]),
  async (req, res) => {
    const { merchant_name, email, password, biz_no, bank_code, bank_account,
            contact_name, contact_phone, contact_mobile } = req.body as Record<string, string>;
    const files = req.files as { [field: string]: Express.Multer.File[] };
    const bizCert = files?.biz_cert?.[0];
    const bankCopy = files?.bank_copy?.[0];

    if (!merchant_name?.trim()) { res.status(400).json({ error: "가맹점명을 입력해 주세요." }); return; }
    if (!email?.trim() || !EMAIL_REGEX.test(email)) { res.status(400).json({ error: "올바른 이메일 주소를 입력해 주세요." }); return; }
    if (req.session.merchantEmailVerified !== email.trim()) { res.status(400).json({ error: "이메일 인증을 완료해 주세요." }); return; }
    if (!biz_no?.trim() || !BIZ_NO_REGEX.test(biz_no.replace(/-/g, ""))) { res.status(400).json({ error: "사업자등록번호는 10자리 숫자로 입력해 주세요." }); return; }
    if (!contact_name?.trim()) { res.status(400).json({ error: "담당자 이름을 입력해 주세요." }); return; }
    const cmobileDigits = (contact_mobile || "").replace(/[^0-9]/g, "");
    if (!cmobileDigits) { res.status(400).json({ error: "담당자 모바일을 입력해 주세요." }); return; }
    if (!MOBILE_REGEX.test(cmobileDigits)) { res.status(400).json({ error: "올바른 담당자 휴대폰 번호를 입력해 주세요." }); return; }
    const cphoneDigits = (contact_phone || "").replace(/[^0-9]/g, "");
    if (cphoneDigits && !PHONE_REGEX.test(cphoneDigits)) { res.status(400).json({ error: "담당자 연락처(일반전화) 형식이 올바르지 않습니다." }); return; }
    if (!bizCert) { res.status(400).json({ error: "사업자등록증을 첨부해 주세요." }); return; }
    if (!bank_code || !BANKS[bank_code]) { res.status(400).json({ error: "은행을 선택해 주세요." }); return; }
    if (!bank_account?.trim()) { res.status(400).json({ error: "은행계좌번호를 입력해 주세요." }); return; }
    if (!bankCopy) { res.status(400).json({ error: "은행계좌사본을 첨부해 주세요." }); return; }
    if (!password) { res.status(400).json({ error: "비밀번호를 입력해 주세요." }); return; }
    if (!PW_REGEX.test(password)) { res.status(400).json({ error: "비밀번호는 대소문자·숫자·특수문자를 포함한 8자 이상이어야 합니다." }); return; }

    const k = encKey();
    const bizNoDigits = biz_no.replace(/-/g, "");

    const [dupRows] = await pool.execute(`SELECT id FROM merchants WHERE email = ${ENC}`, [email.trim(), k]);
    if (Array.isArray(dupRows) && dupRows.length > 0) {
      res.status(400).json({ error: "이미 등록된 이메일입니다." });
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    await pool.execute(
      `INSERT INTO merchants
       (merchant_name, contact_name, contact_phone, contact_mobile, email, biz_no, biz_cert_path, biz_cert_name,
        bank_name, bank_code, bank_account, bank_copy_path, bank_copy_name,
        password_hash, status)
       VALUES (${ENC}, ${ENC}, ${ENC}, ${ENC}, ${ENC}, ?, ?, ?, ?, ?, ${ENC}, ?, ?, ?, 'pending')`,
      [
        merchant_name.trim(), k,
        contact_name.trim(), k,
        (contact_phone?.replace(/[^0-9]/g, "") || null), k,
        contact_mobile.replace(/[^0-9]/g, ""), k,
        email.trim(), k,
        bizNoDigits,
        bizCert.path,
        bizCert.originalname,
        BANKS[bank_code],
        bank_code,
        bank_account.trim(), k,
        bankCopy.path,
        bankCopy.originalname,
        hash,
      ],
    );

    req.session.merchantEmailVerified = undefined;

    try { await sendMerchantRegistrationEmail(email.trim(), merchant_name.trim()); } catch (_) {}
    try {
      await sendSupervisorNewMerchantNotification({
        merchantName: merchant_name.trim(),
        email: email.trim(),
        bizNo: bizNoDigits,
        bankName: BANKS[bank_code],
      });
    } catch (_) {}

    res.json({ ok: true, message: "가맹점 가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다." });
  },
);

// ── 로그인 ──
router.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "이메일과 비밀번호를 입력해 주세요." });
    return;
  }

  const k = encKey();
  const [rows] = await pool.execute(
    `SELECT id, ${dec("merchant_name")}, ${dec("email")},
            password_hash, status, password_reset_required, last_login_ip, last_logout_at
     FROM merchants WHERE email = ${ENC}`,
    [k, k, email.trim(), k],
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
    return;
  }
  const merchant = rows[0] as any;
  const ok = await bcrypt.compare(password, String(merchant.password_hash));
  if (!ok) {
    res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
    return;
  }

  if (merchant.status === "pending")    { res.status(403).json({ error: "관리자 승인 대기 중입니다." }); return; }
  if (merchant.status === "cancelled")  { res.status(403).json({ error: "가입이 취소된 계정입니다." }); return; }
  if (merchant.status === "terminated") { res.status(403).json({ error: "종료된 계정입니다." }); return; }
  if (merchant.status === "locked")     { res.status(403).json({ error: "잠긴 계정입니다. 관리자에게 문의하세요." }); return; }

  req.session.merchant = { id: Number(merchant.id), name: String(merchant.merchant_name), email: String(merchant.email) };
  req.session.lastActivity = Date.now();

  const ip = clientIp(req);
  await pool.execute("UPDATE merchants SET last_login_ip = ?, last_login_at = NOW() WHERE id = ?", [ip, merchant.id]);
  await pool.execute(
    "INSERT INTO login_histories (user_type, user_id, login_ip, session_id) VALUES ('merchant', ?, ?, ?)",
    [String(merchant.id), ip, req.sessionID],
  );

  res.json({
    ok: true,
    merchant: req.session.merchant,
    resetRequired: Number(merchant.password_reset_required) === 1,
    prevIp: merchant.last_login_ip,
    prevLogoutAt: merchant.last_logout_at,
  });
});

// ── 로그아웃 ──
router.post("/logout", requireMerchant, async (req, res) => {
  const merchantId = req.session.merchant?.id;
  await pool.execute("UPDATE login_histories SET logout_at = NOW() WHERE session_id = ? AND logout_at IS NULL", [req.sessionID]);
  if (merchantId) {
    await pool.execute("UPDATE merchants SET last_logout_at = NOW() WHERE id = ?", [merchantId]);
  }
  req.session.destroy(() => {});
  res.json({ ok: true });
});

// ── 세션 확인 ──
router.get("/me", requireMerchant, (req, res) => {
  res.json({ ok: true, merchant: req.session.merchant });
});

// ── 비밀번호 분실(임시 비밀번호 발송) ──
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email?.trim()) {
    res.status(400).json({ error: "이메일을 입력해 주세요." });
    return;
  }

  const k = encKey();
  const [rows] = await pool.execute(
    `SELECT id, ${dec("merchant_name")}, ${dec("email")}, status FROM merchants WHERE email = ${ENC}`,
    [k, k, email.trim(), k],
  );

  // 계정 존재 여부를 노출하지 않도록 동일한 안내 메시지를 반환한다.
  const msg = { ok: true, message: "입력하신 이메일과 일치하는 계정이 있으면 임시 비밀번호가 발송됩니다." };
  if (!Array.isArray(rows) || rows.length === 0) { res.json(msg); return; }

  const merchant = rows[0] as any;
  if (merchant.status !== "approved") { res.json(msg); return; }

  const tempPw = generateTempPassword();
  const hash = await bcrypt.hash(tempPw, 12);
  await pool.execute(
    "UPDATE merchants SET password_hash = ?, password_reset_required = 1 WHERE id = ?",
    [hash, merchant.id],
  );

  try { await sendMerchantTempPasswordEmail(String(merchant.email), String(merchant.merchant_name), tempPw); } catch (_) {}

  res.json(msg);
});

// ── 비밀번호 재설정 ──
router.post("/reset-password", requireMerchant, async (req, res) => {
  const { current_password, new_password } = req.body as { current_password?: string; new_password?: string };

  if (!current_password || !new_password) {
    res.status(400).json({ error: "현재 비밀번호와 새 비밀번호를 모두 입력해 주세요." });
    return;
  }
  if (!PW_REGEX.test(new_password)) {
    res.status(400).json({ error: "새 비밀번호는 대소문자·숫자·특수문자를 포함한 8자 이상이어야 합니다." });
    return;
  }

  const merchantId = req.session.merchant!.id;
  const [rows] = await pool.execute("SELECT password_hash FROM merchants WHERE id = ?", [merchantId]);
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
    "UPDATE merchants SET password_hash = ?, password_reset_required = 0 WHERE id = ?",
    [newHash, merchantId],
  );

  res.json({ ok: true, message: "비밀번호가 변경되었습니다." });
});

// ── Gift 결제 모드: 승인된 참여(진행중/시작대기) 프로젝트 목록 ──
router.get("/gift-projects", requireMerchant, async (req, res) => {
  const merchantId = req.session.merchant!.id;
  // 한 가맹점이 한 프로젝트에 여러 유형 승인되어도 한 번만 표시 (QR 스캔으로 유형 구분)
  const [rows] = await pool.execute(
    `SELECT p.id, p.project_name, p.project_serial, p.status, p.gift_amount,
            h.organization_name,
            DATEDIFF(p.to_date, CURDATE()) AS remaining_days,
            (SELECT GROUP_CONCAT(pa.support_type ORDER BY pa.support_type SEPARATOR ',')
             FROM project_applications pa
             WHERE pa.project_id = p.id AND pa.merchant_id = ? AND pa.status='approved') AS approved_types
     FROM projects p
     JOIN hosts h ON h.id = p.host_id
     WHERE EXISTS (
       SELECT 1 FROM project_applications pa2
       WHERE pa2.project_id = p.id AND pa2.merchant_id = ? AND pa2.status='approved'
     )
     AND p.status = 'started'
     ORDER BY p.from_date DESC, p.id DESC`,
    [merchantId, merchantId],
  );
  res.json({ ok: true, data: Array.isArray(rows) ? rows : [] });
});

// ── Gift 증정: 가맹점이 방문자 휴대폰번호로 직접 증정(grant) 처리 ──
router.post("/gift-grant", requireMerchant, async (req, res) => {
  const merchantId = req.session.merchant!.id;
  const { project_id, phone } = req.body as { project_id?: number | string; phone?: string };
  const pid = Number(project_id);
  const digits = String(phone ?? "").replace(/[^0-9]/g, "");

  if (!pid || Number.isNaN(pid)) { res.status(400).json({ error: "프로젝트가 올바르지 않습니다." }); return; }
  if (!MOBILE_REGEX.test(digits)) { res.status(400).json({ error: "올바른 휴대폰 번호를 입력해 주세요. (예: 010-1234-5678)" }); return; }

  // 가맹점이 승인된 진행 프로젝트인지 확인 + 단가 조회
  const [projRows] = await pool.execute(
    `SELECT p.id, p.gift_amount
     FROM projects p
     JOIN project_applications pa ON pa.project_id = p.id AND pa.merchant_id = ?
     WHERE p.id = ? AND pa.status = 'approved' AND p.status IN ('ready_to_start','started')`,
    [merchantId, pid],
  );
  const project = (Array.isArray(projRows) ? projRows[0] : null) as any;
  if (!project) { res.status(404).json({ error: "증정할 수 없는 프로젝트입니다." }); return; }
  const amount = Number(project.gift_amount);

  // 방문자(프로젝트+휴대폰) 없으면 생성
  await pool.execute("INSERT IGNORE INTO visitors (project_id, phone) VALUES (?, ?)", [pid, digits]);
  const [visRows] = await pool.execute("SELECT id FROM visitors WHERE project_id = ? AND phone = ?", [pid, digits]);
  if (!Array.isArray(visRows) || visRows.length === 0) { res.status(500).json({ error: "방문자 정보를 생성하지 못했습니다." }); return; }
  const visitorId = Number((visRows[0] as any).id);

  // 이 프로젝트에 방문 이력이 있으면, 나머지 미방문 Tour도 모두 방문 처리한다.
  let filledVisits = 0;
  const [cntRows] = await pool.execute(
    "SELECT COUNT(*) AS n FROM visitor_visits WHERE project_id = ? AND visitor_id = ?",
    [pid, visitorId],
  );
  const hasHistory = Number((cntRows as any)[0]?.n || 0) > 0;
  if (hasHistory) {
    const [fill] = await pool.execute(
      `INSERT IGNORE INTO visitor_visits (project_id, visitor_id, location_id)
       SELECT ?, ?, pl.id FROM project_locations pl
       WHERE pl.project_id = ? AND pl.disabled = 0`,
      [pid, visitorId, pid],
    );
    filledVisits = Number((fill as any).affectedRows || 0);
  }

  // Gift 증정(grant) 기록 — 가맹점 세션 merchantId 함께 기록
  await pool.execute(
    "INSERT INTO gift_redemptions (project_id, visitor_id, merchant_id, redemption_type, amount, eligible, redeemed_at) VALUES (?, ?, ?, 'grant', ?, 1, NOW())",
    [pid, visitorId, merchantId, amount],
  );

  res.json({
    ok: true,
    amount,
    filledVisits,
    message: filledVisits > 0
      ? `Gift가 증정 처리되었습니다. (미방문 ${filledVisits}곳 방문 완료 처리)`
      : "Gift가 증정 처리되었습니다.",
  });
});

// ── 기본 정보 조회 ──
router.get("/profile", requireMerchant, async (req, res) => {
  const merchantId = req.session.merchant!.id;
  const k = encKey();
  const [rows] = await pool.execute(
    `SELECT ${dec("merchant_name")}, ${dec("contact_name")}, ${dec("contact_phone")}, ${dec("contact_mobile")},
            ${dec("email")}, ${dec("bank_account")}, biz_no, bank_name, bank_code,
            address_zip, address1, address2
     FROM merchants WHERE id = ?`,
    [k, k, k, k, k, k, merchantId],
  );
  const m = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!m) { res.status(404).json({ error: "계정을 찾을 수 없습니다." }); return; }
  res.json({
    ok: true,
    profile: {
      merchant_name: m.merchant_name, contact_name: m.contact_name,
      contact_phone: m.contact_phone, contact_mobile: m.contact_mobile,
      email: m.email, biz_no: m.biz_no,
      bank_name: m.bank_name, bank_code: m.bank_code, bank_account: m.bank_account,
      address_zip: m.address_zip, address1: m.address1, address2: m.address2,
    },
  });
});

// ── 기본 정보 수정 (이메일·사업자번호는 변경 불가) ──
router.put("/profile", requireMerchant, async (req, res) => {
  const merchantId = req.session.merchant!.id;
  const { merchant_name, contact_name, contact_phone, contact_mobile, bank_code, bank_account,
          address_zip, address1, address2, current_password, new_password } = req.body as Record<string, string>;

  if (!merchant_name?.trim()) { res.status(400).json({ error: "가맹점명을 입력해 주세요." }); return; }
  if (!contact_name?.trim()) { res.status(400).json({ error: "담당자 이름을 입력해 주세요." }); return; }
  const cmobile = (contact_mobile || "").replace(/[^0-9]/g, "");
  if (!MOBILE_REGEX.test(cmobile)) { res.status(400).json({ error: "올바른 담당자 휴대폰 번호를 입력해 주세요." }); return; }
  const cphone = (contact_phone || "").replace(/[^0-9]/g, "");
  if (cphone && !PHONE_REGEX.test(cphone)) { res.status(400).json({ error: "담당자 연락처(일반전화) 형식이 올바르지 않습니다." }); return; }
  if (!bank_code || !BANKS[bank_code]) { res.status(400).json({ error: "은행을 선택해 주세요." }); return; }
  if (!bank_account?.trim()) { res.status(400).json({ error: "은행계좌번호를 입력해 주세요." }); return; }

  // ── 본인 확인: 현재 비밀번호 검증 (담당자 확인 절차) ──
  if (!current_password) { res.status(400).json({ error: "본인 확인을 위해 현재 비밀번호를 입력해 주세요." }); return; }
  const [pwRows] = await pool.execute("SELECT password_hash FROM merchants WHERE id = ?", [merchantId]);
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
    `merchant_name = ${ENC}`, `contact_name = ${ENC}`, `contact_phone = ${ENC}`, `contact_mobile = ${ENC}`,
    `bank_name = ?`, `bank_code = ?`, `bank_account = ${ENC}`,
    `address_zip = ?`, `address1 = ?`, `address2 = ?`,
  ];
  const params: Array<string | null> = [
    merchant_name.trim(), k, contact_name.trim(), k, (cphone || null), k, cmobile, k,
    BANKS[bank_code], bank_code, bank_account.trim(), k,
    (address_zip?.trim() || null), (address1?.trim() || null), (address2?.trim() || null),
  ];
  if (newHash) { setParts.push("password_hash = ?", "password_reset_required = 0"); params.push(newHash); }
  setParts.push("updated_at = NOW()");
  params.push(String(merchantId));

  await pool.execute(`UPDATE merchants SET ${setParts.join(", ")} WHERE id = ?`, params);

  req.session.merchant!.name = merchant_name.trim();
  res.json({ ok: true, message: newHash ? "기본 정보와 비밀번호가 저장되었습니다." : "기본 정보가 저장되었습니다." });
});

// ── 프로젝트 목록 + 내 지원상태 ──
//  - 시작대기/진행중: 전체 노출
//  - 종료: 이 가맹점이 지원한 적 있는 프로젝트만 노출(전체 종료 프로젝트가 아님)
router.get("/projects", requireMerchant, async (req, res) => {
  const merchantId = req.session.merchant!.id;
  const { project_name = "", organization = "", status = "", applied = "" } = req.query as Record<string, string>;

  let where = "WHERE (p.status IN ('ready_to_start','started') OR (p.status = 'completed' AND EXISTS (SELECT 1 FROM project_applications pa WHERE pa.project_id = p.id AND pa.merchant_id = ?)))";
  const params: Array<string | number> = [merchantId];

  if (project_name.trim()) { where += " AND p.project_name LIKE ?"; params.push(`%${project_name.trim()}%`); }
  if (organization.trim()) { where += " AND h.organization_name LIKE ?"; params.push(`%${organization.trim()}%`); }
  if (["ready_to_start", "started", "completed"].includes(status)) { where += " AND p.status = ?"; params.push(status); }
  if (applied === "y") where += " AND EXISTS (SELECT 1 FROM project_applications pa2 WHERE pa2.project_id = p.id AND pa2.merchant_id = ?)";
  else if (applied === "n") where += " AND NOT EXISTS (SELECT 1 FROM project_applications pa3 WHERE pa3.project_id = p.id AND pa3.merchant_id = ?)";
  if (applied === "y" || applied === "n") params.push(merchantId);

  const [rows] = await pool.execute(
    `SELECT p.id, p.project_name, p.project_serial, p.status, p.from_date, p.to_date,
            p.gift_amount, p.gift_qty, h.organization_name,
            p.reservation_use, p.reservation_benefit_amount,
            p.entry_use, p.entry_benefit_amount,
            p.tour_use, p.quiz_use, p.survey_use, p.survey_reward_use,
            DATEDIFF(p.to_date, CURDATE()) AS remaining_days
     FROM projects p
     JOIN hosts h ON h.id = p.host_id
     ${where}
     ORDER BY FIELD(p.status, 'started', 'ready_to_start', 'completed'), p.from_date DESC, p.id DESC`,
    params,
  );

  // 각 프로젝트별 가맹점의 유형별 신청 상태 + PIN 매핑
  const projects = Array.isArray(rows) ? (rows as any[]) : [];
  if (projects.length > 0) {
    const ids = projects.map(p => p.id);
    const placeholders = ids.map(() => "?").join(",");
    const [appRows] = await pool.execute(
      `SELECT pa.project_id, pa.support_type, pa.status, pa.applied_at, pa.decided_at,
              fn_decrypt(p.pin_enc, ?) AS pin_code
       FROM project_applications pa
       JOIN projects p ON p.id = pa.project_id
       WHERE pa.merchant_id = ? AND pa.project_id IN (${placeholders})`,
      [encKey(), merchantId, ...ids],
    );
    const byProj = new Map<number, any[]>();
    for (const r of (Array.isArray(appRows) ? appRows : []) as any[]) {
      if (!byProj.has(r.project_id)) byProj.set(r.project_id, []);
      byProj.get(r.project_id)!.push(r);
    }
    for (const p of projects) {
      const apps = byProj.get(p.id) || [];
      p.applications = apps.map(a => ({
        support_type: a.support_type, status: a.status,
        applied_at: a.applied_at, decided_at: a.decided_at,
      }));
      // 승인된 유형이 1개라도 있으면 PIN 노출
      const approved = apps.find(a => a.status === "approved");
      p.pin_code = approved ? approved.pin_code : null;
      // 모든 가능 유형이 approved 인지 — 지원 버튼 활성 여부 결정
      const possible: string[] = [];
      if (Number(p.tour_use) === 1) possible.push("tour");
      if (Number(p.quiz_use) === 1) possible.push("quiz");
      if (Number(p.reservation_use) === 1) possible.push("reservation");
      if (Number(p.entry_use) === 1) possible.push("entry");
      if (Number(p.survey_reward_use) === 1) possible.push("survey_reward");
      const approvedSet = new Set(apps.filter(a => a.status === "approved").map(a => a.support_type));
      p.all_approved = possible.length > 0 && possible.every(t => approvedSet.has(t));
      p.has_any_application = apps.length > 0;
      // 마지막 신청 상태 (호환성용)
      p.application_status = apps.length > 0
        ? (apps.find(a => a.status === "pending")?.status || apps[0].status)
        : null;
    }
  }

  res.json({ ok: true, data: projects });
});

// ── 프로젝트: 조회조건 전체 엑셀 다운로드 (파일명: 소속기관_프로젝트일련번호) ──
router.get("/projects/export", requireMerchant, async (req, res) => {
  const merchantId = req.session.merchant!.id;
  const { project_name = "", organization = "", status = "", applied = "" } = req.query as Record<string, string>;

  let where = "WHERE (p.status IN ('ready_to_start','started') OR (p.status = 'completed' AND pa.id IS NOT NULL))";
  const params: Array<string | number> = [merchantId];
  if (project_name.trim()) { where += " AND p.project_name LIKE ?"; params.push(`%${project_name.trim()}%`); }
  if (organization.trim()) { where += " AND h.organization_name LIKE ?"; params.push(`%${organization.trim()}%`); }
  if (["ready_to_start", "started", "completed"].includes(status)) { where += " AND p.status = ?"; params.push(status); }
  if (applied === "y") where += " AND pa.id IS NOT NULL";
  else if (applied === "n") where += " AND pa.id IS NULL";

  const [rows] = await pool.execute(
    `SELECT p.project_serial, p.project_name, p.status, p.from_date, p.to_date, p.gift_amount,
            h.organization_name, DATEDIFF(p.to_date, CURDATE()) AS remaining_days,
            pa.status AS application_status
     FROM projects p
     JOIN hosts h ON h.id = p.host_id
     LEFT JOIN project_applications pa ON pa.project_id = p.id AND pa.merchant_id = ?
     ${where}
     ORDER BY FIELD(p.status, 'started', 'ready_to_start', 'completed'), p.from_date DESC, p.id DESC`,
    params,
  );
  const list = Array.isArray(rows) ? (rows as any[]) : [];

  const STATUS_KO: Record<string, string> = { ready_to_start: "시작대기", started: "진행중", completed: "종료" };
  const APP_KO: Record<string, string> = { pending: "지원중", approved: "승인", rejected: "거절" };
  const d10 = (v: any) => (v ? String(v).slice(0, 10) : "");
  const remainLabel = (p: any) => {
    if (p.status === "completed") return "종료";
    if (p.remaining_days == null) return "-";
    return Number(p.remaining_days) < 0 ? "마감" : `${Number(p.remaining_days)}일`;
  };

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("프로젝트");
  ws.columns = [
    { header: "소속기관", key: "org", width: 22 },
    { header: "프로젝트명", key: "name", width: 26 },
    { header: "일련번호", key: "serial", width: 16 },
    { header: "상태", key: "status", width: 10 },
    { header: "프로젝트 기간", key: "period", width: 24 },
    { header: "잔여일", key: "remain", width: 10 },
    { header: "Gift 단가", key: "gift_amount", width: 12 },
    { header: "지원", key: "applied", width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

  for (const p of list) {
    ws.addRow({
      org: p.organization_name ?? "",
      name: p.project_name,
      serial: p.project_serial,
      status: STATUS_KO[p.status] ?? p.status,
      period: `${d10(p.from_date)} ~ ${d10(p.to_date)}`,
      remain: remainLabel(p),
      gift_amount: Number(p.gift_amount || 0),
      applied: p.application_status ? (APP_KO[p.application_status] ?? p.application_status) : "미지원",
    });
  }
  const gc = ws.getColumn("gift_amount"); gc.numFmt = "#,##0"; gc.alignment = { horizontal: "right" };

  // 파일명: 소속기관_프로젝트일련번호 (다건이면 첫(상단) 행 기준)
  const first = list[0] || {};
  const fnameBase = `${first.organization_name || "merchant"}_${first.project_serial || "projects"}`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fnameBase)}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
});

// ── 사전등록/현장등록 QR 스캔 — 가맹점 조회 ──
router.get("/reservation/:token", requireMerchant, async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) { res.status(400).json({ ok:false, error:"missing_token" }); return; }
  const [rows] = await pool.execute(
    `SELECT r.id, r.project_id, r.mode, r.status, r.amount, r.email_lower, r.fields_json,
            r.activated_at, r.used_at, r.created_at,
            p.project_name, p.project_serial
     FROM reservations r
     JOIN projects p ON p.id = r.project_id
     WHERE r.token = ?`, [token],
  );
  const r = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!r) { res.status(404).json({ ok:false, error:"reservation_not_found", message:"유효하지 않은 QR 입니다." }); return; }
  let fields: any = {};
  try { fields = r.fields_json ? JSON.parse(r.fields_json) : {}; } catch {}
  res.json({
    ok: true,
    reservation: {
      id: r.id, project_id: r.project_id,
      project_name: r.project_name, project_serial: r.project_serial,
      mode: r.mode, status: r.status, amount: Number(r.amount || 0),
      fields,
      activated_at: r.activated_at,
      used_at: r.used_at,
      applied_at: r.created_at,
    },
  });
});

// ── 사전등록/현장등록 QR 사용 처리 — PIN + 지원 유형 검증 ──
router.post("/reservation/:token/use", requireMerchant, async (req, res) => {
  const merchant = req.session.merchant!;
  const token = String(req.params.token || "").trim();
  const pin = String((req.body || {}).pin || "").trim();
  if (!token) { res.status(400).json({ ok:false, error:"missing_token" }); return; }
  if (!/^\d{6}$/.test(pin)) { res.status(400).json({ ok:false, error:"invalid_pin", message:"비밀번호는 숫자 6자리입니다." }); return; }
  // reservation + project 조회
  const [rrs] = await pool.execute(
    `SELECT r.id, r.project_id, r.mode, r.status, r.amount, r.fields_json,
            p.pin_hash, p.project_name
     FROM reservations r JOIN projects p ON p.id = r.project_id
     WHERE r.token = ?`, [token],
  );
  const rec = (Array.isArray(rrs) ? rrs[0] : null) as any;
  if (!rec) { res.status(404).json({ ok:false, error:"reservation_not_found", message:"유효하지 않은 QR 입니다." }); return; }
  if (rec.status === "used") { res.status(409).json({ ok:false, error:"already_used", message:"이미 사용된 QR 입니다." }); return; }
  // PIN 검증 (프로젝트 비밀번호)
  const pinOk = await bcrypt.compare(pin, String(rec.pin_hash || ""));
  if (!pinOk) { res.status(400).json({ ok:false, error:"invalid_pin", message:"비밀번호가 일치하지 않습니다." }); return; }
  // 가맹점 지원 유형 검증 — 해당 mode 가 approved 인지
  const requiredType = rec.mode === "reservation" ? "reservation" : "entry";
  const [appRows] = await pool.execute(
    `SELECT id FROM project_applications
     WHERE project_id = ? AND merchant_id = ? AND support_type = ? AND status='approved'`,
    [rec.project_id, merchant.id, requiredType],
  );
  if (!Array.isArray(appRows) || appRows.length === 0) {
    const label = requiredType === "reservation" ? "사전등록" : "현장등록";
    res.status(403).json({ ok:false, error:"support_type_mismatch",
      message:`지원하지 않는 혜택 유형의 QR 코드입니다. (귀 가맹점은 '${label}' 유형 승인을 받지 않았습니다.) QR 코드를 승인해 줄 수 없습니다.` });
    return;
  }
  // 동시 사용 방지: pending|activated 상태일 때만 used 로 전환
  const [upd] = await pool.execute(
    `UPDATE reservations SET status = 'used', used_at = NOW(), used_by_merchant_id = ?
     WHERE id = ? AND status IN ('pending','activated')`,
    [merchant.id, rec.id],
  );
  if ((upd as any).affectedRows === 0) {
    res.status(409).json({ ok:false, error:"already_used", message:"이미 사용된 QR 입니다." });
    return;
  }
  // gift_redemptions 에 'normal' 사용내역 기록 (정산 집계용) — visitor 매핑은 fields_json.mobile 로 phone 매칭
  try {
    let mobile = "";
    try {
      const f = rec.fields_json ? JSON.parse(rec.fields_json) : {};
      mobile = String(f.mobile || "").replace(/\D/g, "");
    } catch {}
    let visitorId: number | null = null;
    if (mobile) {
      const [vRows] = await pool.execute(
        `SELECT id FROM visitors WHERE project_id = ? AND REPLACE(REPLACE(phone,'-',''),' ','') = ? LIMIT 1`,
        [rec.project_id, mobile],
      );
      if (Array.isArray(vRows) && vRows.length > 0) visitorId = Number((vRows as any)[0].id);
    }
    if (visitorId) {
      await pool.execute(
        `INSERT INTO gift_redemptions (project_id, visitor_id, merchant_id, redemption_type, amount, eligible, redeemed_at)
         VALUES (?, ?, ?, 'normal', ?, 1, NOW())`,
        [rec.project_id, visitorId, merchant.id, Number(rec.amount || 0)],
      );
    }
  } catch (_) { /* 매핑 실패 시 redemption 기록 생략 — 사용처리 자체는 reservation row 에 기록됨 */ }
  res.json({ ok:true, amount: Number(rec.amount || 0), message: "사용 처리되었습니다." });
});

// ── 프로젝트 지원(참여 신청) ──
router.post("/projects/:id/apply", requireMerchant, async (req, res) => {
  const merchant = req.session.merchant!;
  const projectId = Number(req.params.id);

  const [projRows] = await pool.execute(
    "SELECT id, host_id, project_name, project_serial, status, reservation_use, entry_use, tour_use, quiz_use, survey_use, survey_reward_use FROM projects WHERE id = ?",
    [projectId],
  );
  const project = (Array.isArray(projRows) ? projRows[0] : null) as any;
  if (!project) {
    res.status(404).json({ error: "프로젝트를 찾을 수 없습니다." });
    return;
  }
  if (!["ready_to_start", "started"].includes(String(project.status))) {
    res.status(400).json({ error: "지원할 수 없는 프로젝트입니다." });
    return;
  }

  // 지원 유형(support_types) 검증 — 최소 1개 이상 선택 필수
  const incoming = (req.body as any)?.support_types;
  const ALLOWED_TYPES = ["reservation","entry","tour","quiz","survey_reward"];
  const supportTypes = Array.isArray(incoming)
    ? incoming.map(String).filter(s => ALLOWED_TYPES.includes(s))
    : [];
  if (supportTypes.length === 0) {
    res.status(400).json({ error: "support_types_required",
      message: "지원 유형(사전등록 / 현장등록 / Tour / Quiz / 설문경품 중 최소 1개)을 선택해 주세요." });
    return;
  }
  // 프로젝트가 실제로 해당 유형을 사용하지 않으면 차단
  if (supportTypes.includes("reservation") && Number((project as any).reservation_use) !== 1) {
    res.status(400).json({ error: "type_not_available", message: "해당 프로젝트는 사전등록을 사용하지 않습니다." });
    return;
  }
  if (supportTypes.includes("entry") && Number((project as any).entry_use) !== 1) {
    res.status(400).json({ error: "type_not_available", message: "해당 프로젝트는 현장등록을 사용하지 않습니다." });
    return;
  }
  if (supportTypes.includes("tour") && Number((project as any).tour_use) !== 1) {
    res.status(400).json({ error: "type_not_available", message: "해당 프로젝트는 Tour 를 사용하지 않습니다." });
    return;
  }
  if (supportTypes.includes("quiz") && Number((project as any).quiz_use) !== 1) {
    res.status(400).json({ error: "type_not_available", message: "해당 프로젝트는 Quiz 를 사용하지 않습니다." });
    return;
  }
  if (supportTypes.includes("survey_reward") && Number((project as any).survey_reward_use) !== 1) {
    res.status(400).json({ error: "type_not_available", message: "해당 프로젝트는 설문 경품 지급을 사용하지 않습니다." });
    return;
  }

  // 기존 신청 (유형별) — approved 인 유형은 다시 지원 불가, 그 외는 가능
  const [existRows] = await pool.execute(
    "SELECT support_type, status FROM project_applications WHERE project_id = ? AND merchant_id = ?",
    [projectId, merchant.id],
  );
  const existMap = new Map<string, string>();
  for (const r of (Array.isArray(existRows) ? existRows : []) as any[]) {
    existMap.set(String(r.support_type), String(r.status));
  }

  // 유효 유형 필터: 이미 approved 인 유형은 제외, 그 외는 row 갱신/신규 insert
  const insertable: string[] = [];
  const reapply: string[] = [];   // pending/rejected → pending 으로 재신청
  const alreadyApproved: string[] = [];
  for (const t of supportTypes) {
    const cur = existMap.get(t);
    if (cur === "approved") alreadyApproved.push(t);
    else if (cur) reapply.push(t);
    else insertable.push(t);
  }
  if (insertable.length === 0 && reapply.length === 0) {
    res.status(400).json({ error: "all_already_approved",
      message: "선택하신 유형은 이미 모두 승인된 상태입니다." });
    return;
  }
  // INSERT 신규
  for (const t of insertable) {
    await pool.execute(
      "INSERT INTO project_applications (project_id, merchant_id, status, support_type) VALUES (?, ?, 'pending', ?)",
      [projectId, merchant.id, t],
    );
  }
  // UPDATE 재신청 (rejected/pending → pending)
  for (const t of reapply) {
    await pool.execute(
      "UPDATE project_applications SET status='pending', decided_at=NULL, decided_reason=NULL, applied_at=NOW() WHERE project_id = ? AND merchant_id = ? AND support_type = ?",
      [projectId, merchant.id, t],
    );
  }

  // host에게 지원 알림 (실패해도 신청은 성공)
  try {
    const k = encKey();
    const [hostRows] = await pool.execute(
      `SELECT ${dec("host_name")}, ${dec("host_email")} FROM hosts WHERE id = ?`,
      [k, k, project.host_id],
    );
    const host = (Array.isArray(hostRows) ? hostRows[0] : null) as any;
    if (host?.host_email) {
      await sendHostNewApplicationEmail({
        hostEmail: String(host.host_email),
        hostName: String(host.host_name),
        merchantName: merchant.name,
        projectName: String(project.project_name),
        projectSerial: String(project.project_serial),
      });
    }
  } catch (e) {
    console.error("sendHostNewApplicationEmail failed:", e);
  }

  res.json({ ok: true, message: "프로젝트 참여를 신청했습니다. 주최 측 승인 후 안내드립니다." });
});

// ── 정산: 프로젝트별 Gift 사용/증정 집계 (프로젝트 탭과 동일한 가시성/필터) ──
router.get("/settlement", requireMerchant, async (req, res) => {
  const merchantId = req.session.merchant!.id;
  const { project_name = "", organization = "", status = "", applied = "" } = req.query as Record<string, string>;

  let where = "WHERE (p.status IN ('ready_to_start','started') OR (p.status = 'completed' AND pa.id IS NOT NULL))";
  const params: Array<string | number> = [merchantId];

  if (project_name.trim()) { where += " AND p.project_name LIKE ?"; params.push(`%${project_name.trim()}%`); }
  if (organization.trim()) { where += " AND h.organization_name LIKE ?"; params.push(`%${organization.trim()}%`); }
  if (["ready_to_start", "started", "completed"].includes(status)) { where += " AND p.status = ?"; params.push(status); }
  if (applied === "y") where += " AND pa.id IS NOT NULL";
  else if (applied === "n") where += " AND pa.id IS NULL";

  const [rows] = await pool.execute(
    `SELECT p.id, p.project_name, p.project_serial, p.status, p.gift_amount, h.organization_name,
            pa.status AS application_status,
            (SELECT COUNT(*) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.merchant_id = ? AND gr.redemption_type = 'normal') AS used_count,
            (SELECT COALESCE(SUM(gr.amount),0) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.merchant_id = ? AND gr.redemption_type = 'normal') AS used_amount,
            (SELECT COUNT(*) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.merchant_id = ? AND gr.redemption_type = 'grant') AS grant_count,
            (SELECT COALESCE(SUM(gr.amount),0) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.merchant_id = ? AND gr.redemption_type = 'grant') AS grant_amount,
            (SELECT COUNT(DISTINCT gr.visitor_id) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.merchant_id = ? AND gr.redemption_type = 'normal') AS used_users,
            (SELECT COUNT(DISTINCT gr.visitor_id) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.merchant_id = ? AND gr.redemption_type = 'grant') AS grant_users
     FROM projects p
     JOIN hosts h ON h.id = p.host_id
     LEFT JOIN project_applications pa ON pa.project_id = p.id AND pa.merchant_id = ?
     ${where}
     ORDER BY FIELD(p.status, 'started', 'ready_to_start', 'completed'), p.from_date DESC, p.id DESC`,
    [merchantId, merchantId, merchantId, merchantId, merchantId, merchantId, ...params],
  );

  res.json({ ok: true, data: Array.isArray(rows) ? rows : [] });
});

// ── 정산: 조회조건 전체 엑셀 다운로드 ──
router.get("/settlement/export", requireMerchant, async (req, res) => {
  const merchantId = req.session.merchant!.id;
  const { project_name = "", organization = "", status = "", applied = "" } = req.query as Record<string, string>;

  let where = "WHERE (p.status IN ('ready_to_start','started') OR (p.status = 'completed' AND pa.id IS NOT NULL))";
  const params: Array<string | number> = [merchantId];
  if (project_name.trim()) { where += " AND p.project_name LIKE ?"; params.push(`%${project_name.trim()}%`); }
  if (organization.trim()) { where += " AND h.organization_name LIKE ?"; params.push(`%${organization.trim()}%`); }
  if (["ready_to_start", "started", "completed"].includes(status)) { where += " AND p.status = ?"; params.push(status); }
  if (applied === "y") where += " AND pa.id IS NOT NULL";
  else if (applied === "n") where += " AND pa.id IS NULL";

  const [rows] = await pool.execute(
    `SELECT p.project_name, p.project_serial, p.status, p.gift_amount, h.organization_name,
            pa.status AS application_status,
            (SELECT COUNT(*) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.merchant_id = ? AND gr.redemption_type = 'normal') AS used_count,
            (SELECT COALESCE(SUM(gr.amount),0) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.merchant_id = ? AND gr.redemption_type = 'normal') AS used_amount,
            (SELECT COUNT(*) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.merchant_id = ? AND gr.redemption_type = 'grant') AS grant_count,
            (SELECT COALESCE(SUM(gr.amount),0) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.merchant_id = ? AND gr.redemption_type = 'grant') AS grant_amount,
            (SELECT COUNT(DISTINCT gr.visitor_id) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.merchant_id = ? AND gr.redemption_type = 'normal') AS used_users,
            (SELECT COUNT(DISTINCT gr.visitor_id) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.merchant_id = ? AND gr.redemption_type = 'grant') AS grant_users
     FROM projects p
     JOIN hosts h ON h.id = p.host_id
     LEFT JOIN project_applications pa ON pa.project_id = p.id AND pa.merchant_id = ?
     ${where}
     ORDER BY FIELD(p.status, 'started', 'ready_to_start', 'completed'), p.from_date DESC, p.id DESC`,
    [merchantId, merchantId, merchantId, merchantId, merchantId, merchantId, ...params],
  );
  const list = Array.isArray(rows) ? (rows as any[]) : [];

  const STATUS_KO: Record<string, string> = { ready_to_start: "시작대기", started: "진행중", completed: "종료" };
  const APP_KO: Record<string, string> = { pending: "지원중", approved: "승인", rejected: "거절" };
  const n = (v: any) => Number(v || 0);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("정산");
  ws.columns = [
    { header: "소속기관", key: "org", width: 22 },
    { header: "프로젝트명", key: "name", width: 26 },
    { header: "일련번호", key: "serial", width: 16 },
    { header: "프로젝트상태", key: "status", width: 12 },
    { header: "지원여부", key: "applied", width: 10 },
    { header: "Gift 단가", key: "gift_amount", width: 12 },
    { header: "Gift 사용개수", key: "used_count", width: 12 },
    { header: "Gift 증정개수", key: "grant_count", width: 12 },
    { header: "Gift 사용금액", key: "used_amount", width: 14 },
    { header: "Gift 증정금액", key: "grant_amount", width: 14 },
    { header: "총 Gift 금액", key: "total_amount", width: 14 },
    { header: "사용 인원", key: "used_users", width: 10 },
    { header: "증정 인원", key: "grant_users", width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

  for (const p of list) {
    ws.addRow({
      org: p.organization_name ?? "",
      name: p.project_name,
      serial: p.project_serial,
      status: STATUS_KO[p.status] ?? p.status,
      applied: p.application_status ? (APP_KO[p.application_status] ?? p.application_status) : "미지원",
      gift_amount: n(p.gift_amount),
      used_count: n(p.used_count),
      grant_count: n(p.grant_count),
      used_amount: n(p.used_amount),
      grant_amount: n(p.grant_amount),
      total_amount: n(p.used_amount) + n(p.grant_amount),
      used_users: n(p.used_users),
      grant_users: n(p.grant_users),
    });
  }
  ["gift_amount", "used_amount", "grant_amount", "total_amount"].forEach((key) => {
    const col = ws.getColumn(key); col.numFmt = "#,##0"; col.alignment = { horizontal: "right" };
  });

  // 파일명: 소속기관_프로젝트일련번호 (다건이면 첫(상단) 행 기준)
  const first = list[0] || {};
  const fnameBase = `${first.organization_name || "merchant"}_${first.project_serial || "settlement"}`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fnameBase)}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
});

// ── 정산: 특정 프로젝트의 Gift 사용/증정 상세내역 ──
// ── 정산: 인원별 (visitor 단위) 통합 사용 내역 ──
//   유형: gift_use(Tour Gift 사용) · gift_grant(Tour Gift 증정) · reservation(사전등록) · entry(현장등록)
//   ※ Quiz 보너스는 gift_redemptions 에 포함되어 Tour 와 구분 불가
//   ※ 설문경품은 가맹점이 아닌 호스트가 처리하므로 인원별 정산에서 제외
router.get("/settlement/by-person", requireMerchant, async (req, res) => {
  const merchantId = req.session.merchant!.id;
  const { project_name = "", organization = "", status = "" } =
    req.query as Record<string, string>;

  // 1) Gift 사용/증정 — gift_redemptions
  let where1 = "WHERE gr.merchant_id = ?";
  const params1: Array<string | number> = [merchantId];
  if (project_name.trim()) { where1 += " AND p.project_name LIKE ?"; params1.push(`%${project_name.trim()}%`); }
  if (organization.trim()) { where1 += " AND h.organization_name LIKE ?"; params1.push(`%${organization.trim()}%`); }
  if (["ready_to_start","started","completed"].includes(status)) {
    where1 += " AND p.status = ?"; params1.push(status);
  }
  const [giftRows] = await pool.execute(
    `SELECT v.id AS visitor_id, v.phone,
            gr.project_id, p.project_name, p.project_serial, p.status AS project_status,
            h.organization_name,
            gr.redemption_type AS type,
            COUNT(*) AS count, SUM(gr.amount) AS amount,
            MIN(gr.redeemed_at) AS first_at, MAX(gr.redeemed_at) AS last_at
       FROM gift_redemptions gr
       JOIN visitors v ON v.id = gr.visitor_id
       JOIN projects p ON p.id = gr.project_id
       JOIN hosts    h ON h.id = p.host_id
       ${where1}
      GROUP BY v.id, gr.project_id, gr.redemption_type`,
    params1,
  );

  // 2) 사전/현장등록 혜택 사용 — reservations.status='used' AND used_by_merchant_id
  let where2 = "WHERE r.status='used' AND r.used_by_merchant_id = ?";
  const params2: Array<string | number> = [merchantId];
  if (project_name.trim()) { where2 += " AND p.project_name LIKE ?"; params2.push(`%${project_name.trim()}%`); }
  if (organization.trim()) { where2 += " AND h.organization_name LIKE ?"; params2.push(`%${organization.trim()}%`); }
  if (["ready_to_start","started","completed"].includes(status)) {
    where2 += " AND p.status = ?"; params2.push(status);
  }
  const [resvRows] = await pool.execute(
    `SELECT r.fields_json,
            r.project_id, p.project_name, p.project_serial, p.status AS project_status,
            h.organization_name,
            r.mode AS type,
            COUNT(*) AS count, SUM(r.amount) AS amount,
            MIN(r.used_at) AS first_at, MAX(r.used_at) AS last_at
       FROM reservations r
       JOIN projects p ON p.id = r.project_id
       JOIN hosts    h ON h.id = p.host_id
       ${where2}
      GROUP BY r.fields_json, r.project_id, r.mode`,
    params2,
  );

  // 이름 매핑 — reservations.fields_json 의 mobile/name 기반
  const projIds = new Set<number>();
  (Array.isArray(giftRows) ? giftRows : []).forEach((r: any) => projIds.add(Number(r.project_id)));
  (Array.isArray(resvRows) ? resvRows : []).forEach((r: any) => projIds.add(Number(r.project_id)));
  const nameMap = new Map<string, string>(); // `${pid}__${phoneDigits}` → name
  if (projIds.size > 0) {
    const arr = Array.from(projIds);
    const ph = arr.map(() => "?").join(",");
    const [allResv] = await pool.execute(
      `SELECT project_id, fields_json FROM reservations WHERE project_id IN (${ph})`,
      arr,
    );
    (Array.isArray(allResv) ? allResv : []).forEach((r: any) => {
      try {
        const f = JSON.parse(r.fields_json || "{}");
        const phn = String(f.mobile || f.phone || "").replace(/\D/g, "");
        if (phn && f.name) nameMap.set(`${r.project_id}__${phn}`, String(f.name));
      } catch {}
    });
  }

  // Gift 데이터 — phone 정규화 + 이름 매핑
  const giftList = (Array.isArray(giftRows) ? giftRows : []).map((r: any) => {
    const phnDigits = String(r.phone || "").replace(/\D/g, "");
    return {
      phone: r.phone,
      name: nameMap.get(`${r.project_id}__${phnDigits}`) || null,
      project_id: r.project_id,
      project_name: r.project_name,
      project_serial: r.project_serial,
      project_status: r.project_status,
      organization_name: r.organization_name,
      type: r.type === "normal" ? "gift_use" : "gift_grant",
      count: Number(r.count || 0),
      amount: Number(r.amount || 0),
      first_at: r.first_at,
      last_at: r.last_at,
    };
  });

  // Reservation 데이터 — fields_json 에서 phone/name 추출
  const resvList = (Array.isArray(resvRows) ? resvRows : []).map((r: any) => {
    let phone = "", name = null;
    try {
      const f = JSON.parse(r.fields_json || "{}");
      phone = String(f.mobile || f.phone || "").replace(/\D/g, "");
      name = f.name || null;
    } catch {}
    return {
      phone,
      name,
      project_id: r.project_id,
      project_name: r.project_name,
      project_serial: r.project_serial,
      project_status: r.project_status,
      organization_name: r.organization_name,
      type: r.type === "reservation" ? "reservation" : "entry",
      count: Number(r.count || 0),
      amount: Number(r.amount || 0),
      first_at: r.first_at,
      last_at: r.last_at,
    };
  });

  // 합치고 정렬 — 최근 사용 시각 desc
  const data = [...giftList, ...resvList].sort((a, b) =>
    String(b.last_at || "").localeCompare(String(a.last_at || "")),
  );

  res.json({ ok: true, data });
});

router.get("/settlement/:projectId/usage", requireMerchant, async (req, res) => {
  const merchantId = req.session.merchant!.id;
  const projectId = Number(req.params.projectId);

  // 가맹점이 볼 수 있는 프로젝트인지 확인(프로젝트 탭과 동일한 가시성)
  const [visRows] = await pool.execute(
    `SELECT p.id, p.project_name, p.project_serial
     FROM projects p
     LEFT JOIN project_applications pa ON pa.project_id = p.id AND pa.merchant_id = ?
     WHERE p.id = ? AND (p.status IN ('ready_to_start','started') OR (p.status = 'completed' AND pa.id IS NOT NULL))`,
    [merchantId, projectId],
  );
  const project = (Array.isArray(visRows) ? visRows[0] : null) as any;
  if (!project) { res.status(404).json({ error: "project_not_found" }); return; }

  const [rows] = await pool.execute(
    `SELECT v.phone, gr.redemption_type, gr.amount, gr.redeemed_at
     FROM gift_redemptions gr
     JOIN visitors v ON v.id = gr.visitor_id
     WHERE gr.project_id = ? AND gr.merchant_id = ?
     ORDER BY gr.redeemed_at DESC, gr.id DESC`,
    [projectId, merchantId],
  );

  res.json({
    ok: true,
    project_name: project.project_name,
    project_serial: project.project_serial,
    data: Array.isArray(rows) ? rows : [],
  });
});

export default router;
