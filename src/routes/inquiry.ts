import { Router } from "express";
import pool from "../config/database";
import { requireHost } from "../middleware/auth";
import { publicBaseUrl } from "../services/qr.service";
import { sendEmail } from "../services/email.service";
import { sendVisitorPush } from "../services/push.service";

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function maskEmail(email: string): string {
  const raw = String(email || "");
  const at = raw.indexOf("@");
  if (at < 0) return raw.length <= 2 ? raw[0] + "*" : raw.slice(0, 2) + "*".repeat(raw.length - 2);
  const u = raw.slice(0, at), d = raw.slice(at + 1);
  const mu = u.length <= 2 ? u[0] + "*" : u.slice(0, 2) + "*".repeat(Math.max(1, u.length - 2));
  const dot = d.lastIndexOf(".");
  const name = dot > 0 ? d.slice(0, dot) : d, tld = dot > 0 ? d.slice(dot) : "";
  const mn = name.length <= 1 ? "*" : name[0] + "*".repeat(Math.max(1, name.length - 1));
  return `${mu}@${mn}${tld}`;
}
function ymd(v: any): string {
  if (!v) return "";
  const d = new Date(v); if (isNaN(d.getTime())) return String(v).slice(0, 10);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

async function getProject(serial: string): Promise<any | null> {
  const [rows] = await pool.execute(
    "SELECT id, project_name, project_serial FROM projects WHERE project_serial = ?", [serial],
  );
  return (Array.isArray(rows) ? rows[0] : null) as any;
}
async function ensureOwnership(projectId: number, hostId: number): Promise<boolean> {
  const [rows] = await pool.execute("SELECT id FROM projects WHERE id = ? AND host_id = ?", [projectId, hostId]);
  return Array.isArray(rows) && rows.length > 0;
}

// 회원(사전/현장등록자) 여부 + 방문자 id(푸시용) 해석
async function resolveMember(projectId: number, email: string): Promise<{ isMember: boolean; visitorId: number | null; name: string | null }> {
  const [rows] = await pool.execute(
    "SELECT fields_json FROM reservations WHERE project_id = ? AND email_lower = ? ORDER BY id DESC LIMIT 1",
    [projectId, email],
  );
  const r = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!r) return { isMember: false, visitorId: null, name: null };
  let fields: any = {};
  try { fields = r.fields_json ? JSON.parse(r.fields_json) : {}; } catch {}
  const name = fields.name || fields.이름 || null;
  const mobile = String(fields.mobile || fields.휴대폰 || "").replace(/[^0-9]/g, "");
  let visitorId: number | null = null;
  if (mobile) {
    const [vr] = await pool.execute("SELECT id FROM visitors WHERE project_id = ? AND phone = ? LIMIT 1", [projectId, mobile]);
    const v = (Array.isArray(vr) ? vr[0] : null) as any;
    if (v) visitorId = Number(v.id);
  }
  return { isMember: true, visitorId, name };
}

// ═══════════════════════════════════════════════════════════════
//  Public — 문의사항 게시판
// ═══════════════════════════════════════════════════════════════

// 작성
router.post("/public/projects/:serial/inquiries", async (req, res) => {
  const proj = await getProject(String(req.params.serial || ""));
  if (!proj) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
  const b = req.body || {};
  const email = String(b.email || "").trim().toLowerCase();
  const title = String(b.title || "").trim().slice(0, 255);
  const content = String(b.content || "");
  const isPublic = b.is_public ? 1 : 0;
  const pin = String(b.pin || "").trim();
  if (!EMAIL_RE.test(email)) { res.status(400).json({ ok: false, error: "invalid_email", message: "올바른 이메일 형식이 아닙니다." }); return; }
  if (!title) { res.status(400).json({ ok: false, error: "no_title", message: "제목을 입력해 주세요." }); return; }
  if (!/^\d{4}$/.test(pin)) { res.status(400).json({ ok: false, error: "invalid_pin", message: "비밀번호 4자리를 입력해 주세요." }); return; }

  const m = await resolveMember(proj.id, email);
  const [r] = await pool.execute(
    `INSERT INTO project_inquiries
       (project_id, visitor_id, author_email, author_name, is_member, title, content, is_public, edit_pin)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [proj.id, m.visitorId, email, m.name, m.isMember ? 1 : 0, title, content, isPublic, pin],
  );
  res.json({ ok: true, id: (r as any).insertId });
});

// 목록 (공개글은 내용 포함, 비공개글은 잠김)
router.get("/public/projects/:serial/inquiries", async (req, res) => {
  const proj = await getProject(String(req.params.serial || ""));
  if (!proj) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
  const [rows] = await pool.execute(
    `SELECT id, author_email, author_name, title, content, is_public, admin_reply,
            replied_at, status, created_at
       FROM project_inquiries WHERE project_id = ?
      ORDER BY created_at DESC, id DESC LIMIT 500`,
    [proj.id],
  );
  const list = (Array.isArray(rows) ? rows : []).map((r: any) => {
    const isPublic = Number(r.is_public) === 1;
    return {
      id: r.id,
      title: r.title,
      is_public: isPublic,
      author_masked: maskEmail(r.author_email),
      answered: r.status === "answered",
      created_date: ymd(r.created_at),
      // 공개글만 본문/답글 노출, 비공개는 잠금
      content: isPublic ? (r.content || "") : null,
      admin_reply: isPublic ? (r.admin_reply || null) : null,
      replied_date: r.replied_at ? ymd(r.replied_at) : null,
    };
  });
  res.json({ ok: true, project: { name: proj.project_name, serial: proj.project_serial }, inquiries: list });
});

// PIN 확인 → 본문/답글 반환 (비공개글·본인글 열람)
router.post("/public/inquiries/:id/verify", async (req, res) => {
  const id = Number(req.params.id);
  const pin = String((req.body || {}).pin || "").trim();
  const [rows] = await pool.execute("SELECT * FROM project_inquiries WHERE id = ?", [id]);
  const r = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!r) { res.status(404).json({ ok: false, error: "not_found" }); return; }
  if (r.edit_pin !== pin) { res.status(403).json({ ok: false, error: "wrong_pin", message: "비밀번호가 일치하지 않습니다." }); return; }
  res.json({
    ok: true,
    inquiry: {
      id: r.id, title: r.title, content: r.content || "", is_public: Number(r.is_public) === 1,
      author_masked: maskEmail(r.author_email),
      admin_reply: r.admin_reply || null, replied_date: r.replied_at ? ymd(r.replied_at) : null,
      answered: r.status === "answered", created_date: ymd(r.created_at),
    },
  });
});

// 본인 글 수정 (PIN 확인)
router.put("/public/inquiries/:id", async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const pin = String(b.pin || "").trim();
  const [rows] = await pool.execute("SELECT edit_pin FROM project_inquiries WHERE id = ?", [id]);
  const r = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!r) { res.status(404).json({ ok: false, error: "not_found" }); return; }
  if (r.edit_pin !== pin) { res.status(403).json({ ok: false, error: "wrong_pin", message: "비밀번호가 일치하지 않습니다." }); return; }
  const title = String(b.title || "").trim().slice(0, 255);
  const content = String(b.content || "");
  const isPublic = b.is_public ? 1 : 0;
  if (!title) { res.status(400).json({ ok: false, error: "no_title", message: "제목을 입력해 주세요." }); return; }
  await pool.execute(
    "UPDATE project_inquiries SET title = ?, content = ?, is_public = ?, updated_at = NOW() WHERE id = ?",
    [title, content, isPublic, id],
  );
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
//  Admin (host)
// ═══════════════════════════════════════════════════════════════
router.get("/host/inquiries", requireHost, async (req, res) => {
  const hostId = req.session.host!.id;
  const projectName = String(req.query.project_name || "").trim();
  const status = String(req.query.status || "");
  let where = "WHERE p.host_id = ?";
  const params: Array<string | number> = [hostId];
  if (projectName) { where += " AND (p.project_name LIKE ? OR p.project_serial LIKE ?)"; params.push(`%${projectName}%`, `%${projectName}%`); }
  if (["open", "answered"].includes(status)) { where += " AND n.status = ?"; params.push(status); }
  const [rows] = await pool.execute(
    `SELECT n.*, p.project_name, p.project_serial
       FROM project_inquiries n JOIN projects p ON p.id = n.project_id
       ${where}
      ORDER BY n.created_at DESC, n.id DESC LIMIT 1000`,
    params,
  );
  const data = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    id: r.id, project_id: r.project_id, project_name: r.project_name, project_serial: r.project_serial,
    author_email: r.author_email, author_name: r.author_name, is_member: Number(r.is_member) === 1,
    title: r.title, content: r.content || "", is_public: Number(r.is_public) === 1,
    admin_reply: r.admin_reply || "", status: r.status,
    replied_at: r.replied_at, created_at: r.created_at,
  }));
  res.json({ ok: true, data });
});

// 답글 등록/수정 → 이메일 + 푸시 알림
router.post("/host/inquiries/:id/reply", requireHost, async (req, res) => {
  const hostId = req.session.host!.id;
  const id = Number(req.params.id);
  const reply = String((req.body || {}).reply || "").trim();
  if (!reply) { res.status(400).json({ ok: false, error: "no_reply", message: "답변 내용을 입력해 주세요." }); return; }
  const [rows] = await pool.execute(
    `SELECT n.*, p.project_name, p.project_serial, p.host_id
       FROM project_inquiries n JOIN projects p ON p.id = n.project_id WHERE n.id = ?`, [id],
  );
  const r = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!r) { res.status(404).json({ ok: false, error: "not_found" }); return; }
  if (Number(r.host_id) !== Number(hostId)) { res.status(403).json({ ok: false, error: "forbidden" }); return; }

  await pool.execute(
    "UPDATE project_inquiries SET admin_reply = ?, replied_at = NOW(), status = 'answered', updated_at = NOW() WHERE id = ?",
    [reply, id],
  );

  // 알림 — 작성자 이메일 + (회원이면) 푸시
  const url = `${publicBaseUrl()}/inquiry/${r.project_serial}?id=${id}`;
  const safe = (s: string) => String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  try {
    await sendEmail({
      templateKey: "inquiry_reply",
      to: r.author_email,
      subject: `[${r.project_name}] 문의에 답변이 등록되었습니다`,
      html:
        `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;">` +
        `<h2 style="color:#0f172a;">문의 답변 안내</h2>` +
        `<p>문의하신 내용에 답변이 등록되었습니다.</p>` +
        `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin:12px 0;">` +
        `<div style="font-weight:700;color:#0f172a;">${safe(r.title)}</div>` +
        `<div style="margin-top:8px;color:#334155;white-space:pre-wrap;">${safe(reply)}</div></div>` +
        `<p><a href="${url}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;">문의 보기</a></p>` +
        `<p style="font-size:12px;color:#94a3b8;">${r.project_name}</p></div>`,
      projectId: r.project_id,
      triggerType: "auto",
    });
  } catch (e) { /* 메일 실패해도 답글 저장은 유지 */ }

  if (r.visitor_id) {
    try {
      await sendVisitorPush(Number(r.visitor_id), {
        title: `[${r.project_name}] 문의 답변 등록`,
        body: `"${r.title}" 문의에 답변이 등록되었습니다.`,
        url,
      });
    } catch (e) { /* 푸시 실패 무시 */ }
  }

  res.json({ ok: true });
});

router.delete("/host/inquiries/:id", requireHost, async (req, res) => {
  const hostId = req.session.host!.id;
  const id = Number(req.params.id);
  const [rows] = await pool.execute(
    "SELECT n.project_id FROM project_inquiries n JOIN projects p ON p.id = n.project_id WHERE n.id = ? AND p.host_id = ?",
    [id, hostId],
  );
  if (!Array.isArray(rows) || rows.length === 0) { res.status(404).json({ ok: false, error: "not_found" }); return; }
  await pool.execute("DELETE FROM project_inquiries WHERE id = ?", [id]);
  res.json({ ok: true });
});

export default router;
