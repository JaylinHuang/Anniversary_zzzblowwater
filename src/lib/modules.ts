import { getDb, rowsFrom, withDb } from "@/lib/db";
import { MODULE_KEYS, type ModuleKey } from "@/lib/constants";

export async function getFeatureFlags(): Promise<Record<ModuleKey, boolean>> {
  const db = await getDb();
  const rows = rowsFrom<{ module_key: string; enabled: number }>(
    db,
    `SELECT module_key, enabled FROM feature_flags`,
  );
  const map = Object.fromEntries(
    MODULE_KEYS.map((k) => [k, true]),
  ) as Record<ModuleKey, boolean>;
  for (const row of rows) {
    if (MODULE_KEYS.includes(row.module_key as ModuleKey)) {
      map[row.module_key as ModuleKey] = !!row.enabled;
    }
  }
  return map;
}

export async function setFeatureFlag(key: ModuleKey, enabled: boolean) {
  await withDb((db) => {
    db.run(
      `INSERT INTO feature_flags (module_key, enabled) VALUES (?, ?)
       ON CONFLICT(module_key) DO UPDATE SET enabled = excluded.enabled`,
      [key, enabled ? 1 : 0],
    );
  });
}

export async function assertModuleEnabled(key: ModuleKey) {
  const flags = await getFeatureFlags();
  if (!flags[key]) {
    throw new Error("MODULE_DISABLED");
  }
}
