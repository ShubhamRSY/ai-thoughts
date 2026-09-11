import type { Thought, Reaction, LanguageOption } from "./types";
import { fakeHash } from "./integrity";

export const TAG_OPTIONS = [
  "#Sleek",
  "#Slop",
  "#Jobs",
  "#Ethics",
  "#Future",
  "#Bias",
  "#Tools",
  "#OpenSource",
] as const;

export const REACTION_TYPES: Reaction[] = ["🔥", "😂", "🤔", "💯", "🚀", "😴", "👏", "🙌"];

// Ordered roughly by global speaker count within each region cluster.
// RTL scripts (ar, he, fa, ur) are flagged in isRtlLang() below — content
// itself renders with dir="auto" regardless, this list just drives the
// picker and the "language" chip shown on a take.
export const LANGS: LanguageOption[] = [
  // Global / Americas
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
  { code: "pl", label: "Polski", flag: "🇵🇱" },
  { code: "ro", label: "Română", flag: "🇷🇴" },
  { code: "sv", label: "Svenska", flag: "🇸🇪" },
  { code: "el", label: "Ελληνικά", flag: "🇬🇷" },
  { code: "uk", label: "Українська", flag: "🇺🇦" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "tr", label: "Türkçe", flag: "🇹🇷" },
  // South / Southeast / East Asia
  { code: "hi", label: "हिन्दी", flag: "🇮🇳" },
  { code: "bn", label: "বাংলা", flag: "🇧🇩" },
  { code: "ta", label: "தமிழ்", flag: "🇮🇳" },
  { code: "te", label: "తెలుగు", flag: "🇮🇳" },
  { code: "mr", label: "मराठी", flag: "🇮🇳" },
  { code: "gu", label: "ગુજરાતી", flag: "🇮🇳" },
  { code: "pa", label: "ਪੰਜਾਬੀ", flag: "🇮🇳" },
  { code: "ur", label: "اردو", flag: "🇵🇰" },
  { code: "id", label: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "ms", label: "Bahasa Melayu", flag: "🇲🇾" },
  { code: "th", label: "ไทย", flag: "🇹🇭" },
  { code: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
  { code: "tl", label: "Filipino", flag: "🇵🇭" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  // Middle East / Africa
  { code: "ar", label: "العربية", flag: "🇸🇦" },
  { code: "he", label: "עברית", flag: "🇮🇱" },
  { code: "fa", label: "فارسی", flag: "🇮🇷" },
  { code: "sw", label: "Kiswahili", flag: "🇰🇪" },
  { code: "am", label: "አማርኛ", flag: "🇪🇹" },
  { code: "ha", label: "Hausa", flag: "🇳🇬" },
  { code: "yo", label: "Yorùbá", flag: "🇳🇬" },
  { code: "zu", label: "isiZulu", flag: "🇿🇦" },
  { code: "af", label: "Afrikaans", flag: "🇿🇦" },
];

const RTL_LANG_CODES = new Set(["ar", "he", "fa", "ur"]);

export function isRtlLang(code?: string | null): boolean {
  return Boolean(code && RTL_LANG_CODES.has(code));
}

const BASE_THOUGHTS: Array<Omit<Thought, "integrity">> = [
  {
    id: "t1",
    author: "Mara Voss",
    handle: "@maravoss",
    content:
      "Honestly, Copilot's autocompletion is SO sleek when you're in flow. But then you paste the same snippet in the wrong file and it politely gaslights you into thinking that's what you wanted. #Sleek #Tools",
    mediaType: "text",
    feeling: "using-it",
    tags: ["#Sleek", "#Tools"],
    timestamp: "2026-08-31T09:20:00Z",
    timeLabel: "2h",
    language: "en",
    languageLabel: "English",
    reactions: [
      { type: "🔥", count: 42 },
      { type: "😂", count: 18 },
      { type: "🤔", count: 7 },
    ],
  },
  {
    id: "t2",
    author: "Dex Okafor",
    handle: "@dexbuilds",
    content:
      "Acabo de subir un proyecto donde un agente de IA escribió el 80% de la noche a la mañana. Me siento genial y a la vez profundamente raro. ¿Es este el futuro o solo estoy supervisando a un becario muy rápido?",
    mediaType: "audio",
    feeling: "blown-away",
    mediaUrl: "/media/sample-audio.wav",
    mediaDuration: "0:03",
    tags: ["#Jobs", "#Future"],
    timestamp: "2026-08-31T07:50:00Z",
    timeLabel: "4h",
    language: "es",
    languageLabel: "Español",
    transcript: [
      { time: 0, text: "Acabo de subir un proyecto donde un agente de IA escribió el 80% de la noche a la mañana." },
      { time: 2, text: "¿Es este el futuro o solo estoy supervisando a un becario muy rápido?" },
    ],
    reactions: [
      { type: "🤔", count: 51 },
      { type: "🔥", count: 23 },
      { type: "💯", count: 12 },
    ],
  },
  {
    id: "t3",
    author: "Priya Raman",
    handle: "@priyathinks",
    content:
      "Quick screen cap demo of the voice-agent UI I've been poking at. The latency is almost gone. We are genuinely at the 'weirdly good' stage now. 🫠",
    mediaType: "video",
    feeling: "love-it",
    mediaUrl: "/media/sample-video.mp4",
    mediaDuration: "0:04",
    tags: ["#Sleek", "#Future", "#Tools"],
    timestamp: "2026-08-31T06:10:00Z",
    timeLabel: "5h",
    language: "en",
    languageLabel: "English",
    transcript: [
      { time: 0, text: "Quick screen demo of the voice-agent UI I've been poking at." },
      { time: 2, text: "Latency is almost gone." },
      { time: 3, text: "We are genuinely at the weirdly good stage now." },
    ],
    reactions: [
      { type: "🚀", count: 88 },
      { type: "🔥", count: 60 },
      { type: "😂", count: 9 },
    ],
  },
  {
    id: "t4",
    author: "Leo Brandt",
    handle: "@leothedev",
    content:
      "Hot take: most 'AI slop' is honestly just a content strategy problem, not a technology problem. Same mediocre content as ever, now generated at scale. The tool isn't slop — the laziness is.",
    mediaType: "text",
    feeling: "hurts",
    tags: ["#Slop", "#Ethics"],
    timestamp: "2026-08-31T04:30:00Z",
    timeLabel: "7h",
    language: "en",
    languageLabel: "English",
    reactions: [
      { type: "🔥", count: 130 },
      { type: "🤔", count: 45 },
      { type: "😂", count: 11 },
    ],
  },
  {
    id: "t5",
    author: "Yuki Tanaka",
    handle: "@yukicodes",
    content:
      "Eine beunruhigende Frage, die niemand beantwortet: Wenn wir weiterhin Agenten bauen, die die Arbeit erledigen, wo lernen dann die Junioren das Handwerk? Wir löschen lautlos die Einstiegsrampe für die nächste Generation von Ingenieuren.",
    mediaType: "audio",
    feeling: "worried",
    mediaUrl: "/media/sample-audio.wav",
    mediaDuration: "0:03",
    tags: ["#Jobs", "#Ethics"],
    timestamp: "2026-08-30T22:00:00Z",
    timeLabel: "1d",
    language: "de",
    languageLabel: "Deutsch",
    transcript: [
      { time: 0, text: "Eine beunruhigende Frage, die niemand beantwortet: Wo lernen die Junioren das Handwerk, wenn Agenten die Arbeit erledigen?" },
      { time: 2, text: "Wir löschen lautlos die Einstiegsrampe für die nächste Generation von Ingenieuren." },
    ],
    reactions: [
      { type: "🤔", count: 74 },
      { type: "💯", count: 38 },
      { type: "🔥", count: 27 },
    ],
  },
  {
    id: "t6",
    author: "Nina Almeida",
    handle: "@ninasays",
    content:
      "Three-line thought: I don't care if the model wrote it. I care if it made the team think harder. That's the whole metric that matters for AI in the workplace. Everything else is noise.",
    mediaType: "text",
    feeling: "using-it",
    tags: ["#Sleek", "#Jobs"],
    timestamp: "2026-08-30T18:40:00Z",
    timeLabel: "1d",
    language: "en",
    languageLabel: "English",
    reactions: [
      { type: "💯", count: 96 },
      { type: "🔥", count: 41 },
      { type: "😴", count: 3 },
    ],
  },
  {
    id: "t7",
    author: "Sam Whitfield",
    handle: "@sampoints",
    content:
      "J'enregistre un moment rare : une IA qui refuse de m'aider à faire quelque chose d'éthiquement douteux — sans pour autant jouer le robot moralisateur. Le progrès ?",
    mediaType: "video",
    feeling: "blown-away",
    mediaUrl: "/media/sample-video.mp4",
    mediaDuration: "0:04",
    tags: ["#Ethics", "#Tools"],
    timestamp: "2026-08-30T14:15:00Z",
    timeLabel: "1d",
    language: "fr",
    languageLabel: "Français",
    transcript: [
      { time: 0, text: "J'enregistre un moment rare : une IA qui refuse de m'aider à faire quelque chose d'éthiquement douteux." },
      { time: 2, text: "Sans pour autant jouer le robot moralisateur. Le progrès ?" },
    ],
    reactions: [
      { type: "🚀", count: 55 },
      { type: "😂", count: 33 },
      { type: "🤔", count: 14 },
    ],
  },
  {
    id: "t8",
    author: "Ada Nouman",
    handle: "@adanou",
    content:
      "ओपन-सोर्स मॉडल फ्रंटियर मॉडल्स के खतरनाक रूप से करीब पहुँच रहे हैं। इस जगह पर नज़र रखिए। लागत वक्र बेरहमी से सच्चा साबित होने वाला है कि आप किसके लिए भुगतान कर रहे हैं।",
    mediaType: "audio",
    feeling: "worried",
    mediaUrl: "/media/sample-audio.wav",
    mediaDuration: "0:03",
    tags: ["#OpenSource", "#Future"],
    timestamp: "2026-08-30T10:00:00Z",
    timeLabel: "1d",
    language: "hi",
    languageLabel: "हिन्दी",
    transcript: [
      { time: 0, text: "ओपन-सोर्स मॉडल फ्रंटियर मॉडल्स के खतरनाक रूप से करीब पहुँच रहे हैं।" },
      { time: 2, text: "लागत वक्र बेरहमी से सच बताने वाला है कि आप किसके लिए भुगतान कर रहे हैं।" },
    ],
    reactions: [
      { type: "🔥", count: 67 },
      { type: "🤔", count: 29 },
    ],
  },
];

/** Seed, attached-integrity (real vs simulated watermark for demo variety). */
const INTEGRITY_SEEDS: Array<{ subject: string; verified: boolean; label: string }> = [
  { subject: "capture/audio/device:front:g9ca2", verified: true, label: "Verified · Unmodified" },
  { subject: "capture/video/device:board:g9ca2", verified: true, label: "Verified · Unmodified" },
  { subject: "typed/text/post:editor:", verified: true, label: "Verified · Never Edited" },
  { subject: "upload/pending/signature:", verified: false, label: "Unverified capture" },
];

export const INITIAL_THOUGHTS: Thought[] = BASE_THOUGHTS.map((t, i) => {
  const seed = INTEGRITY_SEEDS[i % INTEGRITY_SEEDS.length];
  return {
    ...t,
    integrity: {
      hash: fakeHash(`${seed.subject}${t.id}:${t.timestamp}`),
      verified: seed.verified,
      statusLabel: seed.label,
    },
  };
});

export const TAXONOMY_BY_TAG: Record<string, string> = {
  "#Sleek": "Finds the AI experience elegant or delightful",
  "#Slop": "Thinks the AI output is lazy, generic, or low-effort",
  "#Jobs": "How AI affects work, skills, and careers",
  "#Ethics": "Moral, bias, and safety implications",
  "#Future": "Where this is all heading",
  "#Bias": "Concerns about model bias",
  "#Tools": "Specific products, workflows, and building",
  "#OpenSource": "Open models, licensing, and access",
};

export interface MediaSample {
  src: string;
  type: string;
  poster?: string;
  placeholder: string;
}
