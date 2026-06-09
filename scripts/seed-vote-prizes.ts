// @ts-nocheck
// 20260606_0001 프로젝트의 투표 등급 경품 dummy 설정
//   - 1·2·3등 각 1명씩
//   - 경품 이미지는 placehold.co 에서 다운로드 (등급별 색상)
import pool from "../src/config/database";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";

const PROJECT_ID = 2;

// 등급별 dummy 경품
const TIERS = [
  { rank: 1, award_title: "대상",     winner_count: 1, prize_title: "🏆 갤럭시 워치 7",        prize_desc: "최신 모델 1개 (44mm, 블랙)",          bg: "f59e0b", fg: "ffffff", label: "갤럭시 워치 7" },
  { rank: 2, award_title: "최우수상", winner_count: 1, prize_title: "🥈 애플 에어팟 프로 2세대", prize_desc: "USB-C 충전 케이스 포함",              bg: "94a3b8", fg: "ffffff", label: "AirPods Pro 2" },
  { rank: 3, award_title: "우수상",   winner_count: 1, prize_title: "🥉 도서상품권 10만원",     prize_desc: "교보문고 모바일 상품권 100,000원",     bg: "d97706", fg: "ffffff", label: "Book Gift 100K" },
];

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      // redirect 처리
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) { file.close(); fs.unlinkSync(dest); download(loc, dest).then(resolve).catch(reject); return; }
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    }).on("error", reject);
  });
}

async function main() {
  // 1) 투표 ID 조회
  const [vRows] = await pool.execute(
    `SELECT id FROM project_votes WHERE project_id = ?`, [PROJECT_ID],
  );
  const vote = (Array.isArray(vRows) ? vRows[0] : null) as any;
  if (!vote) { console.error("프로젝트의 투표 설정이 없습니다."); process.exit(1); }
  console.log(`✓ 투표 ID = ${vote.id}`);

  // 이미지 저장 디렉토리
  const dir = path.join(process.cwd(), "uploads", "vote-prize");
  fs.mkdirSync(dir, { recursive: true });

  for (const t of TIERS) {
    // 이미지 다운로드 (placehold.co — 색상 배경 + 텍스트)
    const text = encodeURIComponent(`${t.rank} ${t.label}`);
    const url = `https://placehold.co/600x400/${t.bg}/${t.fg}/png?text=${text}&font=Roboto`;
    const fname = `dummy_vote_prize_${t.rank}.png`;
    const fpath = path.join(dir, fname);
    try {
      await download(url, fpath);
      console.log(`  ✓ ${t.rank}위 이미지 다운로드 — ${fname}`);
    } catch (e) {
      console.log(`  ✗ ${t.rank}위 이미지 다운로드 실패: ${e}`);
      continue;
    }

    // tier upsert
    await pool.execute(
      `INSERT INTO project_vote_tiers (vote_id, tier_rank, award_title, winner_count, prize_title, prize_desc, prize_image_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         award_title=VALUES(award_title), winner_count=VALUES(winner_count),
         prize_title=VALUES(prize_title), prize_desc=VALUES(prize_desc),
         prize_image_path=VALUES(prize_image_path), updated_at=NOW()`,
      [vote.id, t.rank, t.award_title, t.winner_count, t.prize_title, t.prize_desc, fpath],
    );
    console.log(`     → ${t.award_title} · ${t.prize_title}`);
  }

  // 결과 출력
  const [rows] = await pool.execute(
    `SELECT tier_rank, award_title, winner_count, prize_title, prize_image_path IS NOT NULL AS has_img
       FROM project_vote_tiers WHERE vote_id = ? ORDER BY tier_rank`,
    [vote.id],
  );
  console.log("\n=== 등급 확인 ===");
  console.table(rows);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
