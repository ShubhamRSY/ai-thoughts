import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/keeper", "/app", "/owner", "/sign-in"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
