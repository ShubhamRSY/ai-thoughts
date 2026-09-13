import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI·Thoughts — Honest takes on AI",
    short_name: "AI·Thoughts",
    description:
      "Honest takes on how AI is changing us — voice, video, or words. All ages, all languages.",
    id: "/app",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f2f0eb",
    theme_color: "#1f4d45",
    categories: ["social", "news", "entertainment"],
    lang: "en",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
