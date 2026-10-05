import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const lastModified = new Date("2026-09-16");

  return [
    "",
    // Content lives behind sign-in (decision.md: members-only reads), so only
    // public pages are listed. /sign-in is disallowed in robots.ts.
    "/install",
    "/terms",
    "/privacy",
    "/guidelines",
    "/trust",
    "/contact",
    "/support",
    "/dmca",
  ].map((path) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency: path === "" ? "hourly" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
