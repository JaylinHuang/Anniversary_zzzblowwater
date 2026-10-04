import nodemailer from "nodemailer";
import { GROUP_NAME, SITE_BRAND } from "@/lib/constants";

export type MailConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

export function getMailConfig(): MailConfig | null {
  const user = process.env.QQ_SMTP_USER?.trim();
  const pass = process.env.QQ_SMTP_PASS?.trim();
  if (!user || !pass) return null;
  const host = process.env.QQ_SMTP_HOST?.trim() || "smtp.qq.com";
  const port = Number(process.env.QQ_SMTP_PORT || "465");
  const from = process.env.QQ_SMTP_FROM?.trim() || user;
  return { host, port, user, pass, from };
}

export function isMailConfigured() {
  return getMailConfig() != null;
}

/** 向 QQ 邮箱发送建档验证码（发件人为配置的管理员 QQ 邮箱） */
export async function sendQqVerifyEmail(toQqMail: string, code: string) {
  const cfg = getMailConfig();
  if (!cfg) {
    throw new Error("MAIL_NOT_CONFIGURED");
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
  });

  await transporter.sendMail({
    from: `"${SITE_BRAND}" <${cfg.from}>`,
    to: toQqMail,
    subject: `【${GROUP_NAME}】建档验证码 ${code}`,
    text: [
      `你好，这是「${SITE_BRAND}」的建档验证码。`,
      ``,
      `验证码：${code}`,
      `有效期：5 分钟（重新发送会使旧码失效）。`,
      ``,
      `若非本人操作，请忽略本邮件。`,
    ].join("\n"),
    html: `<p>你好，这是「${SITE_BRAND}」的建档验证码。</p>
<p style="font-size:24px;letter-spacing:4px;"><b>${code}</b></p>
<p>有效期 5 分钟；重新发送会使旧码失效。</p>
<p style="color:#888">若非本人操作，请忽略本邮件。</p>`,
  });
}
