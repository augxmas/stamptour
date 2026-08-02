import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { Router } from "express";
import multer from "multer";
import pool from "../config/database";
import { requireHost } from "../middleware/auth";

const router = Router();
const uploadDir = path.join(process.cwd(), "upload", "resources", "images");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

let tableReady: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await pool.query(`
      CREATE TABLE IF NOT EXISTS resource_images (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        host_id BIGINT NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        stored_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size BIGINT NOT NULL,
        width INT NOT NULL,
        height INT NOT NULL,
        description TEXT NULL,
        tags VARCHAR(1000) NULL,
        file_path VARCHAR(500) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_resource_images_host_created (host_id, created_at),
        INDEX idx_resource_images_host_name (host_id, original_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      const [cols] = await pool.query(
        `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'resource_images'
            AND COLUMN_NAME = 'tags'`,
      );
      if (!Array.isArray(cols) || cols.length === 0) {
        await pool.query("ALTER TABLE resource_images ADD COLUMN tags VARCHAR(1000) NULL AFTER description");
      }
    })();
  }
  return tableReady;
}

function toUploadUrl(p?: string | null): string | null {
  if (!p) return null;
  const norm = String(p).replace(/\\/g, "/");
  const uploadIdx = norm.lastIndexOf("/upload/");
  if (uploadIdx >= 0) return norm.slice(uploadIdx);
  const uploadRel = norm.indexOf("upload/");
  if (uploadRel >= 0) return `/${norm.slice(uploadRel)}`;
  const idx = norm.lastIndexOf("/uploads/");
  if (idx >= 0) return norm.slice(idx);
  const rel = norm.indexOf("uploads/");
  return rel >= 0 ? `/${norm.slice(rel)}` : norm;
}

function extFromMime(mime: string, originalName: string): string {
  const fromMime: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
  };
  const ext = fromMime[String(mime || "").toLowerCase()];
  if (ext) return ext;
  const originalExt = path.extname(originalName || "").toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(originalExt) ? originalExt : ".img";
}

function fixMojibakeFilename(value: unknown): string {
  const name = String(value || "").trim();
  if (!name) return "";
  if (!/[ÃÂÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ\u0080-\u009f]/.test(name)) {
    return name;
  }
  try {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    const score = (s: string) => (s.match(/[\uac00-\ud7a3]/g)?.length || 0) - (s.match(/\uFFFD/g)?.length || 0);
    return score(decoded) >= score(name) ? decoded : name;
  } catch {
    return name;
  }
}

function readUInt24LE(buf: Buffer, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16);
}

function imageDimensions(buf: Buffer): { width: number; height: number } {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString("ascii", 1, 4) === "PNG") {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  if (buf.length >= 10 && (buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a")) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset + 8 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buf[offset + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const len = buf.readUInt16BE(offset + 2);
      if (len < 2) break;
      if (sofMarkers.has(marker)) {
        return { width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5) };
      }
      offset += 2 + len;
    }
  }

  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    let offset = 12;
    while (offset + 8 <= buf.length) {
      const type = buf.toString("ascii", offset, offset + 4);
      const size = buf.readUInt32LE(offset + 4);
      const data = offset + 8;
      if (type === "VP8X" && data + 10 <= buf.length) {
        return { width: readUInt24LE(buf, data + 4) + 1, height: readUInt24LE(buf, data + 7) + 1 };
      }
      if (type === "VP8 " && data + 10 <= buf.length) {
        return { width: buf.readUInt16LE(data + 6) & 0x3fff, height: buf.readUInt16LE(data + 8) & 0x3fff };
      }
      if (type === "VP8L" && data + 5 <= buf.length) {
        const b0 = buf[data + 1];
        const b1 = buf[data + 2];
        const b2 = buf[data + 3];
        const b3 = buf[data + 4];
        return {
          width: 1 + (((b1 & 0x3f) << 8) | b0),
          height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
        };
      }
      offset += 8 + size + (size % 2);
    }
  }

  throw new Error("unsupported_image_format");
}

function mapImageRow(row: any) {
  const imageUrl = toUploadUrl(row.file_path);
  return {
    id: Number(row.id),
    original_name: fixMojibakeFilename(row.original_name),
    stored_name: String(row.stored_name || ""),
    mime_type: String(row.mime_type || ""),
    file_size: Number(row.file_size || 0),
    width: Number(row.width || 0),
    height: Number(row.height || 0),
    description: String(row.description || ""),
    tags: String(row.tags || ""),
    image_url: imageUrl,
    url: imageUrl,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeTags(input: unknown): string {
  const seen = new Set<string>();
  const tags = String(input || "")
    .split(/[\s,]+/)
    .map((tag) => tag.trim().replace(/^#+/, ""))
    .filter(Boolean)
    .map((tag) => tag.slice(0, 40))
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
  return tags.join(",");
}

router.get("/images", requireHost, async (req, res) => {
  await ensureTable();
  const hostId = req.session.host!.id;
  const q = String(req.query.q || "").trim();
  const qMojibake = Buffer.from(q, "utf8").toString("latin1");
  const page = Math.max(1, Number(req.query.page || 1));
  const size = Math.min(100, Math.max(1, Number(req.query.size || 40)));
  const offset = (page - 1) * size;
  let where = "WHERE host_id = ?";
  const params: Array<string | number> = [hostId];
  if (q) {
    where += " AND (original_name LIKE ? OR original_name LIKE ? OR description LIKE ? OR tags LIKE ?)";
    params.push(`%${q}%`, `%${qMojibake}%`, `%${q}%`, `%${q}%`);
  }

  const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM resource_images ${where}`, params);
  const total = Number(((Array.isArray(countRows) ? countRows[0] : null) as any)?.total || 0);
  const [rows] = await pool.execute(
    `SELECT * FROM resource_images ${where} ORDER BY created_at DESC, id DESC LIMIT ${size} OFFSET ${offset}`,
    params,
  );
  res.json({ ok: true, images: (Array.isArray(rows) ? rows : []).map(mapImageRow), total, page, size });
});

router.post("/images", requireHost, upload.single("image"), async (req, res) => {
  await ensureTable();
  if (!req.file) {
    res.status(400).json({ ok: false, error: "no_file", message: "Image file is required." });
    return;
  }
  if (!/^image\//i.test(req.file.mimetype || "")) {
    res.status(400).json({ ok: false, error: "image_file_required", message: "Only image files can be uploaded." });
    return;
  }

  let dims: { width: number; height: number };
  try {
    dims = imageDimensions(req.file.buffer);
  } catch {
    res.status(400).json({ ok: false, error: "unsupported_image_format", message: "PNG, JPG, GIF, or WebP image is required." });
    return;
  }
  if (!dims.width || !dims.height) {
    res.status(400).json({ ok: false, error: "invalid_image_size", message: "Image width and height could not be verified." });
    return;
  }

  await fs.mkdir(uploadDir, { recursive: true });
  const originalName = fixMojibakeFilename(req.file.originalname) || "image";
  const ext = extFromMime(req.file.mimetype, originalName);
  const storedName = `${Date.now()}_${crypto.randomBytes(8).toString("hex")}${ext}`;
  const filePath = path.join(uploadDir, storedName);
  await fs.writeFile(filePath, req.file.buffer);

  const description = String(req.body?.description || "").trim();
  const tags = normalizeTags(req.body?.tags);
  const [result] = await pool.execute(
    `INSERT INTO resource_images
       (host_id, original_name, stored_name, mime_type, file_size, width, height, description, tags, file_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.session.host!.id,
      originalName.slice(0, 255),
      storedName,
      String(req.file.mimetype || "").slice(0, 100),
      req.file.size,
      dims.width,
      dims.height,
      description || null,
      tags || null,
      filePath,
    ],
  );

  const [rows] = await pool.execute("SELECT * FROM resource_images WHERE id = ?", [(result as any).insertId]);
  res.json({ ok: true, image: mapImageRow((Array.isArray(rows) ? rows[0] : null) as any) });
});

export default router;
