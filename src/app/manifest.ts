import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI·Thoughts — The Public Pulse",
    short_name: "AI·Thoughts",
    description:
      "Share how you really feel about AI — voice, video, or words. All ages, all languages, one pulse.",
    id: "/",
    start_url: "/",
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
