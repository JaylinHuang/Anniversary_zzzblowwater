import { DEFAULT_PASSPHRASE } from "@/lib/constants";
import { getDb, rowFrom, withDb } from "@/lib/db";
import { hashPassphrase, safeEqualStr } from "@/lib/passphrase-hash";

export const PASSPHRASE_HASH_KEY = "gate_passphrase_hash";
export { hashPassphrase } from "@/lib/passphrase-hash";

export function envPassphraseFallback() {
  return process.env.SITE_PASSPHRASE || DEFAULT_PASSPHRASE;
}

/** 是否已由管理员在库内设置过口令（优先于 .env） */
export async function hasDbPassphrase(): Promise<boolean> {
  const db = await getDb();
  const row = rowFrom<{ value: string }>(
    db,
    `SELECT value FROM site_settings WHERE key = ?`,
    [PASSPHRASE_HASH_KEY],
  );
  return Boolean(row?.value);
}

export async function verifyPassphrase(input: string): Promise<boolean> {
  const db = await getDb();
  const row = rowFrom<{ value: string }>(
    db,
    `SELECT value FROM site_settings WHERE key = ?`,
    [PASSPHRASE_HASH_KEY],
  );
  if (row?.value) {
    return safeEqualStr(hashPassphrase(input), row.value);
  }
  const expected = envPassphraseFallback();
  return safeEqualStr(input.normalize(), expected.normalize());
}

/**
 * 仅管理员调用：校验当前口令后写入新口令哈希。
 * 库内口令优先生效，普通成员无法改。
 */
export async function updatePassphraseByAdmin(params: {
  current: string;
  next: string;
}) {
  const current = String(params.current || "");
  const next = String(params.next || "").trim();
  if (!(await verifyPassphrase(current))) {
    throw new Error("当前口令不正确");
  }
  if (next.length < 4 || next.length > 64) {
    throw new Error("新口令长度需为 4–64");
  }
  if (next === current) {
    throw new Error("新口令不能与当前口令相同");
  }
  const hashed = hashPassphrase(next);
  await withDb((db) => {
    db.run(
      `INSERT INTO site_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [PASSPHRASE_HASH_KEY, hashed],
    );
  });
}
