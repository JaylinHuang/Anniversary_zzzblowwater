export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startDailyFlushLoop } = await import("@/lib/daily-flush");
  startDailyFlushLoop();
}
