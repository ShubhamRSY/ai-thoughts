export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { warnIfProductionEnvIncomplete } = await import("@/lib/env");
    warnIfProductionEnvIncomplete();
  }
}
