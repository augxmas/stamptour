// @ts-nocheck
// dcfair.co.kr 2025년 참가기업 21개를 project_id=2 (대전 드림아레나 26) 에 dummy 데이터로 시드
//   - 로고 다운로드 → uploads/partner-logo/
//   - project_partners INSERT (회사명, 로고 + dummy)
import pool from "../src/config/database";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";

const PROJECT_ID = 2;
const BASE = "https://dcfair.co.kr";

const COMPANIES = [
  ["(주)헬로우미스터리",     "/_files/company/20250908/thumb/50fd2c19bfee0883c2f8c95f5be95d39_crop_auto_312_160.jpg"],
  ["머니드로잉",             "/_files/company/20250908/thumb/35320c4fe56e903ebaabe92741aaceae_crop_auto_312_160.png"],
  ["(주)엔토닉크리에이티브", "/_files/company/20250908/thumb/9136038e0d3d12f1a0bbf3ab06126f73_crop_auto_312_160.png"],
  ["한국저작권위원회",       "/_files/company/20250908/thumb/1509674c3353c6f31fcd83c8db7460af_crop_auto_312_160.jpg"],
  ["한림사",                 "/_files/company/20250908/thumb/db55a1fef25dbbd753b283c399c40fe5_crop_auto_312_160.png"],
  ["소로리네",               "/_files/company/20250908/thumb/2b95465559aa90a1235d362eed0b1d6b_crop_auto_312_160.png"],
  ["냥냥몬스터즈",           "/_files/company/20250908/thumb/c64fe0a0d307c3195ba1a2e366ca98b1_crop_auto_312_160.png"],
  ["충청북도 교육청",        "/_files/company/20250908/thumb/c7608274326584461d6f3e7ff90113e9_crop_auto_312_160.png"],
  ["한국산림복지진흥원",     "/_files/company/20250908/thumb/8eceebd3d2234363318abeb38201dcdc_crop_auto_312_160.png"],
  ["국가철도공단",           "/_files/company/20250908/thumb/64c55cf00f86cdf5c8296d5af8d81896_crop_auto_312_160.png"],
  ["경기도",                 "/_files/company/20250908/thumb/5ed0e127b073585392069325aff4d42e_crop_auto_312_160.png"],
  ["한국중앙자원봉사센터",   "/_files/company/20250908/thumb/3c1783471da125e53ba4c7b9cb5c098e_crop_auto_312_160.png"],
  ["안산시정신건강복지센터", "/_files/company/20250908/thumb/8cb71e7e50bbe0f138846ad831b7d9ee_crop_auto_312_160.png"],
  ["국립백두대간수목원",     "/_files/company/20250908/thumb/599991266d6318b14f09bf951208e9c1_crop_auto_312_160.png"],
  ["한국장애인고용공단",     "/_files/company/20250908/thumb/05ea3526fe155effbb201f5f7ea61589_crop_auto_312_160.png"],
  ["한국문화정보원",         "/_files/company/20251010/thumb/fd42bf60427326840d0c121a981ecff6_crop_auto_312_1210.73.png"],
  ["부산항만공사",           "/_files/company/20250908/thumb/e1d12908592ec46ef89be9d380ca6e4e_crop_auto_312_160.png"],
  ["에버파인",               "/_files/company/20250908/thumb/86bc46177fb0d3451845b3283d15c9a5_crop_auto_312_160.png"],
  ["애니토마토 만화전문미술학원", "/_files/company/20250909/thumb/b500b7a5443a29247b55fb07e3b22eb8_crop_auto_312_160.png"],
  ["한국국제협력단",         "/_files/company/20250911/thumb/ebd27d42db742cb4d871ba5d662bd1b5_crop_auto_312_160.png"],
  ["한국도자재단",           "/_files/company/20250911/thumb/4096657e8091dcc15162cd3a26ee3493_crop_auto_312_160.png"],
];

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    }).on("error", reject);
  });
}

const STATUSES = ["pending", "approved", "approved"] as const;   // 분포 (대기/승인/승인+입금)

async function main() {
  const logoDir = path.join(process.cwd(), "uploads", "partner-logo");
  fs.mkdirSync(logoDir, { recursive: true });

  for (let i = 0; i < COMPANIES.length; i++) {
    const [name, logoPath] = COMPANIES[i];
    const ext = (path.extname(logoPath).match(/\.(png|jpg|jpeg|gif|webp)/i)?.[0] || ".png").toLowerCase();
    const safe = name.replace(/[^a-zA-Z0-9가-힣]/g, "_").slice(0, 30);
    const fname = `dcfair_${i + 1}_${safe}${ext}`;
    const filePath = path.join(logoDir, fname);
    try {
      await download(BASE + logoPath, filePath);
      console.log(`  ✓ [${i + 1}/21] ${name} → ${fname}`);
    } catch (e) {
      console.log(`  ✗ [${i + 1}/21] ${name} 다운로드 실패: ${e}`);
      continue;
    }

    // 분포: 0=pending, 1=approved(미입금), 2=approved+deposit
    const dist = i % 3;
    const status = dist === 0 ? "pending" : "approved";
    const approvedAt = dist >= 1 ? new Date(Date.now() - (21 - i) * 86400000) : null;
    const depositAt  = dist === 2 ? new Date(Date.now() - (21 - i - 1) * 86400000) : null;

    // dummy email — 충돌 방지 위해 회사 인덱스 포함
    const email = `dcfair${i + 1}@example.com`;
    const phone = `010-${String(1000 + i).padStart(4, "0")}-${String(5000 + i).padStart(4, "0")}`;
    const officePhone = `02-${String(1000 + i).padStart(4, "0")}-5000`;

    await pool.execute(
      `INSERT INTO project_partners
        (project_id, status,
         company_name_ko, ceo_name, ceo_email, ceo_mobile,
         company_phone, company_address,
         company_logo_path,
         contact_name, contact_dept, contact_position, contact_phone, contact_email,
         booth_type, booth_unit_cost, booth_count, facility, facility_json, quote_total,
         agreed_terms, agreed_privacy, approved_at, deposit_confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      [
        PROJECT_ID, status,
        name, `대표자_${i + 1}`, email, phone,
        officePhone, `서울특별시 강서구 마곡중앙로 ${100 + i}`,
        filePath,
        `담당자_${i + 1}`, "운영팀", "과장", officePhone, email,
        "일반부스", 1000000, 1, "전기×1, 인터넷×1",
        JSON.stringify([{ name: "전기(주간)", unit_cost: 77000, count: 1 }, { name: "인터넷", unit_cost: 220000, count: 1 }]),
        1000000 + 77000 + 220000,
        approvedAt, depositAt,
      ],
    );
  }

  // 결과
  const [rows] = await pool.execute(
    `SELECT status, deposit_confirmed_at IS NOT NULL AS dep, COUNT(*) AS n
       FROM project_partners WHERE project_id = ?
       GROUP BY status, dep ORDER BY status, dep`,
    [PROJECT_ID],
  );
  console.log("\n=== 결과 ===");
  console.table(rows);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
