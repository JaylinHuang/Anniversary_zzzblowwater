import { redirect } from "next/navigation";
import { PageStage } from "@/components/fx/PageStage";
import { getSessionUser } from "@/lib/auth";
import { listMyFeedback } from "@/lib/feedback";
import { FeedbackClient } from "./FeedbackClient";

export default async function FeedbackPage() {
  const user = await getSessionUser();
  if (!user) redirect("/gate");
  const items = await listMyFeedback(user.id);
  return (
    <PageStage
      code="HDD-FB"
      channel="FEEDBACK"
      title="提意见"
      lede="一次可以交多条。管理员处理后，结果会显示在你提交的那一条上。"
    >
      <FeedbackClient items={items} />
    </PageStage>
  );
}
