// Seed MongoDB with global, human-sounding AI thoughts (pos + neg, many languages).
// Usage:  npm run seed
// Safe to re-run: only inserts posts whose seed_id is missing.
import { MongoClient, ObjectId } from "mongodb";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !(m[1].trim() in process.env)) {
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      process.env[m[1].trim()] = v;
    }
  }
}

const uri = process.env.MONGODB_URL || process.env.MONGODB_URI;
if (!uri) {
  console.error("Set MONGODB_URL first (e.g. mongodb+srv://user:pass@cluster/...)");
  process.exit(1);
}
const dbName = process.env.MONGODB_DB || "aithoughts";

function hash(s) {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

function hoursAgo(h) {
  return new Date(Date.now() - h * 3600e3);
}

/** Authentic-feeling global takes — help stories + real fears. */
const DEMO = [
  // English — helped
  {
    seed_id: "g1",
    handle: "@maravoss",
    author: "Mara Voss",
    content:
      "Honestly, Copilot's autocompletion is SO sleek when you're in flow. But then you paste the same snippet in the wrong file and it politely gaslights you.",
    feeling: "using-it",
    tags: ["#Tools", "#Daily"],
    language: "en",
    language_label: "English",
    hours: 2,
  },
  {
    seed_id: "g2",
    handle: "@priyathinks",
    author: "Priya Raman",
    content:
      "I asked an AI to explain recursion to my mum. It built a story about matryoshka dolls filling up the kitchen. She finally got it. That felt like magic.",
    feeling: "love-it",
    tags: ["#Family", "#Teaching"],
    language: "en",
    language_label: "English",
    hours: 6,
  },
  {
    seed_id: "g3",
    handle: "@jordanbuilds",
    author: "Jordan Hale",
    content:
      "Shipped a side project in a weekend that would've taken me three weeks alone. AI wrote the boring CRUD; I spent my energy on the part people actually feel. First time I've enjoyed building again.",
    feeling: "love-it",
    tags: ["#SideProject", "#Help"],
    language: "en",
    language_label: "English",
    hours: 10,
  },
  // English — fear / hurt
  {
    seed_id: "g4",
    handle: "@leothedev",
    author: "Leo Brandt",
    content:
      "Hot take: most 'AI slop' is a content strategy problem, not a tech problem. Same mediocre posts as ever — now at industrial scale. The tool isn't slop. The laziness is.",
    feeling: "hurts",
    tags: ["#Slop", "#Ethics"],
    language: "en",
    language_label: "English",
    hours: 14,
  },
  {
    seed_id: "g5",
    handle: "@amayawrites",
    author: "Amaya Cole",
    content:
      "I write for a living. Last week a client said they 'don't need me anymore' because ChatGPT 'sounds fine.' Fine isn't craft. I'm scared my whole craft is being priced like a commodity.",
    feeling: "worried",
    tags: ["#Jobs", "#Writers"],
    language: "en",
    language_label: "English",
    hours: 18,
  },
  {
    seed_id: "g6",
    handle: "@noahlearns",
    author: "Noah Kim",
    content:
      "Junior here. Half my team pastes AI answers into PRs without reading them. I'm terrified I'll never learn the hard parts — just become a person who reviews machine drafts forever.",
    feeling: "worried",
    tags: ["#Jobs", "#Juniors"],
    language: "en",
    language_label: "English",
    hours: 22,
  },

  // Spanish
  {
    seed_id: "g7",
    handle: "@dexbuilds",
    author: "Dex Okafor",
    content:
      "Acabo de subir un proyecto donde un agente de IA escribió el 80% de la noche a la mañana. ¿Es este el futuro o solo estoy supervisando a un becario muy rápido?",
    feeling: "blown-away",
    tags: ["#Future", "#Jobs"],
    language: "es",
    language_label: "Español",
    hours: 4,
  },
  {
    seed_id: "g8",
    handle: "@luciadesign",
    author: "Lucía Méndez",
    content:
      "Usé IA para traducir mi portafolio al inglés y conseguí tres entrevistas en una semana. Nunca pensé que el idioma sería el único muro — y que una máquina lo derribaría.",
    feeling: "love-it",
    tags: ["#Career", "#Language"],
    language: "es",
    language_label: "Español",
    hours: 28,
  },
  {
    seed_id: "g9",
    handle: "@carlosmiedo",
    author: "Carlos Rivera",
    content:
      "En mi fábrica ya hablan de 'optimizar turnos con IA'. Nadie explica qué pasa con nosotros. No odio la tecnología — odio que nos traten como un costo a eliminar.",
    feeling: "worried",
    tags: ["#Jobs", "#Workers"],
    language: "es",
    language_label: "Español",
    hours: 32,
  },

  // Hindi
  {
    seed_id: "g10",
    handle: "@adanou",
    author: "Ada Nouman",
    content:
      "ओपन-सोर्स मॉडल फ्रंटियर मॉडल्स के खतरनाक रूप से करीब पहुँच रहे हैं। इस जगह पर नज़र रखिए — लागत वक्र बताएगा कि आप असल में किसके लिए भुगतान कर रहे हैं।",
    feeling: "worried",
    tags: ["#OpenSource", "#Future"],
    language: "hi",
    language_label: "हिन्दी",
    hours: 26,
  },
  {
    seed_id: "g11",
    handle: "@riyapixel",
    author: "Riya Sharma",
    content:
      "छोटे बिज़नेस के लिए पोस्टर्स और WhatsApp कैप्शन AI से बनाती हूँ। पहले फ्रीलांसर का खर्चा नहीं उठ पाती थी। अब मेरी दुकान ऑनलाइन भी दिखती है — ये मदद असली है।",
    feeling: "love-it",
    tags: ["#SmallBusiness", "#Help"],
    language: "hi",
    language_label: "हिन्दी",
    hours: 36,
  },
  {
    seed_id: "g12",
    handle: "@arjunfear",
    author: "Arjun Mehta",
    content:
      "स्कूल में बच्चे होमवर्क AI से करवा रहे हैं। टीचर भी पता नहीं कर पाते। मुझे डर है कि हम सोचने की आदत ही खो देंगे — आसान जवाब आसान दिमाग बना देते हैं।",
    feeling: "worried",
    tags: ["#Education", "#Kids"],
    language: "hi",
    language_label: "हिन्दी",
    hours: 40,
  },

  // German
  {
    seed_id: "g13",
    handle: "@yukicodes",
    author: "Yuki Tanaka",
    content:
      "Eine beunruhigende Frage: Wenn Agenten die Arbeit erledigen, wo lernen dann die Junioren das Handwerk? Wir löschen lautlos die Einstiegsrampe für die nächste Generation.",
    feeling: "worried",
    tags: ["#Jobs", "#Ethics"],
    language: "de",
    language_label: "Deutsch",
    hours: 30,
  },
  {
    seed_id: "g14",
    handle: "@annastudio",
    author: "Anna Vogel",
    content:
      "Ich habe mit KI eine App für meine Oma gebaut — große Buttons, Erinnerungen an Medikamente. Sie nutzt sie jeden Morgen. Technik darf auch zärtlich sein.",
    feeling: "love-it",
    tags: ["#Family", "#Care"],
    language: "de",
    language_label: "Deutsch",
    hours: 44,
  },

  // French
  {
    seed_id: "g15",
    handle: "@sampoints",
    author: "Sam Whitfield",
    content:
      "Moment rare : une IA qui refuse de m'aider à faire quelque chose d'éthiquement douteux — sans jouer le robot moralisateur. Le progrès ?",
    feeling: "blown-away",
    tags: ["#Ethics", "#Tools"],
    language: "fr",
    language_label: "Français",
    hours: 20,
  },
  {
    seed_id: "g16",
    handle: "@camilleart",
    author: "Camille Durand",
    content:
      "Je gagne ma vie avec l'illustration. Voir des gens générer 'dans mon style' sans me connaître… ça fait mal. Ce n'est pas de la jalousie — c'est mon identité qu'on recycle.",
    feeling: "hurts",
    tags: ["#Artists", "#Identity"],
    language: "fr",
    language_label: "Français",
    hours: 48,
  },
  {
    seed_id: "g17",
    handle: "@omarhelp",
    author: "Omar Benali",
    content:
      "J'ai dyslexie. L'IA m'aide à écrire des mails clairs au boulot. Avant, je passais des heures à avoir honte. Maintenant je participe vraiment aux réunions.",
    feeling: "need-support",
    tags: ["#Access", "#Work"],
    language: "fr",
    language_label: "Français",
    hours: 52,
  },

  // Portuguese (Brazil)
  {
    seed_id: "g18",
    handle: "@beatrizux",
    author: "Beatriz Lima",
    content:
      "Monte um protótipo de app pra minha ONG em uma tarde com IA. Antes eu dependia de esperar um voluntário técnico por meses. Agora a gente testa ideias de verdade.",
    feeling: "blown-away",
    tags: ["#NGO", "#Build"],
    language: "pt",
    language_label: "Português",
    hours: 16,
  },
  {
    seed_id: "g19",
    handle: "@rafatrabalho",
    author: "Rafael Costa",
    content:
      "Meu chefe pediu pra 'substituir metade do atendimento por chatbot'. Os clientes estão putos. Eu tenho medo de que a gente troque empatia por economia e chame isso de inovação.",
    feeling: "worried",
    tags: ["#Jobs", "#Support"],
    language: "pt",
    language_label: "Português",
    hours: 56,
  },

  // Arabic
  {
    seed_id: "g20",
    handle: "@laylaspeaks",
    author: "Layla Hassan",
    content:
      "استخدمت الذكاء الاصطناعي لترجمة سيرتي الذاتية وتجهيز أسئلة المقابلة. حصلت على وظيفة عن بُعد لأول مرة. التقنية فتحت باباً كنت أظنه مغلقاً بسبب اللغة.",
    feeling: "love-it",
    tags: ["#Career", "#Language"],
    language: "ar",
    language_label: "العربية",
    hours: 24,
  },
  {
    seed_id: "g21",
    handle: "@yusufthinks",
    author: "Yusuf Alami",
    content:
      "أخاف أن نربي جيلاً لا يعرف كيف يبحث أو يتحقق بنفسه. الإجابة السريعة مريحة… لكنها قد تسرق فضولنا ببطء.",
    feeling: "worried",
    tags: ["#Education", "#Curiosity"],
    language: "ar",
    language_label: "العربية",
    hours: 60,
  },

  // Japanese
  {
    seed_id: "g22",
    handle: "@kenjisato",
    author: "Kenji Sato",
    content:
      "英語が苦手だったけど、AIでドキュメントを読んでPRを書けるようになった。チームに初めて本音で貢献できてる感覚がある。",
    feeling: "using-it",
    tags: ["#Work", "#Language"],
    language: "ja",
    language_label: "日本語",
    hours: 12,
  },
  {
    seed_id: "g23",
    handle: "@ayakafear",
    author: "Ayaka Mori",
    content:
      "顔写真を勝手に学習されたみたいで、ネットに似た顔の生成画像が出てきた。便利さの裏で、同意のないまま自分が素材になるのが怖い。",
    feeling: "hurts",
    tags: ["#Privacy", "#Consent"],
    language: "ja",
    language_label: "日本語",
    hours: 64,
  },

  // Korean
  {
    seed_id: "g24",
    handle: "@minsuworks",
    author: "Min-su Park",
    content:
      "야근 줄였어요. 반복 메일·회의록 정리는 AI가 하고, 나는 고객 문제에만 집중해요. 처음으로 ‘도구가 나를 구했다’는 느낌이 들었어요.",
    feeling: "love-it",
    tags: ["#Work", "#Burnout"],
    language: "ko",
    language_label: "한국어",
    hours: 8,
  },
  {
    seed_id: "g25",
    handle: "@sooyeon",
    author: "Soo-yeon Lee",
    content:
      "면접에서 ‘AI로 포트폴리오 만드셨죠?’라는 질문을 들었어요. 내가 한 일과 기계가 한 일의 경계가 흐려져서… 내 실력이 의심받는 게 아파요.",
    feeling: "confused",
    tags: ["#Career", "#Identity"],
    language: "ko",
    language_label: "한국어",
    hours: 68,
  },

  // Mandarin
  {
    seed_id: "g26",
    handle: "@chenwei",
    author: "Chen Wei",
    content:
      "用 AI 帮爸爸写了给医院的说明信，他终于敢去复查了。以前因为不会表达，一直拖着。技术有时候就是给普通人一点勇气。",
    feeling: "love-it",
    tags: ["#Family", "#Health"],
    language: "zh",
    language_label: "中文",
    hours: 34,
  },
  {
    seed_id: "g27",
    handle: "@linafear",
    author: "Li Na",
    content:
      "同事用 AI 生成了我的声音去开玩笑。大家笑了，我没有。如果连声音都可以被随便复制，我还拥有什么？",
    feeling: "hurts",
    tags: ["#Privacy", "#Voice"],
    language: "zh",
    language_label: "中文",
    hours: 72,
  },

  // Swahili
  {
    seed_id: "g28",
    handle: "@aishadar",
    author: "Aisha Juma",
    content:
      "Nilitumia AI kutafsiri maombi ya ruzuku kwa Kiingereza. Tulipata fedha kwa shule yetu ndogo. Kwa mara ya kwanza, lugha haikuzuia ndoto zetu.",
    feeling: "blown-away",
    tags: ["#Education", "#Help"],
    language: "sw",
    language_label: "Kiswahili",
    hours: 38,
  },

  // Turkish
  {
    seed_id: "g29",
    handle: "@emelcode",
    author: "Emel Yıldız",
    content:
      "Küçük bir e-ticaret sitesini AI ile ayağa kaldırdım. Kod bilmiyordum; şimdi sipariş alıyorum. Korkutucu olan teknoloji değil — geride kalma hissi.",
    feeling: "using-it",
    tags: ["#Build", "#Business"],
    language: "tr",
    language_label: "Türkçe",
    hours: 42,
  },
  {
    seed_id: "g30",
    handle: "@canworry",
    author: "Can Demir",
    content:
      "Gazeteciyim. Haber odasında 'AI özet geçsin' deniyor. Doğruyu kontrol eden insan kalmazsa, yalan daha hızlı yayılır. Bu beni gerçekten korkutuyor.",
    feeling: "worried",
    tags: ["#News", "#Truth"],
    language: "tr",
    language_label: "Türkçe",
    hours: 76,
  },

  // Indonesian
  {
    seed_id: "g31",
    handle: "@dewirasa",
    author: "Dewi Sari",
    content:
      "Saya guru di desa. AI bantu saya bikin soal latihan dan penjelasan sederhana buat murid. Rasanya seperti punya asisten yang sabar — tanpa menggantikan saya di kelas.",
    feeling: "need-support",
    tags: ["#Teachers", "#Help"],
    language: "id",
    language_label: "Bahasa Indonesia",
    hours: 46,
  },

  // Russian
  {
    seed_id: "g32",
    handle: "@ivanbuilds",
    author: "Ivan Petrov",
    content:
      "Собрал бота, который помогает маме заполнять формы на госуслугах. Раньше она плакала от интерфейсов. Теперь звонит и смеётся: «Робот понял с первого раза».",
    feeling: "love-it",
    tags: ["#Family", "#Access"],
    language: "ru",
    language_label: "Русский",
    hours: 50,
  },
  {
    seed_id: "g33",
    handle: "@olgafeels",
    author: "Olga Smirnova",
    content:
      "Боюсь глубоких фейков больше, чем потери работы. Если голос и лицо можно подделать за минуту — как мы будем доверять друг другу?",
    feeling: "worried",
    tags: ["#Deepfakes", "#Trust"],
    language: "ru",
    language_label: "Русский",
    hours: 80,
  },

  // Italian
  {
    seed_id: "g34",
    handle: "@giuliamakes",
    author: "Giulia Rossi",
    content:
      "Ho usato l'IA per ripassare per l'esame di specializzazione mentre lavoravo di notte. Non mi ha sostituita — mi ha tenuto a galla. A volte è solo questo: non affondare.",
    feeling: "need-support",
    tags: ["#Study", "#Life"],
    language: "it",
    language_label: "Italiano",
    hours: 54,
  },

  // Dutch
  {
    seed_id: "g35",
    handle: "@thijsdev",
    author: "Thijs de Vries",
    content:
      "Mijn eerste open-source PR werd grotendeels door AI geschreven. Reviewers merkten het. Ik schaamde me — en leerde dat eerlijk zeggen wat de machine deed, respect oplevert.",
    feeling: "confused",
    tags: ["#OpenSource", "#Honesty"],
    language: "nl",
    language_label: "Nederlands",
    hours: 58,
  },
];

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

await db.collection("posts").createIndex({ created_at: -1 });
await db.collection("posts").createIndex({ seed_id: 1 }, { unique: true, sparse: true });
await db.collection("messages").createIndex({ post_id: 1, created_at: 1 });
await db.collection("reactions").createIndex({ post_id: 1 });
await db.collection("reports").createIndex({ status: 1, created_at: -1 });
await db.collection("keepers").createIndex({ handle: 1 }, { unique: true });
await db.collection("profiles").createIndex({ handle: 1 }, { unique: true });

const existingIds = new Set(
  (
    await db
      .collection("posts")
      .find({ seed_id: { $in: DEMO.map((d) => d.seed_id) } }, { projection: { seed_id: 1 } })
      .toArray()
  ).map((p) => p.seed_id)
);

const toInsert = DEMO.filter((d) => !existingIds.has(d.seed_id)).map((d) => ({
  seed_id: d.seed_id,
  handle: d.handle,
  author: d.author,
  content: d.content,
  media_type: "text",
  feeling: d.feeling,
  tags: d.tags,
  language: d.language,
  language_label: d.language_label,
  integrity_hash: hash(`${d.seed_id}:${d.handle}:${d.content}`),
  integrity_verified: true,
  integrity_label: "Verified · Unmodified",
  created_at: hoursAgo(d.hours),
  user_id: new ObjectId().toString(),
}));

if (toInsert.length === 0) {
  console.log(`All ${DEMO.length} global seed posts already present — nothing to insert.`);
} else {
  await db.collection("posts").insertMany(toInsert);
  console.log(`Seeded ${toInsert.length} new posts (${existingIds.size} already existed, ${DEMO.length} total in catalog).`);
}

await client.close();
