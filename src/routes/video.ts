import { Router } from "express";
import pool from "../config/database";
import { requireHost } from "../middleware/auth";

const router = Router();

// 다양한 YouTube URL 형태에서 video id 추출
function extractVideoId(url: string): string | null {
  const s = String(url || "").trim();
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) { const m = s.match(re); if (m) return m[1]; }
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;   // id 만 입력한 경우
  return null;
}

// oEmbed 로 메타데이터 조회 (API 키 불필요)
async function fetchMeta(videoId: string): Promise<{ title: string; author: string; thumbnail_url: string } | null> {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`);
    if (!r.ok) return null;
    const d: any = await r.json();
    return {
      title: String(d.title || ""),
      author: String(d.author_name || ""),
      thumbnail_url: String(d.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
    };
  } catch {
    return null;
  }
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
function mapRow(r: any) {
  return {
    id: r.id, project_id: r.project_id, project_name: r.project_name, project_serial: r.project_serial,
    video_id: r.video_id, youtube_url: r.youtube_url, title: r.title || "", author: r.author || "",
    thumbnail_url: r.thumbnail_url || `https://i.ytimg.com/vi/${r.video_id}/hqdefault.jpg`,
    watch_url: `https://www.youtube.com/watch?v=${r.video_id}`,
    embed_url: `https://www.youtube.com/embed/${r.video_id}`,
    status: r.status, created_at: r.created_at,
  };
}

// ── 미리보기: URL → 메타데이터 (등록 전 확인용) ──
router.post("/host/preview", requireHost, async (req, res) => {
  const url = String((req.body || {}).url || "");
  const vid = extractVideoId(url);
  if (!vid) { res.status(400).json({ ok: false, error: "invalid_url", message: "올바른 YouTube 주소가 아닙니다." }); return; }
  const meta = await fetchMeta(vid);
  if (!meta) { res.status(400).json({ ok: false, error: "meta_failed", message: "동영상 정보를 가져오지 못했습니다. (비공개/삭제 여부 확인)" }); return; }
  res.json({ ok: true, video_id: vid, ...meta });
});

// ── 등록 ──
router.post("/host/projects/:id/videos", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  if (!(await ensureOwnership(pid, host.id))) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
  const url = String((req.body || {}).url || "");
  const vid = extractVideoId(url);
  if (!vid) { res.status(400).json({ ok: false, error: "invalid_url", message: "올바른 YouTube 주소가 아닙니다." }); return; }
  const meta = await fetchMeta(vid);
  if (!meta) { res.status(400).json({ ok: false, error: "meta_failed", message: "동영상 정보를 가져오지 못했습니다." }); return; }
  const [r] = await pool.execute(
    `INSERT INTO project_videos (project_id, video_id, youtube_url, title, author, thumbnail_url)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [pid, vid, `https://www.youtube.com/watch?v=${vid}`, meta.title, meta.author, meta.thumbnail_url],
  );
  res.json({ ok: true, id: (r as any).insertId });
});

// ── 목록 (관리자) ──
router.get("/host/videos", requireHost, async (req, res) => {
  const hostId = req.session.host!.id;
  const projectName = String(req.query.project_name || "").trim();
  const status = String(req.query.status || "");
  let where = "WHERE p.host_id = ?";
  const params: Array<string | number> = [hostId];
  if (projectName) { where += " AND (p.project_name LIKE ? OR p.project_serial LIKE ?)"; params.push(`%${projectName}%`, `%${projectName}%`); }
  if (["active", "inactive"].includes(status)) { where += " AND v.status = ?"; params.push(status); }
  const [rows] = await pool.execute(
    `SELECT v.*, p.project_name, p.project_serial
       FROM project_videos v JOIN projects p ON p.id = v.project_id
       ${where}
      ORDER BY v.sort_order ASC, v.created_at DESC, v.id DESC LIMIT 2000`,
    params,
  );
  res.json({ ok: true, data: (Array.isArray(rows) ? rows : []).map(mapRow) });
});

// ── 노출 토글 ──
router.post("/host/projects/:id/videos/:vid/status", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  const vid = Number(req.params.vid);
  if (!(await ensureOwnership(pid, host.id))) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
  const status = ["active", "inactive"].includes((req.body || {}).status) ? (req.body as any).status : "active";
  await pool.execute("UPDATE project_videos SET status = ? WHERE id = ? AND project_id = ?", [status, vid, pid]);
  res.json({ ok: true });
});

// ── 삭제 ──
router.delete("/host/projects/:id/videos/:vid", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pid = Number(req.params.id);
  const vid = Number(req.params.vid);
  if (!(await ensureOwnership(pid, host.id))) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
  await pool.execute("DELETE FROM project_videos WHERE id = ? AND project_id = ?", [vid, pid]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
//  Public — 프로젝트별 동영상 게시판
// ═══════════════════════════════════════════════════════════════
router.get("/public/projects/:serial/videos", async (req, res) => {
  const proj = await getProject(String(req.params.serial || ""));
  if (!proj) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
  const [rows] = await pool.execute(
    `SELECT * FROM project_videos WHERE project_id = ? AND status = 'active'
      ORDER BY sort_order ASC, created_at DESC, id DESC LIMIT 500`,
    [proj.id],
  );
  const list = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    id: r.id, video_id: r.video_id, title: r.title || "", author: r.author || "",
    thumbnail_url: r.thumbnail_url || `https://i.ytimg.com/vi/${r.video_id}/hqdefault.jpg`,
    embed_url: `https://www.youtube.com/embed/${r.video_id}`,
    watch_url: `https://www.youtube.com/watch?v=${r.video_id}`,
  }));
  res.json({ ok: true, project: { name: proj.project_name, serial: proj.project_serial }, videos: list });
});

export default router;
