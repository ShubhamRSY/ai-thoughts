/** Product naming — one source for UI chrome. */
export const BRAND = {
  name: "AI·Thoughts",
  /** Compact label beside the logo / tight chrome */
  shortName: "AiTo",
  /** Short line under / beside the brand — what this place is for */
  tagline: "Say how AI makes you feel — love it, fear it, or both.",
  /** One-line promise for landing / share cards */
  promise: "Express yourself about AI. Not tips. Not debates. Your honest feeling.",
  /** Replaces “pulse” — the living community of shared takes */
  community: "Voices",
  communityShort: "Voices",
  footerLine: "Every feeling about AI belongs here — the good and the hard.",
  /** Trust line shown at sign-in and in the footer. */
  trustLine: "Real humans moderate.",
  /** Who runs the place — small, human, accountable. */
  runBy: "AiTo · made by Aito Social",
  shareCta: "Share your feeling",
  shareTitle: "Share your feeling",
  shareSuccess: "Your feeling is live.",
  shareSuccessSub: "It’s in Voices — open it to see it with replies and reactions.",
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
      body: "Love it, it hurts, you’re worried, amazed — whatever is true.",
    },
    {
      title: "Say it your way",
      body: "Voice, video, or a few words. No polish required.",
    },
    {
      title: "Feel with others",
      body: "React, reply, and sit with people who feel the same.",
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
