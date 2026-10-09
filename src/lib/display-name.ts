/** People are shown by first name only; falls back to the handle (without "@"). */
export function firstName(name: string | null | undefined, handle = ""): string {
  return name?.trim().split(/\s+/)[0] || handle.trim().replace(/^@/, "");
}
