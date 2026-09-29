import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent } from "@sentry/nextjs";

type Service =
  | "mongodb"
  | "redis"
  | "resend"
  | "openai"
  | "turnstile"
  | "push"
  | "translate";

/**
 * Report an unexpected server error that a catch block handled (so it never
 * reaches Sentry on its own). Not for expected cases — bad input, rate-limited
 * callers, not-found. Context becomes Sentry tags, so keep it to identifiers:
 * never emails, tokens, or post text.
 */
export function reportError(
  error: unknown,
  context: { route: string; service?: Service }
): void {
  Sentry.captureException(error, { tags: context });
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/**
 * beforeSend for every Sentry.init: provider and DB errors can echo an address
 * back (Resend rejections, Mongo duplicate-key messages), so redact any email
 * anywhere in the event, breadcrumbs included.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  return JSON.parse(JSON.stringify(event).replace(EMAIL_RE, "[email]"));
}
