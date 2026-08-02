/**
 * HTTP 冒烟：需本地已 npm run dev（默认 http://localhost:3000）
 * 用法：npm run smoke
 */
import fs from "fs";
import path from "path";

const BASE = process.env.SMOKE_BASE || "http://localhost:3000";

function loadPassphrase(): string {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf8");
    const m = text.match(/^\s*SITE_PASSPHRASE\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return process.env.SITE_PASSPHRASE || "zzzblowwater";
}

async function main() {
  const passphrase = loadPassphrase();
  console.log(`== smoke @ ${BASE} ==`);

  const health = await fetch(`${BASE}/api/health`);
  const healthJson = await health.json();
  if (!health.ok || !healthJson.ok) {
    throw new Error(`health 失败: ${health.status} ${JSON.stringify(healthJson)}`);
  }
  if (!healthJson.groupName) {
    throw new Error("health 缺少 groupName");
  }
  console.log(
    `  ✓ /api/health db=${healthJson.db} messages=${healthJson.messages} group=${healthJson.groupName}`,
  );

  const unlock = await fetch(`${BASE}/api/auth/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase }),
  });
  const unlockJson = await unlock.json().catch(() => ({}));
  if (!unlock.ok) {
    throw new Error(`unlock 失败: ${unlock.status} ${JSON.stringify(unlockJson)}`);
  }
  const setCookie = unlock.headers.getSetCookie?.() || [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  console.log("  ✓ /api/auth/unlock");

  const gate = await fetch(`${BASE}/gate`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
  });
  if (gate.status >= 500) {
    throw new Error(`/gate 500: ${gate.status}`);
  }
  console.log(`  ✓ /gate status=${gate.status}`);

  // 未登录访问首页应被重定向到 gate（或 307）
  const home = await fetch(`${BASE}/`, { redirect: "manual" });
  if (![200, 307, 302, 303, 308].includes(home.status)) {
    throw new Error(`首页异常 status=${home.status}`);
  }
  console.log(`  ✓ / status=${home.status}`);

  console.log("冒烟通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
