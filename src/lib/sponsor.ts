import fs from "fs";
import path from "path";
import { getDb, rowFrom, rowsFrom, withDb } from "@/lib/db";
import {
  normalizeSponsorGiftNote,
  normalizeSponsorNote,
  parseSponsorYuan,
  sponsorImageKind,
  type SponsorCard,
  type SponsorEntry,
  type SponsorMember,
  type SponsorTotal,
} from "@/lib/sponsor-shared";

const QR_KEY = "sponsor_qr_url";
const NOTE_KEY = "sponsor_note";
const QR_URL = /^\/uploads\/sponsor-qr-\d+\.(png|jpe?g|webp)$/;
const MAX_BYTES = 2 * 1024 * 1024;

function readSetting(db: Awaited<ReturnType<typeof getDb>>, key: string): string {
  return (
    rowFrom<{ value: string }>(db, `SELECT value FROM site_settings WHERE key = ?`, [key])
      ?.value ?? ""
  );
}

function writeSetting(
  db: Awaited<ReturnType<typeof getDb>>,
  key: string,
  value: string,
) {
  db.run(
    `INSERT INTO site_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

function safeQrUrl(raw: string): string | null {
  const url = raw.trim();
  return QR_URL.test(url) ? url : null;
}

function unlinkQr(url: string) {
  if (!QR_URL.test(url)) return;
  const filePath = path.join(process.cwd(), "data", "uploads", path.basename(url));
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* 旧文件删不掉不影响新码生效 */
  }
}

export async function readSponsorCard(): Promise<SponsorCard> {
  const db = await getDb();
  return {
    qrUrl: safeQrUrl(readSetting(db, QR_KEY)),
    note: readSetting(db, NOTE_KEY).trim().slice(0, 80),
  };
}

/** 管理员更换说明。收款码保持不动 */
export async function writeSponsorNote(raw: unknown): Promise<string> {
  const note = normalizeSponsorNote(raw);
  await withDb((db) => {
    writeSetting(db, NOTE_KEY, note);
  });
  return note;
}

/** 管理员上传微信收款码，并换掉上一张 */
export async function writeSponsorQr(file: File, noteRaw: unknown): Promise<SponsorCard> {
  const note = normalizeSponsorNote(noteRaw);
  if (file.size <= 0 || file.size > MAX_BYTES) {
    throw new Error("收款码图片需在 2MB 以内");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sponsorImageKind(buf);
  if (!kind) throw new Error("请上传 png、jpg 或 webp 收款码");
  const ext = kind === "jpeg" ? ".jpg" : `.${kind}`;
  const name = `sponsor-qr-${Date.now()}${ext}`;
  const dir = path.join(process.cwd(), "data", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buf);
  const url = `/uploads/${name}`;
  let previous = "";
  await withDb((db) => {
    previous = readSetting(db, QR_KEY);
    writeSetting(db, QR_KEY, url);
    writeSetting(db, NOTE_KEY, note);
  });
  if (previous && previous !== url) unlinkQr(previous);
  return { qrUrl: url, note };
}

/** 撤下收款码。说明留着，方便下次再挂上 */
export async function clearSponsorQr(): Promise<void> {
  let previous = "";
  await withDb((db) => {
    previous = readSetting(db, QR_KEY);
    writeSetting(db, QR_KEY, "");
  });
  if (previous) unlinkQr(previous);
}

export type SponsorLedgerView = {
  totals: SponsorTotal[];
  entries: SponsorEntry[];
  members: SponsorMember[];
};

function mapEntry(row: {
  id: number;
  user_id: number;
  display_name: string;
  avatar_url: string | null;
  amount_fen: number;
  note: string;
  created_at: string;
}): SponsorEntry {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    displayName: String(row.display_name || "群友"),
    avatarUrl: row.avatar_url,
    amountFen: Number(row.amount_fen) || 0,
    note: String(row.note || ""),
    createdAt: String(row.created_at || ""),
  };
}

/** 后台按人累计，另附最近明细和可选的群友名单 */
export async function readSponsorLedger(): Promise<SponsorLedgerView> {
  const db = await getDb();
  const totals = rowsFrom<{
    user_id: number;
    display_name: string;
    avatar_url: string | null;
    total_fen: number;
    n: number;
  }>(
    db,
    `SELECT u.id as user_id, u.display_name, u.avatar_url,
            SUM(s.amount_fen) as total_fen, COUNT(*) as n
     FROM sponsor_ledger s
     JOIN users u ON u.id = s.user_id
     GROUP BY u.id
     ORDER BY total_fen DESC, u.id
     LIMIT 200`,
  ).map((row) => ({
    userId: Number(row.user_id),
    displayName: String(row.display_name || "群友"),
    avatarUrl: row.avatar_url,
    totalFen: Number(row.total_fen) || 0,
    count: Number(row.n) || 0,
  }));
  const entries = rowsFrom<Parameters<typeof mapEntry>[0]>(
    db,
    `SELECT s.id, s.user_id, u.display_name, u.avatar_url,
            s.amount_fen, s.note, s.created_at
     FROM sponsor_ledger s
     JOIN users u ON u.id = s.user_id
     ORDER BY s.id DESC
     LIMIT 80`,
  ).map(mapEntry);
  const members = rowsFrom<{ id: number; display_name: string }>(
    db,
    `SELECT id, display_name FROM users ORDER BY id DESC LIMIT 300`,
  ).map((row) => ({
    id: Number(row.id),
    displayName: String(row.display_name || "群友"),
  }));
  return { totals, entries, members };
}

/** 当前用户自己登记过的累计 */
export async function readMySponsor(userId: number): Promise<{
  totalFen: number;
  entries: SponsorEntry[];
}> {
  const db = await getDb();
  const total =
    rowFrom<{ total_fen: number }>(
      db,
      `SELECT COALESCE(SUM(amount_fen), 0) as total_fen
       FROM sponsor_ledger WHERE user_id = ?`,
      [userId],
    )?.total_fen ?? 0;
  const entries = rowsFrom<Parameters<typeof mapEntry>[0]>(
    db,
    `SELECT s.id, s.user_id, u.display_name, u.avatar_url,
            s.amount_fen, s.note, s.created_at
     FROM sponsor_ledger s
     JOIN users u ON u.id = s.user_id
     WHERE s.user_id = ?
     ORDER BY s.id DESC
     LIMIT 20`,
    [userId],
  ).map(mapEntry);
  return { totalFen: Number(total) || 0, entries };
}

/** 记一笔。微信不会回传金额，所以只能记登记下来的数 */
export async function addSponsorEntry(
  userId: number,
  amountRaw: unknown,
  noteRaw: unknown,
): Promise<number> {
  const amountFen = parseSponsorYuan(amountRaw);
  const note = normalizeSponsorGiftNote(noteRaw);
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("请选择群友");
  let id = 0;
  await withDb((db) => {
    const user = rowFrom<{ id: number }>(db, `SELECT id FROM users WHERE id = ?`, [userId]);
    if (!user) throw new Error("找不到这个群友");
    db.run(
      `INSERT INTO sponsor_ledger (user_id, amount_fen, note) VALUES (?, ?, ?)`,
      [userId, amountFen, note],
    );
    const row = rowFrom<{ id: number }>(db, `SELECT last_insert_rowid() as id`);
    id = Number(row?.id) || 0;
  });
  return id;
}

/** 删掉填错的一笔，累计会跟着变 */
export async function removeSponsorEntry(idRaw: unknown): Promise<void> {
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) throw new Error("找不到这笔记录");
  await withDb((db) => {
    const row = rowFrom<{ id: number }>(db, `SELECT id FROM sponsor_ledger WHERE id = ?`, [id]);
    if (!row) throw new Error("找不到这笔记录");
    db.run(`DELETE FROM sponsor_ledger WHERE id = ?`, [id]);
  });
}
