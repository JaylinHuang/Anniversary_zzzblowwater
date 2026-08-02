import { notFound } from "next/navigation";
import { assertModuleEnabled } from "@/lib/modules";
import type { ModuleKey } from "@/lib/constants";

/** 页面侧模块开关：关闭则 404 */
export async function requireModule(key: ModuleKey) {
  try {
    await assertModuleEnabled(key);
  } catch {
    notFound();
  }
}
