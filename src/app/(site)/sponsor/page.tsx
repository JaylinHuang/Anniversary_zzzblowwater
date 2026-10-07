import { redirect } from "next/navigation";
import { PageStage } from "@/components/fx/PageStage";
import { getSessionUser, isAdmin } from "@/lib/auth";
import { readSponsorCard } from "@/lib/sponsor";
import { SponsorClient } from "./SponsorClient";

export default async function SponsorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/gate");
  const card = await readSponsorCard();
  const { error } = await searchParams;
  return (
    <PageStage
      code="HDD-SP"
      channel="SPONSOR"
      title="赞助研发"
      lede="用微信扫一扫，向管理员赞助研发经费。"
    >
      <SponsorClient card={card} isAdmin={isAdmin(user.role)} formError={error || ""} />
    </PageStage>
  );
}
