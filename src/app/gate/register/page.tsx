import { Suspense } from "react";
import { GateStage } from "@/components/fx/GateStage";
import { RegisterForm } from "../RegisterForm";

/* 刊头读数依赖当天日期，不做静态化 */
export const dynamic = "force-dynamic";

export default function GateRegisterPage() {
  return (
    <GateStage mode="register">
      <Suspense
        fallback={
          <div className="mono text-sm tracking-[0.2em] text-[var(--fog)]">▸ 加载中…</div>
        }
      >
        <RegisterForm />
      </Suspense>
    </GateStage>
  );
}
