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

// 경품 이미지 업로드
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dest = path.join(process.cwd(), "uploads", "vote-prize");
      try { fs.mkdirSync(dest, { recursive: true }); } catch {}
      cb(null, dest);
    },
    filename: (_req, file, cb) => {
      const safe = crypto.randomBytes(8).toString("hex");
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 6) || ".png";
      cb(null, `${Date.now()}_${safe}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// 호스트 소유 프로젝트 검증
async function ensureOwnership(projectId: number, hostId: number): Promise<boolean> {
  const [rows] = await pool.execute(
    "SELECT id FROM projects WHERE id = ? AND host_id = ?", [projectId, hostId],
  );
  return Array.isArray(rows) && rows.length > 0;
}

// 투표 설정 조회 (등급 포함)
router.get("/host/projects/:id/vote", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  if (!(await ensureOwnership(pid, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const [voteRows] = await pool.execute(
    "SELECT * FROM project_votes WHERE project_id = ?", [pid],
  );
  const vote = (Array.isArray(voteRows) ? voteRows[0] : null) as any;
  if (!vote) { res.json({ ok: true, vote: null, tiers: [] }); return; }
  const [tierRows] = await pool.execute(
    "SELECT * FROM project_vote_tiers WHERE vote_id = ? ORDER BY tier_rank ASC",
    [vote.id],
  );
  const tiers = (Array.isArray(tierRows) ? tierRows : []).map((t: any) => ({
    ...t, prize_image_url: toUploadUrl(t.prize_image_path),
  }));
  res.json({ ok: true, vote, tiers });
});

// 투표 설정 저장 (vote + tiers 일괄)
router.put("/host/projects/:id/vote", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  if (!(await ensureOwnership(pid, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const b = req.body || {};
  const tierCount = Math.max(1, Math.min(10, Number(b.tier_count) || 1));
  const voteTitle = String(b.vote_title || "").slice(0, 255);
  const description = String(b.description || "");
  const status = ["draft","published","closed"].includes(b.status) ? b.status : "draft";
  const votesPerVisitor = Math.max(1, Math.min(100, Number(b.votes_per_visitor) || 1));
  // target_type 은 현재 'partner' 만 지원 (확장 가능)
  const targetType = "partner";

  // 1) vote upsert
  await pool.execute(
    `INSERT INTO project_votes (project_id, target_type, votes_per_visitor, tier_count, vote_title, description, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE target_type=VALUES(target_type), votes_per_visitor=VALUES(votes_per_visitor),
       tier_count=VALUES(tier_count), vote_title=VALUES(vote_title),
       description=VALUES(description), status=VALUES(status), updated_at=NOW()`,
    [pid, targetType, votesPerVisitor, tierCount, voteTitle, description, status],
  );
  const [voteRows] = await pool.execute(
    "SELECT id FROM project_votes WHERE project_id = ?", [pid],
  );
  const voteId = (voteRows as any[])[0].id;

  // 2) tiers 동기화 — 1..tierCount 만 유지, 초과 등급은 삭제
  const tiers = Array.isArray(b.tiers) ? b.tiers : [];
  // 초과 등급 삭제
  await pool.execute(
    `DELETE FROM project_vote_tiers WHERE vote_id = ? AND tier_rank > ?`,
    [voteId, tierCount],
  );
  for (let i = 0; i < tierCount; i++) {
    const t = tiers[i] || {};
    const rank = i + 1;
    const awardTitle = String(t.award_title || `${rank}위`).slice(0, 255);
    const winnerCount = Math.max(1, Number(t.winner_count) || 1);
    const prizeTitle = String(t.prize_title || "").slice(0, 255);
    const prizeDesc = String(t.prize_desc || "");
    await pool.execute(
      `INSERT INTO project_vote_tiers (vote_id, tier_rank, award_title, winner_count, prize_title, prize_desc)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         award_title=VALUES(award_title), winner_count=VALUES(winner_count),
         prize_title=VALUES(prize_title), prize_desc=VALUES(prize_desc), updated_at=NOW()`,
      [voteId, rank, awardTitle, winnerCount, prizeTitle, prizeDesc],
    );
  }
  res.json({ ok: true });
});

// 경품 이미지 업로드 (tier 등급 단위)
router.post("/host/projects/:id/vote/tiers/:rank/image", requireHost,
  upload.single("image"),
  async (req: Request, res: Response) => {
    const host = req.session.host!;
    const pid = Number(req.params.id);
    const rank = Number(req.params.rank);
    if (!(await ensureOwnership(pid, host.id))) {
      res.status(404).json({ ok: false, error: "project_not_found" }); return;
    }
    if (!req.file) { res.status(400).json({ ok: false, error: "no_file" }); return; }
    const [voteRows] = await pool.execute(
      "SELECT id FROM project_votes WHERE project_id = ?", [pid],
    );
    const vote = (Array.isArray(voteRows) ? voteRows[0] : null) as any;
    if (!vote) { res.status(404).json({ ok: false, error: "vote_not_configured" }); return; }
    await pool.execute(
      `UPDATE project_vote_tiers SET prize_image_path = ?, updated_at = NOW()
        WHERE vote_id = ? AND tier_rank = ?`,
      [req.file.path, vote.id, rank],
    );
    res.json({ ok: true, image_url: toUploadUrl(req.file.path) });
  });

// 경품 이미지 삭제
router.delete("/host/projects/:id/vote/tiers/:rank/image", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  const rank = Number(req.params.rank);
  if (!(await ensureOwnership(pid, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const [voteRows] = await pool.execute(
    "SELECT id FROM project_votes WHERE project_id = ?", [pid],
  );
  const vote = (Array.isArray(voteRows) ? voteRows[0] : null) as any;
  if (!vote) { res.status(404).json({ ok: false, error: "vote_not_configured" }); return; }
  await pool.execute(
    `UPDATE project_vote_tiers SET prize_image_path = NULL, updated_at = NOW()
      WHERE vote_id = ? AND tier_rank = ?`,
    [vote.id, rank],
  );
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
//  투표 관리 — 실시간 집계 / 순위 / 상태 제어
// ═══════════════════════════════════════════════════════════════

// 투표 결과/현황 조회 (후보별 득표, 참여 인원, 등급)
router.get("/host/projects/:id/vote/results", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  if (!(await ensureOwnership(pid, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const [voteRows] = await pool.execute(
    "SELECT * FROM project_votes WHERE project_id = ?", [pid],
  );
  const vote = (Array.isArray(voteRows) ? voteRows[0] : null) as any;
  if (!vote) {
    res.json({ ok: true, vote: null, tiers: [], candidates: [], total_voters: 0, total_ballots: 0 });
    return;
  }
  // 수상 등급
  const [tierRows] = await pool.execute(
    `SELECT tier_rank, award_title, winner_count, prize_title
       FROM project_vote_tiers WHERE vote_id = ? ORDER BY tier_rank ASC`,
    [vote.id],
  );
  const tiers = Array.isArray(tierRows) ? tierRows : [];
  // 후보(승인된 참여기업)별 득표 — 득표 내림차순
  const [candRows] = await pool.execute(
    `SELECT p.id, p.company_name_ko, p.company_name_en, p.company_logo_path,
            COUNT(b.id) AS votes
       FROM project_partners p
       LEFT JOIN project_vote_ballots b ON b.partner_id = p.id AND b.vote_id = ?
      WHERE p.project_id = ? AND p.status = 'approved'
      GROUP BY p.id
      ORDER BY votes DESC, p.company_name_ko ASC, p.id ASC`,
    [vote.id, pid],
  );
  const candidates = (Array.isArray(candRows) ? candRows : []).map((c: any) => ({
    id: c.id,
    name: c.company_name_ko || c.company_name_en || "",
    logo_url: toUploadUrl(c.company_logo_path),
    votes: Number(c.votes || 0),
  }));
  // 참여 인원(고유 이메일) + 총 투표수
  const [cntRows] = await pool.execute(
    `SELECT COUNT(DISTINCT voter_email) AS voters, COUNT(*) AS ballots
       FROM project_vote_ballots WHERE vote_id = ?`,
    [vote.id],
  );
  const counts = (Array.isArray(cntRows) ? cntRows[0] : {}) as any;
  res.json({
    ok: true,
    vote: {
      id: vote.id, vote_title: vote.vote_title, description: vote.description,
      status: vote.status, votes_per_visitor: vote.votes_per_visitor, tier_count: vote.tier_count,
    },
    tiers,
    candidates,
    total_voters: Number(counts.voters || 0),
    total_ballots: Number(counts.ballots || 0),
  });
});

// 이메일 마스킹 — 앞 2자만 남기고 나머지/도메인 일부를 * 처리 (누가 투표했는지 식별 방지)
function maskEmail(email: string): string {
  const raw = String(email || "");
  const at = raw.indexOf("@");
  if (at < 0) {
    return raw.length <= 2 ? raw.charAt(0) + "*" : raw.slice(0, 2) + "*".repeat(raw.length - 2);
  }
  const user = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  const mUser = user.length <= 2 ? user.charAt(0) + "*" : user.slice(0, 2) + "*".repeat(Math.max(1, user.length - 2));
  const dot = domain.lastIndexOf(".");
  const namePart = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  const mName = namePart.length <= 1 ? "*" : namePart.charAt(0) + "*".repeat(Math.max(1, namePart.length - 1));
  return `${mUser}@${mName}${tld}`;
}

// 투표 참여자 목록 — 개인정보 보호: 이메일 마스킹 + 투표 대상(후보) 미포함
//   "누가, 어디에 투표했는지" 를 화면상 확인 불가하도록 서버에서 마스킹/제외 처리
router.get("/host/projects/:id/vote/voters", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  if (!(await ensureOwnership(pid, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const [voteRows] = await pool.execute(
    "SELECT id FROM project_votes WHERE project_id = ?", [pid],
  );
  const vote = (Array.isArray(voteRows) ? voteRows[0] : null) as any;
  if (!vote) { res.json({ ok: true, total: 0, voters: [] }); return; }
  // 고유 투표자 — 후보(partner_id)는 노출하지 않고, 가장 최근 투표시각만
  const [rows] = await pool.execute(
    `SELECT voter_email, MAX(voted_at) AS voted_at
       FROM project_vote_ballots
      WHERE vote_id = ?
      GROUP BY voter_email
      ORDER BY voted_at DESC`,
    [vote.id],
  );
  const voters = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    email_masked: maskEmail(String(r.voter_email || "")),
    voted_at: r.voted_at,
  }));
  res.json({ ok: true, total: voters.length, voters });
});

// 투표 상태만 빠르게 변경 (공개/마감/작성중)
router.post("/host/projects/:id/vote/status", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  if (!(await ensureOwnership(pid, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const status = String((req.body || {}).status || "");
  if (!["draft", "published", "closed"].includes(status)) {
    res.status(400).json({ ok: false, error: "invalid_status" }); return;
  }
  const [r] = await pool.execute(
    "UPDATE project_votes SET status = ?, updated_at = NOW() WHERE project_id = ?",
    [status, pid],
  );
  if (!((r as any).affectedRows > 0)) {
    res.status(404).json({ ok: false, error: "vote_not_configured",
      message: "먼저 '투표등록' 탭에서 투표를 설정해 주세요." }); return;
  }
  res.json({ ok: true, status });
});

// ═══════════════════════════════════════════════════════════════
//  Public (visitor) — 투표 조회 / 투표 / 본인 투표 내역
// ═══════════════════════════════════════════════════════════════

// 공개 투표 정보 + 후보 목록 (참여기업)
router.get("/public/projects/:serial/vote", async (req, res) => {
  const serial = String(req.params.serial || "");
  const voterEmail = String(req.query.email || "").trim().toLowerCase();
  const [pRows] = await pool.execute(
    `SELECT id, project_name, project_serial FROM projects WHERE project_serial = ?`, [serial],
  );
  const proj = (Array.isArray(pRows) ? pRows[0] : null) as any;
  if (!proj) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
  const [vRows] = await pool.execute(
    `SELECT id, target_type, votes_per_visitor, tier_count, vote_title, description, status
       FROM project_votes WHERE project_id = ?`, [proj.id],
  );
  const vote = (Array.isArray(vRows) ? vRows[0] : null) as any;
  if (!vote || vote.status !== "published") {
    res.status(403).json({ ok: false, error: "vote_not_open", message: "현재 진행 중인 투표가 없습니다." }); return;
  }
  // 후보 — approved 참여기관만
  const [cRows] = await pool.execute(
    `SELECT id, company_name_ko, company_name_en, company_logo_path, company_homepage
       FROM project_partners
      WHERE project_id = ? AND status = 'approved'
      ORDER BY company_name_ko ASC, id ASC`,
    [proj.id],
  );
  const candidates = (Array.isArray(cRows) ? cRows : []).map((c: any) => ({
    id: c.id,
    name: c.company_name_ko || c.company_name_en || "",
    homepage: c.company_homepage || null,
    logo_url: toUploadUrl(c.company_logo_path),
  }));
  // 수상 등급 + 경품 정보 (방문자에게 노출)
  const [tRows] = await pool.execute(
    `SELECT tier_rank, award_title, winner_count, prize_title, prize_desc, prize_image_path
       FROM project_vote_tiers WHERE vote_id = ? ORDER BY tier_rank ASC`,
    [vote.id],
  );
  const tiers = (Array.isArray(tRows) ? tRows : []).map((t: any) => ({
    rank: t.tier_rank,
    award_title: t.award_title,
    winner_count: t.winner_count,
    prize_title: t.prize_title,
    prize_desc: t.prize_desc,
    prize_image_url: toUploadUrl(t.prize_image_path),
  }));
  // 본인 투표 내역 (email 제공된 경우)
  let myVotes: number[] = [];
  if (voterEmail) {
    const [bRows] = await pool.execute(
      `SELECT partner_id FROM project_vote_ballots WHERE vote_id = ? AND voter_email = ?`,
      [vote.id, voterEmail],
    );
    myVotes = (Array.isArray(bRows) ? bRows : []).map((r: any) => Number(r.partner_id));
  }
  res.json({
    ok: true,
    project: { id: proj.id, name: proj.project_name, serial: proj.project_serial },
    vote: { id: vote.id, target_type: vote.target_type, votes_per_visitor: vote.votes_per_visitor,
            title: vote.vote_title, description: vote.description, status: vote.status },
    tiers,
    candidates,
    my_votes: myVotes,
  });
});

// 투표 제출 — 후보 ID 배열 전송 (visitor 본인 이메일 + 코드 또는 인증된 세션)
router.post("/public/projects/:serial/vote/submit", async (req, res) => {
  const serial = String(req.params.serial || "");
  const b = req.body || {};
  const email = String(b.email || "").trim().toLowerCase();
  const ids = Array.isArray(b.partner_ids) ? b.partner_ids.map((x: any) => Number(x)).filter((x: number) => Number.isInteger(x) && x > 0) : [];
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ ok: false, error: "invalid_email" }); return;
  }
  if (!ids.length) { res.status(400).json({ ok: false, error: "no_selection", message: "투표할 참여기업을 선택해 주세요." }); return; }

  // 프로젝트 + 투표 조회
  const [pRows] = await pool.execute(
    `SELECT id FROM projects WHERE project_serial = ?`, [serial],
  );
  const proj = (Array.isArray(pRows) ? pRows[0] : null) as any;
  if (!proj) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
  const [vRows] = await pool.execute(
    `SELECT id, votes_per_visitor, status FROM project_votes WHERE project_id = ?`, [proj.id],
  );
  const vote = (Array.isArray(vRows) ? vRows[0] : null) as any;
  if (!vote || vote.status !== "published") {
    res.status(403).json({ ok: false, error: "vote_not_open" }); return;
  }
  const limit = Number(vote.votes_per_visitor) || 1;
  // 중복 제거 + 한도 검증
  const uniqIds = Array.from(new Set(ids));
  if (uniqIds.length > limit) {
    res.status(400).json({ ok: false, error: "exceeds_limit",
      message: `최대 ${limit}개까지 선택 가능합니다.` }); return;
  }
  // 후보 유효성 (project_partners.approved 인지)
  const placeholders = uniqIds.map(() => "?").join(",");
  const [cRows] = await pool.execute(
    `SELECT id FROM project_partners WHERE project_id = ? AND status='approved' AND id IN (${placeholders})`,
    [proj.id, ...uniqIds],
  );
  const validIds = (Array.isArray(cRows) ? cRows : []).map((r: any) => Number(r.id));
  if (validIds.length !== uniqIds.length) {
    res.status(400).json({ ok: false, error: "invalid_candidates", message: "선택한 일부 후보가 유효하지 않습니다." }); return;
  }
  // 기존 투표 확인 — 이미 투표한 경우 (재투표 허용 X)
  const [existRows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM project_vote_ballots WHERE vote_id = ? AND voter_email = ?`,
    [vote.id, email],
  );
  const existCount = Number((existRows as any[])[0]?.n || 0);
  if (existCount > 0) {
    res.status(409).json({ ok: false, error: "already_voted",
      message: "이미 투표하셨습니다. (재투표 불가)" }); return;
  }
  // INSERT 일괄
  for (const pid of validIds) {
    try {
      await pool.execute(
        `INSERT INTO project_vote_ballots (vote_id, voter_email, partner_id) VALUES (?, ?, ?)`,
        [vote.id, email, pid],
      );
    } catch (e: any) {
      if (e && (e.code === "ER_DUP_ENTRY" || e.errno === 1062)) continue;
      throw e;
    }
  }
  res.json({ ok: true, message: "투표가 완료되었습니다.", count: validIds.length });
});

export default router;
