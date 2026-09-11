/** True when the BCP-47 tag is English (en, en-US, en-GB, …). */
export function isEnglishLang(code?: string | null): boolean {
  if (!code) return false;
  const base = code.trim().toLowerCase().split(/[-_]/)[0];
  return base === "en";
}

export async function translateToEnglish(
  text: string,
  sourceLang?: string
): Promise<{ translation: string; detected?: string }> {
  const trimmed = text.trim();
  if (!trimmed) return { translation: "" };
  if (trimmed.length > 4500) {
    throw new Error("Text is too long to translate");
  }

  const source = sourceLang?.trim()
    ? sourceLang.trim().toLowerCase().split(/[-_]/)[0]
    : "Autodetect";

  const langpair = `${source === "autodetect" ? "Autodetect" : source}|en`;
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", trimmed.slice(0, 4500));
  url.searchParams.set("langpair", langpair);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error("Translation service unavailable");
  }

  const data = (await res.json()) as {
    responseData?: { translatedText?: string };
    responseStatus?: number | string;
    responseDetails?: string;
  };

  const status = Number(data.responseStatus);
  if (status && status !== 200) {
    throw new Error(data.responseDetails || "Translation failed");
  }

  const translation = data.responseData?.translatedText?.trim();
  if (!translation) {
    throw new Error("No translation returned");
  }

  if (/^INVALID /i.test(translation)) {
    if (source !== "Autodetect") {
      return translateToEnglish(trimmed, undefined);
    }
    throw new Error("Could not detect language");
  }

  return { translation, detected: source === "autodetect" ? undefined : source };
}
