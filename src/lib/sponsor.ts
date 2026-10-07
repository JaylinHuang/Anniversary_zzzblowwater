import fs from "fs";
import path from "path";
import { getDb, rowFrom, withDb } from "@/lib/db";
import {
  normalizeSponsorNote,
  sponsorImageKind,
  type SponsorCard,
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
