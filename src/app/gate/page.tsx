import { Suspense } from "react";
import { GateForm } from "./GateForm";

export default function GatePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="glow-orb absolute left-1/2 top-1/4 h-64 w-64 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(61,224,208,0.25),transparent_70%)]" />
      <Suspense fallback={<div className="text-[var(--fog)]">加载中…</div>}>
        <GateForm />
      </Suspense>
    </main>
  );
}
