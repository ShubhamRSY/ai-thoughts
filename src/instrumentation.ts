import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { scrubEvent } = await import("@/lib/report-error");
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
      beforeSend: scrubEvent,
    });

    const { warnIfProductionEnvIncomplete } = await import("@/lib/env");
    warnIfProductionEnvIncomplete();
  }
}

// Errors that escape a route (uncaught) — handled ones go through reportError.
export const onRequestError = Sentry.captureRequestError;
