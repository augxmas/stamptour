// 데모 reservation 들에 QR 이미지를 생성하고 DB에 경로 저장.
// 사용된 것(status='used') 은 PAID 스탬프까지 적용.
//   ts-node scripts/seed_demo_qr.ts
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import pool from "../src/config/database";
import { publicBaseUrl } from "../src/services/qr.service";
import { stampPaidOnPng } from "../src/utils/qr-stamp";
import dotenv from "dotenv";
dotenv.config();

const dir = path.join(process.cwd(), "uploads", "reservation-qr");
fs.mkdirSync(dir, { recursive: true });

(async () => {
  const [rows] = await pool.execute(
    `SELECT id, project_id, token, status FROM reservations WHERE qr_image_path IS NULL`,
  );
  const list = Array.isArray(rows) ? (rows as any[]) : [];
  const base = publicBaseUrl();
  for (const r of list) {
    const file = path.join(dir, `${r.token}.png`);
    const url = `${base}/v/resv/${r.token}`;
    await QRCode.toFile(file, url, { margin: 2, width: 420 });
    if (r.status === "used") {
      try { stampPaidOnPng(file); } catch (e) { console.warn("stamp failed", e); }
    }
    await pool.execute(
      `UPDATE reservations SET qr_image_path = ? WHERE id = ?`,
      [file, r.id],
    );
    console.log(`✓ ${r.id} (${r.status}) → ${file}`);
  }
  await pool.end();
})();
