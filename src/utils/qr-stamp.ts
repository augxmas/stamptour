import fs from "node:fs";
import { PNG } from "pngjs";

// 5x7 비트맵 글리프 (P, A, I, D) — Gift 사용 후 "PAID" 라벨용
const GLYPHS: Record<string, string[]> = {
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
};

/**
 * Gift QR PNG에 'PAID' 라벨을 새겨 더 이상 스캔되지 않게 만든다.
 *  1) 전체 대비를 크게 낮춰(밝게 블렌딩) QR 패턴을 인식 불가하게 함
 *  2) 중앙에 굵은 빨강 "PAID" 라벨을 불투명하게 그림
 * 실패해도 호출부에 영향이 없도록 예외는 던지지 않는다(상위에서 try/catch).
 */
export function stampPaidOnPng(filePath: string): void {
  if (!filePath || !fs.existsSync(filePath)) return;

  const png = PNG.sync.read(fs.readFileSync(filePath));
  const { width, height, data } = png;

  // 1) 대비 낮추기 — QR을 흐리게 하여 스캔 불가
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(data[i] * 0.18 + 255 * 0.82);
    data[i + 1] = Math.round(data[i + 1] * 0.18 + 255 * 0.82);
    data[i + 2] = Math.round(data[i + 2] * 0.18 + 255 * 0.82);
  }

  // 2) 중앙 "PAID" 라벨
  const text = "PAID";
  const cols = 5, rows = 7, gap = 1;
  const totalCols = text.length * cols + (text.length - 1) * gap;
  const scale = Math.max(2, Math.floor((width * 0.72) / totalCols));
  const textW = totalCols * scale;
  const textH = rows * scale;
  const startX = Math.floor((width - textW) / 2);
  const startY = Math.floor((height - textH) / 2);
  const R = 220, G = 38, B = 38;

  const setPx = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = (y * width + x) * 4;
    data[idx] = R; data[idx + 1] = G; data[idx + 2] = B; data[idx + 3] = 255;
  };

  let penX = startX;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (glyph) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (glyph[r][c] === "1") {
            for (let dy = 0; dy < scale; dy++) {
              for (let dx = 0; dx < scale; dx++) {
                setPx(penX + c * scale + dx, startY + r * scale + dy);
              }
            }
          }
        }
      }
    }
    penX += (cols + gap) * scale;
  }

  fs.writeFileSync(filePath, PNG.sync.write(png));
}
