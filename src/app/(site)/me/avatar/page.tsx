import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AvatarSetupClient } from "./AvatarSetupClient";

export default async function AvatarSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/gate");
  const sp = await searchParams;
  const forced = sp.setup === "1" && !user.avatarUrl;

  return (
    <div className="mx-auto max-w-lg">
      <p className="text-xs tracking-[0.28em] text-[var(--amber)]">AVATAR</p>
      <h1 className="brand-font mt-2 text-3xl text-[var(--cyan)]">
        {forced ? "设置你的头像" : "更换头像"}
      </h1>
      <p className="mt-2 text-sm text-[var(--fog)]">
        {forced
          ? "新账号需要设置头像，之后会显示在昵称旁，方便群友认出你。"
          : "上传正方形清晰图片效果更好，不超过 2MB。"}
      </p>
      <AvatarSetupClient
        displayName={user.displayName}
        currentUrl={user.avatarUrl}
        forceSetup={forced}
      />
    </div>
  );
}
