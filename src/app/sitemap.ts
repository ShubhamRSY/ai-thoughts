import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";
import { BRAND } from "@/lib/brand";
import { FEELINGS } from "@/lib/feelings";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const lastModified = new Date("2026-10-17");

  return [
    "",
    // Public, ungated content surfaces — the SEO entry points.
    "/pulse",
    ...FEELINGS.map((f) => `/pulse/${f.id}`),
    "/install",
    "/terms",
    "/privacy",
    "/guidelines",
    "/trust",
    "/contact",
    // /support 404s unless NEXT_PUBLIC_SUPPORT_URL is set.
    ...(BRAND.supportUrl ? ["/support"] : []),
    "/dmca",
  ].map((path) => {
    const isPulse = path === "/pulse" || path.startsWith("/pulse/");
    return {
      url: `${base}${path}`,
      lastModified,
      changeFrequency: path === "" || path === "/pulse" ? "hourly" : isPulse ? "daily" : "monthly",
      priority: path === "" ? 1 : path === "/pulse" ? 0.9 : isPulse ? 0.7 : 0.6,
    };
  });
}
