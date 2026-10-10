export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { siteLog } = await import("@/lib/site-log");
  const { startDailyFlushLoop } = await import("@/lib/daily-flush");
  const g = globalThis as { __siteLogWatch?: boolean };
  if (!g.__siteLogWatch) {
    g.__siteLogWatch = true;
    siteLog("info", "boot", "进程已启动");
    const pulse = () => siteLog("info", "pulse", "进程仍在运行");
    const timer = setInterval(pulse, 5 * 60 * 1000);
    timer.unref?.();
    process.on("unhandledRejection", (reason) => {
      const message = reason instanceof Error ? reason.message : "未处理的异常";
      siteLog("error", "process", message);
    });
  }
  startDailyFlushLoop();
}
