/** Product naming — one source for UI chrome. */
export const BRAND = {
  name: "AI·Thoughts",
  /** Compact label beside the logo / tight chrome */
  shortName: "AiTo",
  /** Short line under / beside the brand — what this place is for */
  tagline: "Say how AI makes you feel — love it, fear it, or both.",
  /** One-line promise for landing / share cards */
  promise: "Voice your feeling and your take on AI — not tips, not debates. Then find the people who feel it too.",
  /** Replaces “pulse” — the living community of shared takes */
  community: "Voices",
  communityShort: "Voices",
  footerLine: "Every feeling and every perspective on AI belongs here — and someone out there feels it too.",
  /** Trust line shown at sign-in and in the footer. */
  trustLine: "Real humans moderate.",
  shareCta: "Share your feeling",
  shareTitle: "Share your feeling",
  shareSuccess: "Your feeling is live.",
  shareSuccessSub: "It’s in Voices — people who feel the same can reply, react, and connect with you.",
  openCta: "Open Voices",
  homeNav: "Voices",
  /**
   * Microsoft Store listing for Windows.
   * Set NEXT_PUBLIC_MS_STORE_URL after Partner Center publishes the app.
   * Empty = no Windows mention anywhere in the UI (no “coming soon”, no GitHub).
   */
  // Live listing ("Aito" by Aito Social). NEXT_PUBLIC_MS_STORE_URL overrides it; "" hides it.
  windowsStoreUrl: (process.env.NEXT_PUBLIC_MS_STORE_URL ?? "https://apps.microsoft.com/detail/9MZ2LT2MJLX1").trim(),
  /** Payment link (Stripe Payment Link / Ko-fi / GitHub Sponsors). Empty = no Support page or footer link. */
  supportUrl: (process.env.NEXT_PUBLIC_SUPPORT_URL || "").trim(),
  windowsStoreLabel: "Get it on Microsoft Store",
  dignityNote:
    "Be honest about how AI feels — love it or critique it. Personal attacks, hate speech, and sexual content don’t belong here.",
  /** Three things you do here — keep short */
  whatYouDo: [
    {
      title: "Pick a feeling",
      body: "Love it, it hurts, you’re worried, amazed — whatever is true for you.",
    },
    {
      title: "Say it your way",
      body: "Your opinion, your perspective — in voice, video, or a few words. No polish required.",
    },
    {
      title: "Find your people",
      body: "React, reply, and connect with people who see AI the way you do — or who see it differently.",
    },
  ],
} as const;

export const SUGGESTED_TAGS = [
  "#Sleek",
  "#Slop",
  "#Jobs",
  "#Ethics",
  "#Future",
  "#Bias",
  "#Tools",
  "#OpenSource",
] as const;
