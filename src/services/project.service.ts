import bcrypt from "bcryptjs";
import pool from "../config/database";

export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

export function todayLocalDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function yyyymmdd(inputDate: Date): string {
  const yyyy = inputDate.getFullYear();
  const mm = String(inputDate.getMonth() + 1).padStart(2, "0");
  const dd = String(inputDate.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

export async function nextProjectSerial(connection: any, nowDate: Date): Promise<string> {
  const dateKey = yyyymmdd(nowDate);

  const [rows] = await connection.execute(
    "SELECT seq_date, last_no FROM project_daily_sequences WHERE seq_date = ? FOR UPDATE",
    [dateKey],
  );

  let nextNo = 1;
  if (Array.isArray(rows) && rows.length > 0) {
    nextNo = Number(rows[0].last_no) + 1;
    await connection.execute("UPDATE project_daily_sequences SET last_no = ? WHERE seq_date = ?", [nextNo, dateKey]);
  } else {
    await connection.execute("INSERT INTO project_daily_sequences (seq_date, last_no) VALUES (?, ?)", [dateKey, 1]);
  }

  return `${dateKey}_${String(nextNo).padStart(4, "0")}`;
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

export function validateProjectDates(fromDate: string, toDate: string): { ok: boolean; message?: string } {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (from.getTime() < today.getTime()) {
    return { ok: false, message: "시작일은 오늘 이전일 수 없습니다." };
  }

  const minTo = new Date(from);
  minTo.setDate(minTo.getDate() + 4);

  if (to.getTime() < minTo.getTime()) {
    return { ok: false, message: "프로젝트 이용일은 최소 5일 이상이어야 합니다." };
  }

  return { ok: true };
}

export async function nextLocationNumbers(projectId: number): Promise<{ locationSeq: number; displaySeq: number | null }> {
  const [allRows] = await pool.execute(
    "SELECT location_seq, display_seq, disabled FROM project_locations WHERE project_id = ? ORDER BY location_seq ASC",
    [projectId],
  );

  const rows = Array.isArray(allRows) ? allRows as Array<{ location_seq: number; display_seq: number; disabled: number }> : [];
  const maxSeq = rows.reduce((acc, row) => Math.max(acc, Number(row.location_seq)), 0);
  const nextSeq = maxSeq + 1;

  const usedActiveDisplay = new Set<number>();
  for (const row of rows) {
    if (Number(row.disabled) === 0) {
      usedActiveDisplay.add(Number(row.display_seq));
    }
  }

  let display: number | null = null;
  for (let i = 1; i <= 15; i += 1) {
    if (!usedActiveDisplay.has(i)) {
      display = i;
      break;
    }
  }

  return { locationSeq: nextSeq, displaySeq: display };
}
