/**
 * 加载 .env 后向发件人自己的 QQ 邮箱发一封测试验证码
 */
import fs from "fs";
import path from "path";
import { generateQqCode } from "../src/lib/qq-verify";
import { getMailConfig, sendQqVerifyEmail } from "../src/lib/mail";

function loadEnvFile() {
  const p = path.join(process.cwd(), ".env");
  if (!fs.existsSync(p)) {
    console.error("找不到 .env:", p);
    return;
  }
  // 去掉可能的 UTF-8 BOM
  const raw = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
  let loaded = 0;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim().replace(/^\uFEFF/, "");
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
    loaded += 1;
    if (key.startsWith("QQ_SMTP_")) {
      console.log(`已加载 ${key}（长度 ${val.length}）`);
    }
  }
  console.log("从 .env 加载变量条数:", loaded);
}

async function main() {
  loadEnvFile();
  const cfg = getMailConfig();
  if (!cfg) {
    console.error(
      "未检测到 QQ_SMTP_USER / QQ_SMTP_PASS。请确认 .env 中两行均已填写且无多余空格。",
    );
    process.exit(1);
  }
  console.log("SMTP host:", cfg.host, "port:", cfg.port);
  console.log("发件人:", cfg.user);
  console.log("收件人:", cfg.user, "(发给自己做连通测试)");

  const code = generateQqCode();
  await sendQqVerifyEmail(cfg.user, code);
  console.log("发送成功。请打开 QQ 邮箱查收，主题含「建档验证码」。");
  console.log("测试码（仅本机终端可见）:", code);
}

main().catch((e) => {
  console.error("发送失败:", e instanceof Error ? e.message : e);
  process.exit(1);
});
