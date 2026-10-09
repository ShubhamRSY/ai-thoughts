/**
 * People are shown by first name only; falls back to the handle (without "@").
 * ALL-CAPS or all-lowercase names are tidied ("SHUBHAM" → "Shubham"); mixed
 * case like "DeShawn" is left as typed.
 */
export function firstName(name: string | null | undefined, handle = ""): string {
  const first = name?.trim().split(/\s+/)[0];
  if (!first) return handle.trim().replace(/^@/, "");
  if (first !== first.toUpperCase() && first !== first.toLowerCase()) return first;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
