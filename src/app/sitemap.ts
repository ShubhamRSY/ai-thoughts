import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const lastModified = new Date("2026-09-16");

  return [
    "",
    "/sign-in",
    "/install",
    "/terms",
    "/privacy",
    "/guidelines",
    "/trust",
    "/contact",
  ].map((path) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency: path === "" ? "hourly" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
