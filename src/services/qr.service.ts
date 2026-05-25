import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import QRCode from "qrcode";
import pool from "../config/database";

// 방문자가 QR로 접속할 공개 주소. DOMAIN(.env) 우선, 스킴이 없으면 https로 보정.
export function publicBaseUrl(): string {
  const domain = (process.env.DOMAIN ?? "").trim();
  if (domain) {
    const withScheme = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
    return withScheme.replace(/\/+$/, "");
  }
  return (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export async function generateProjectQrs(projectId: number, projectSerial: string): Promise<void> {
  const [rows] = await pool.execute(
    `SELECT id, location_seq FROM project_locations
     WHERE project_id = ? AND disabled = 0
     ORDER BY display_seq ASC`,
    [projectId],
  );

  const locations = Array.isArray(rows) ? rows as Array<{ id: number; location_seq: number }> : [];
  const baseUrl = publicBaseUrl();
  const dir = path.join(process.cwd(), "uploads", "qr", String(projectId));
  fs.mkdirSync(dir, { recursive: true });

  for (const loc of locations) {
    const url = `${baseUrl}/v/${projectSerial}/${String(loc.location_seq).padStart(2, "0")}`;
    const filename = `qr_${projectSerial}_${String(loc.location_seq).padStart(2, "0")}.png`;
    const fullPath = path.join(dir, filename);

    await QRCode.toFile(fullPath, url, { margin: 2, width: 420 });

    await pool.execute(
      `INSERT INTO project_location_qr (project_id, location_id, qr_url, qr_image_path)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE qr_url = VALUES(qr_url), qr_image_path = VALUES(qr_image_path)`,
      [projectId, loc.id, url, fullPath],
    );
  }
}

export async function createQrZip(projectId: number): Promise<string> {
  const targetDir = path.join(process.cwd(), "uploads", "qr", String(projectId));
  fs.mkdirSync(targetDir, { recursive: true });

  const zipPath = path.join(targetDir, `qr_${projectId}.zip`);

  // zip 내부 파일명: {프로젝트일련번호}_{목적지일련번호}.png
  const [rows] = await pool.execute(
    `SELECT p.project_serial, pl.location_seq, qr.qr_image_path
       FROM project_location_qr qr
       JOIN project_locations pl ON pl.id = qr.location_id
       JOIN projects p ON p.id = qr.project_id
      WHERE qr.project_id = ?
      ORDER BY pl.location_seq ASC`,
    [projectId],
  );
  const items = Array.isArray(rows)
    ? (rows as Array<{ project_serial: string; location_seq: number; qr_image_path: string }>)
    : [];

  const zip = new JSZip();
  for (const it of items) {
    if (it.qr_image_path && fs.existsSync(it.qr_image_path)) {
      const name = `${it.project_serial}_${String(it.location_seq).padStart(2, "0")}.png`;
      zip.file(name, fs.readFileSync(it.qr_image_path));
    }
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  fs.writeFileSync(zipPath, buffer);

  return zipPath;
}
