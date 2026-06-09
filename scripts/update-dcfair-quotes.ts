// @ts-nocheck
// dcfair 21개 참가기업의 부스/시설 dummy 를 다양한 조합으로 갱신
//   부스 3종 (소형/일반/프리미엄) × 시설 4종 (전기/인터넷/조명/음향) 4가지 패턴 순환
import pool from "../src/config/database";

const PROJECT_ID = 2;

const BOOTH_OPTS = [
  { name: "소형부스",     cost: 500000,  desc: "3m × 3m / 입문용" },
  { name: "일반부스",     cost: 1000000, desc: "6m × 3m / 1구좌" },
  { name: "프리미엄부스", cost: 2000000, desc: "9m × 3m / 코너 위치" },
];
const FACILITY_OPTS = [
  { name: "전기(주간)", cost: 77000,  desc: "220V 3kW" },
  { name: "인터넷",     cost: 220000, desc: "유선 100Mbps" },
  { name: "조명",       cost: 100000, desc: "추가 스팟 4개" },
  { name: "음향",       cost: 200000, desc: "마이크 + 스피커 세트" },
];

// 패턴: [boothIdx, boothCount, [facilityIdx, count] ...]
const PATTERNS = [
  // 패턴 A — 소형 단독 + 전기만
  { booth: 0, count: 1, facilities: [[0, 1]] },
  // 패턴 B — 일반 + 전기 + 인터넷
  { booth: 1, count: 1, facilities: [[0, 1], [1, 1]] },
  // 패턴 C — 일반 × 2 + 전기2 + 인터넷 + 조명
  { booth: 1, count: 2, facilities: [[0, 2], [1, 1], [2, 1]] },
  // 패턴 D — 프리미엄 + 풀옵션
  { booth: 2, count: 1, facilities: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  // 패턴 E — 프리미엄 × 2 + 풀옵션 더블
  { booth: 2, count: 2, facilities: [[0, 2], [1, 2], [2, 1], [3, 1]] },
];

async function main() {
  // 1) form_config 의 옵션 갱신
  await pool.execute(
    `UPDATE project_partner_form_config
        SET booth_type_options = ?,
            facility_options   = ?,
            updated_at         = NOW()
      WHERE project_id = ?`,
    [JSON.stringify(BOOTH_OPTS), JSON.stringify(FACILITY_OPTS), PROJECT_ID],
  );
  console.log("✓ form_config 의 booth/facility 옵션 갱신 완료");

  // 2) 21개 파트너 가져와서 각각 패턴 적용
  const [rows] = await pool.execute(
    `SELECT id FROM project_partners WHERE project_id = ? ORDER BY id ASC`,
    [PROJECT_ID],
  );
  const partners = Array.isArray(rows) ? rows : [];
  console.log(`총 ${partners.length}개 파트너 발견`);

  for (let i = 0; i < partners.length; i++) {
    const p = partners[i];
    const pat = PATTERNS[i % PATTERNS.length];
    const booth = BOOTH_OPTS[pat.booth];
    const facilities = pat.facilities.map(([fi, cnt]) => ({
      name: FACILITY_OPTS[fi].name,
      unit_cost: FACILITY_OPTS[fi].cost,
      count: cnt,
    }));
    // 견적 합계
    const boothSubtotal = booth.cost * pat.count;
    const facilitySubtotal = facilities.reduce((a, f) => a + f.unit_cost * f.count, 0);
    const total = boothSubtotal + facilitySubtotal;
    // quote_json 구성 (랜딩의 견적 카드와 동일 형식)
    const quoteJson = {
      items: [
        { category: "부스",     name: booth.name, unit_cost: booth.cost, count: pat.count, subtotal: boothSubtotal },
        ...facilities.map(f => ({
          category: "부대시설", name: f.name, unit_cost: f.unit_cost, count: f.count, subtotal: f.unit_cost * f.count,
        })),
      ],
      total,
    };
    // facility 텍스트 요약
    const facilityText = facilities.length
      ? facilities.map(f => `${f.name}×${f.count} (${(f.unit_cost*f.count).toLocaleString()}원)`).join(", ")
      : null;

    await pool.execute(
      `UPDATE project_partners
          SET booth_type       = ?,
              booth_unit_cost  = ?,
              booth_count      = ?,
              facility         = ?,
              facility_json    = ?,
              quote_total      = ?,
              quote_json       = ?,
              updated_at       = NOW()
        WHERE id = ?`,
      [
        booth.name, booth.cost, pat.count,
        facilityText, JSON.stringify(facilities),
        total, JSON.stringify(quoteJson),
        p.id,
      ],
    );
    console.log(`  [${i + 1}/${partners.length}] id=${p.id} → ${booth.name}×${pat.count} + ${facilities.length}개 시설 = ${total.toLocaleString()}원`);
  }

  // 결과 통계
  const [stats] = await pool.execute(
    `SELECT booth_type, COUNT(*) AS n,
            MIN(quote_total) AS min_q, MAX(quote_total) AS max_q,
            ROUND(AVG(quote_total)) AS avg_q
       FROM project_partners
      WHERE project_id = ?
      GROUP BY booth_type
      ORDER BY MIN(booth_unit_cost)`,
    [PROJECT_ID],
  );
  console.log("\n=== 결과 ===");
  console.table(stats);
  const [tot] = await pool.execute(
    `SELECT SUM(quote_total) AS sum_total FROM project_partners WHERE project_id = ?`,
    [PROJECT_ID],
  );
  console.log(`\n총 견적 합산: ${Number((tot as any)[0]?.sum_total || 0).toLocaleString()}원`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
