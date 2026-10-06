import { redirect } from "next/navigation";
import { PageStage } from "@/components/fx/PageStage";
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
    <PageStage
      code="HDD-00"
      channel="AVATAR"
      title={forced ? "设置你的头像" : "更换头像"}
      lede={
        forced
          ? "新账号需要设置头像，之后会显示在昵称旁，方便群友认出你。"
          : "上传正方形清晰图片效果更好，不超过 2MB。"
      }
    >
      <div className="max-w-lg">
        <AvatarSetupClient
          displayName={user.displayName}
          currentUrl={user.avatarUrl}
          forceSetup={forced}
        />
      </div>
    </PageStage>
  );
}
