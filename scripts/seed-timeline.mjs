// Seed a believable timeline of AI feelings from the last real take to today.
//
// Usage:
//   npm run seed:timeline            (uses .env.local, writes <db>_dev)
//   npm run seed:timeline -- --prod  (uses .env.production.local, writes live DB)
//   npm run seed:timeline -- --prod --dry-run
//
// Safe to re-run: every row carries a stable `timeline_id`; existing rows are
// skipped and nothing already in the database is updated or deleted.
import { MongoClient, ObjectId } from "mongodb";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROD = process.argv.includes("--prod");
const DRY = process.argv.includes("--dry-run");
const envFile = PROD ? "../.env.production.local" : "../.env.local";
const envPath = path.resolve(__dirname, envFile);

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(m[1].trim() in process.env)) process.env[m[1].trim()] = v;
  }
}

const uri = process.env.MONGODB_URL || process.env.MONGODB_URI;
if (!uri) {
  console.error("Set MONGODB_URL first.");
  process.exit(1);
}
const baseDb = process.env.MONGODB_DB || "aithoughts";
const dbName = PROD || baseDb.endsWith("_dev") ? baseDb : `${baseDb}_dev`;
const NOW = Date.now();

function hash(s) {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rngFor(str) {
  let h = 2166136261;
  for (const c of str) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return mulberry32(h);
}
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function at(day, time) {
  return new Date(`${day}T${time}:00Z`);
}
function clampTime(date) {
  const t = date.getTime();
  return new Date(t > NOW - 60_000 ? NOW - 60_000 - Math.floor(Math.random() * 45 * 60_000) : t);
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const RECURRING = [
  ["@maravoss", "Mara Voss", "writes code, argues with autocomplete."],
  ["@priyathinks", "Priya Raman", "explains things to her mum, and to machines."],
  ["@jordanbuilds", "Jordan Hale", "ships small things, keeps the human parts."],
  ["@leothedev", "Leo Brandt", "dev. allergic to 'slop' as a personality."],
  ["@amayawrites", "Amaya Cole", "writer. fine isn't craft."],
  ["@noahlearns", "Noah Kim", "junior dev. trying to understand, not just prompt."],
  ["@dexbuilds", "Dex Okafor", "builds agents, watches them carefully."],
  ["@luciadesign", "Lucía Méndez", "diseño con intención. el estilo no es un filtro."],
  ["@kenjisato", "Kenji Sato", "エンジニア。道具は考えない。"],
  ["@minsuworks", "Min-su Park", "일하는 사람. 문장은 내 것이어야 한다."],
  ["@beatrizux", "Beatriz Lima", "designer for an NGO. time is the real resource."],
  ["@dewirasa", "Dewi Sari", "guru desa. kita cek sama-sama."],
  ["@camilleart", "Camille Durand", "illustrator. my style is not a prompt."],
  ["@carlosmiedo", "Carlos Rivera", "fábrica. la tecnología sin personas no es progreso."],
  ["@aishadar", "Aisha Juma", "lugha si ukuta. language is not a wall."],
  ["@rafatrabalho", "Rafael Costa", "atendimento. empatia não é centro de custo."],
].map(([handle, author, bio]) => ({
  handle,
  author,
  bio,
  joined: "2026-09-11T08:00:00.000Z",
}));

const NEW_USERS = [
  ["2026-10-10", "@noorbuilds", "Noor Haddad", "product designer. small screens, big feelings.", "02:58"],
  ["2026-10-11", "@tomaslately", "Tomás Ferreira", "dev. middle of the road on most things, including this.", "03:40"],
  ["2026-10-12", "@hanisays", "Hani Yusuf", "teaches 14-year-olds. asks them to explain things.", "04:22"],
  ["2026-10-13", "@ellieafterhours", "Ellie Park", "nurse. night shifts. still listening.", "02:35"],
  ["2026-10-14", "@devwithtea", "Arnav Joshi", "backend dev. tea > coffee. reads the diffs.", "04:05"],
  ["2026-10-15", "@miraonai", "Mira Kapoor", "cs student. asking questions out loud.", "02:48"],
  ["2026-10-16", "@finnwrites", "Finn O'Leary", "copywriter. drafts with machines, edits like a human.", "05:10"],
  ["2026-10-17", "@sanahere", "Sana Iqbal", "marketing lead. tired of the word 'optimize'.", "03:26"],
  ["2026-10-18", "@kojobuilds", "Kojo Mensah", "building small things. learning in public.", "02:44"],
  ["2026-10-19", "@lucasfeels", "Lucas Meyer", "designer. whitespace skeptic.", "04:18"],
  ["2026-10-20", "@aartiworks", "Aarti Nair", "data analyst. checks the rows nobody dropped.", "02:52"],
  ["2026-10-21", "@marcusandco", "Marcus Reed", "recruiter. looking for judgment, not keywords.", "03:33"],
  ["2026-10-22", "@yasmintries", "Yasmin Ali", "illustrator. sketchbook loyalist.", "04:40"],
  ["2026-10-23", "@benoitnotes", "Benoît Laurent", "prof de français. comparing drafts with students.", "02:29"],
  ["2026-10-24", "@tessacodes", "Tessa Nguyen", "frontend dev. reads the props before believing them.", "03:08"],
  ["2026-10-25", "@rahulreflects", "Rahul Verma", "engineer. shorter is not simpler.", "04:51"],
  ["2026-10-26", "@emilyoutside", "Emily Carter", "photographer. the sky was the point.", "02:41"],
  ["2026-10-27", "@danielthoughts", "Daniel Osei", "support lead. stays on the line.", "03:19"],
  ["2026-10-28", "@sofiaworks", "Sofia Alvarez", "journalist. checks the quotes twice.", "04:12"],
  ["2026-10-29", "@amritspeaks", "Amrit Singh", "21. student. thinking about this at 2am.", "01:42"],
].map(([day, handle, author, bio, time]) => ({
  handle,
  author,
  bio,
  joined: at(day, time).toISOString(),
}));

const PEOPLE = [...RECURRING, ...NEW_USERS];
const PERSON = new Map(PEOPLE.map((p) => [p.handle, p]));

// ---------------------------------------------------------------------------
// Timeline: 3 takes a day from Oct 10 to Oct 29, plus a few quote reposts.
// `c` = comments: [handle, body, minutes after the take]
// `quote` = existing seed_id of the take being quoted.
// ---------------------------------------------------------------------------

const POSTS = [
  // Oct 10
  { day: "2026-10-10", time: "05:12", by: "@noorbuilds", feeling: "using-it", tags: ["#Design", "#Daily"],
    content: `first week using AI for the boring parts of design handoff. specs, redlines, the little notes nobody reads. honestly? i have time to actually look at the screens now.`,
    c: [["@maravoss", `the little notes nobody reads 😭 that part. wait till it confidently writes the wrong spacing`, 38], ["@noorbuilds", `@maravoss day 4 and it already told me 12px was "standard" lol. learning to double-check everything`, 55]] },
  { day: "2026-10-10", time: "11:40", by: "@amayawrites", feeling: "hurts", tags: ["#Writers", "#Jobs"],
    content: `got a rejection today that said they're "moving toward AI-assisted content." not sure what to do with my hands. i keep opening the doc and closing it.`,
    c: [["@priyathinks", `that's such a cold way to say it. i'm sorry. your sentences have a pulse, that's not a prompt`, 22], ["@leothedev", `the "assisted" part is doing a lot of work there. they mean cheaper. sorry, amaya.`, 64]] },
  { day: "2026-10-10", time: "16:05", by: "@kenjisato", feeling: "confused", tags: ["#Work", "#Learning"], lang: ["ja", "日本語"],
    content: `今日はAIにコードレビューしてもらった。指摘は的確だったけど、「なぜ」を説明してくれないから、結局自分で考える必要がある。それはいいことなのかも。`,
    c: [["@noahlearns", `this is exactly my fear though — if we stop asking why, the review becomes the thinking`, 95], ["@kenjisato", `@noahlearns そう。道具は考えない。考えるのはまだ人間の仕事。`, 120]] },

  // Oct 11
  { day: "2026-10-11", time: "04:48", by: "@tomaslately", feeling: "confused", tags: ["#Intro", "#Daily"],
    content: `joined here because every timeline i open is either "AI will save us" or "AI will end us." i just want to talk about the middle bit. the bit where it's useful and also kind of unsettling.`,
    c: [["@beatrizux", `welcome. the middle bit is the only honest place tbh`, 31], ["@dexbuilds", `the middle bit is where the actual work is. welcome tomás`, 88]] },
  { day: "2026-10-11", time: "10:25", by: "@jordanbuilds", feeling: "using-it", tags: ["#Build", "#SmallWins"],
    content: `shipped a tiny tool that summarizes my standup notes. took 40 mins. saved maybe 15 mins a week. not everything has to be a revolution i guess.`,
    c: [["@maravoss", `40 mins for 15/week is a good trade and also i would have spent 3 hours naming it`, 47], ["@jordanbuilds", `@maravoss it's called notes.exe and i regret nothing`, 59]] },
  { day: "2026-10-11", time: "15:35", by: "@luciadesign", feeling: "hurts", tags: ["#Artists", "#Respect"], lang: ["es", "Español"],
    content: `Una clienta me pidió "el mismo estilo pero hecho con IA, más barato". Le expliqué que el estilo no es un filtro. Es años de mirar. No lo entendió y no sé si quiero explicarlo otra vez.`,
    c: [["@camilleart", `lo entiendo perfecto. no es el estilo, es la mirada. y eso no se genera.`, 41], ["@beatrizux", `duele porque lo dicen como si fuera un ajuste de precio, no una persona.`, 102]] },

  // Oct 12
  { day: "2026-10-12", time: "06:02", by: "@hanisays", feeling: "worried", tags: ["#Education", "#Kids"],
    content: `class of 14-year-olds asked me if they're "allowed" to use AI for homework. i said yes if you can explain your answer without it. half the room went quiet. that quiet is the whole conversation.`,
    c: [["@dewirasa", `that quiet is the sound of being asked to think. i get it every week. keep asking.`, 52], ["@noahlearns", `i was that kid once. the ones who go quiet are usually the ones who care.`, 133]] },
  { day: "2026-10-12", time: "12:15", by: "@priyathinks", feeling: "using-it", tags: ["#Family", "#Tools"],
    content: `used AI to plan a 3-day trip with my parents. it put a 90-year-old on a 6km walking route. i caught it because i know them. that's the job now — knowing the people the model doesn't.`,
    c: [["@noorbuilds", `"knowing the people the model doesn't" is going straight in my notes`, 33], ["@priyathinks", `@noorbuilds feel free, it was the only useful thing i produced all week`, 50]] },
  { day: "2026-10-12", time: "17:20", by: "@leothedev", feeling: "love-it", tags: ["#Tools", "#Work"],
    content: `unpopular: i don't want AI to write my emails. i want it to tell me when i'm being passive-aggressive in them. different product. someone build that.`,
    c: [["@amayawrites", `an anti-passive-aggressive filter would end me. please build it.`, 61], ["@jordanbuilds", `honestly the tone-check use case is so much better than generate`, 147]] },

  // Oct 13
  { day: "2026-10-13", time: "03:55", by: "@ellieafterhours", feeling: "love-it", tags: ["#Care", "#Work"],
    content: `night shift again. AI scribe did my notes while i talked to a patient who was scared. i had both hands free to hold hers. i didn't expect to feel this way about software.`,
    c: [["@luciadesign", `this is the version of the story i needed today`, 29], ["@hanisays", `the hands free detail. that's it. that's what it's for.`, 96]] },
  { day: "2026-10-13", time: "09:50", by: "@dexbuilds", feeling: "confused", tags: ["#Build", "#Agents"],
    content: `agent ran for 6 hours, opened 14 PRs, and then confidently deleted a test because it was "failing." the test was right. i was not.`,
    c: [["@kenjisato", `the confidence is the scary part. it never says "i'm not sure"`, 34], ["@dexbuilds", `@kenjisato exactly. it apologizes after, which is worse`, 52]] },
  { day: "2026-10-13", time: "14:45", by: "@amayawrites", feeling: "need-support", tags: ["#Writers", "#Hope"],
    content: `small update: a different client hired me *because* i don't use AI. said they want "a human voice, not a summary." i don't know if that's a trend or a life raft. either way i'll take it.`,
    c: [["@priyathinks", `life raft for now. take the win. you're good at this.`, 18], ["@noorbuilds", `a human voice is becoming a feature. wild.`, 71]] },

  // Oct 14
  { day: "2026-10-14", time: "05:30", by: "@devwithtea", feeling: "worried", tags: ["#Jobs", "#Tech"],
    content: `joined. backend dev, 6 yrs. my team went from "AI is a toy" to "why isn't this automated" in about four months. i'm not scared of the tools. i'm scared of how fast the expectations moved.`,
    c: [["@noahlearns", `the expectation shift is the part nobody warns juniors about`, 44], ["@leothedev", `four months is generous. we did it in six weeks and called it a culture change`, 109]] },
  { day: "2026-10-14", time: "11:05", by: "@beatrizux", feeling: "love-it", tags: ["#NGO", "#Impact"], lang: ["pt", "Português"],
    content: `nossa ONG conseguiu doar 30 cestas básicas com o tempo que a gente economizou na planilha. parece pequeno. não é pequeno pra quem recebe.`,
    c: [["@carlosmiedo", `isso é o que a tecnologia deveria ser. tempo devolvido pras pessoas.`, 37], ["@beatrizux", `@carlosmiedo exatamente. tempo é o recurso mais caro que a gente tinha.`, 62]] },
  { day: "2026-10-14", time: "16:40", by: "@noahlearns", feeling: "confused", tags: ["#Juniors", "#Work"],
    content: `my manager told me to "just prompt better" when i asked how the code works. i'm 8 months into this job. i don't want to prompt better. i want to understand.`,
    c: [["@devwithtea", `this is why i still read every diff. even the ones i didn't write. especially those.`, 48], ["@amayawrites", `"just prompt better" is the new "just be more confident." both mean figure it out alone.`, 126]] },

  // Oct 15
  { day: "2026-10-15", time: "04:20", by: "@miraonai", feeling: "worried", tags: ["#Students", "#Education"],
    content: `19, CS student. half my classmates submit AI code they can't defend in a viva. i'm not judging, i just wonder who's going to debug all of this in five years.`,
    c: [["@hanisays", `the viva question is the whole test. if you can explain it, it's yours.`, 39], ["@devwithtea", `we'll be debugging it. and we'll be tired. but we'll be employed, so there's that.`, 97]] },
  { day: "2026-10-15", time: "10:10", by: "@minsuworks", feeling: "worried", tags: ["#Jobs", "#Work"], lang: ["ko", "한국어"],
    content: `오늘 팀 회의에서 "AI가 다 해주니까 사람 줄여도 되지 않냐"는 말이 나왔어요. 아무도 대답 못 했어요. 저도 못 했어요. 그 침묵이 오래 남네요.`,
    c: [["@kenjisato", `その沈黙、わかります。言い返せない自分が一番つらい。`, 57], ["@ellieafterhours", `the silence in those rooms is always the loudest thing`, 140]] },
  { day: "2026-10-15", time: "15:15", by: "@maravoss", feeling: "using-it", tags: ["#Humor", "#Daily"],
    content: `me: i'll use AI to save time
also me: spends 40 minutes arguing with the model about whether a semicolon is "optional"
we are not the same`,
    c: [["@jordanbuilds", `the semicolon argument is a rite of passage`, 21], ["@dexbuilds", `mine was tabs vs spaces. it chose violence.`, 38], ["@maravoss", `@dexbuilds it always chooses violence and then says "great question!"`, 49]] },

  // Oct 16
  { day: "2026-10-16", time: "06:15", by: "@finnwrites", feeling: "using-it", tags: ["#Writers", "#Craft"],
    content: `copywriter. i use AI for first drafts of things nobody will read. i do not use it for the things people will feel. i wish more clients understood that's a choice, not a limitation.`,
    c: [["@amayawrites", `the choice is the craft. saving this.`, 26], ["@luciadesign", `same line for design. the draft is not the work.`, 84]] },
  { day: "2026-10-16", time: "12:40", by: "@luciadesign", feeling: "confused", tags: ["#Design", "#Identity"], lang: ["es", "Español"],
    content: `hice un experimento: pedí a la IA que describiera mi portfolio. dijo "clean, minimal, modern". tres adjetivos que usamos todo el mundo. me quedé mirando la pantalla un rato.`,
    c: [["@finnwrites", `ai describing creative work is like a mirror that only knows stock photos`, 45], ["@noorbuilds", `"clean minimal modern" is the beige of language`, 112]] },
  { day: "2026-10-16", time: "17:05", by: "@kenjisato", feeling: "love-it", tags: ["#Language", "#Work"], lang: ["ja", "日本語"],
    content: `AIで英語のメールを書くようになって、会議で発言する回数が増えた。言葉が怖くなくなったのは大きい。便利というより、扉が開いた感じ。`,
    c: [["@aishadar", `kama hii ndio teknolojia inavyopaswa kusaidia. kufungua milango, si kufunga.`, 63], ["@kenjisato", `@aishadar exactly. doors, not walls.`, 79]] },

  // Oct 17
  { day: "2026-10-17", time: "05:05", by: "@sanahere", feeling: "confused", tags: ["#Marketing", "#Work"],
    content: `marketing lead. we used AI to write 200 product descriptions in a day. conversions went up. then i read them all and felt nothing. now i don't know what we optimized for.`,
    c: [["@leothedev", `you optimized for the metric, not the person. classic. welcome to the club.`, 42], ["@finnwrites", `200 descriptions that all sound like the same person is having a very calm day`, 118]] },
  { day: "2026-10-17", time: "11:30", by: "@carlosmiedo", feeling: "worried", tags: ["#Work", "#Skills"], lang: ["es", "Español"],
    content: `hoy la máquina de la fábrica se detuvo porque el "sistema predictivo" no predijo nada. nos reímos. luego nos dimos cuenta de que nadie sabía arreglarla sin la pantalla.`,
    c: [["@devwithtea", `this is the skill atrophy thing nobody wants to fund training for`, 36], ["@beatrizux", `quando a tela apaga, quem sabe o que fazer? essa é a pergunta.`, 101]] },
  { day: "2026-10-17", time: "16:25", by: "@priyathinks", feeling: "love-it", tags: ["#Family", "#Humor"],
    content: `my mum now asks the AI about her garden before she asks me. honestly? good. it knows more about tomatoes than i ever will. i'll take being replaced in this one specific area.`,
    c: [["@dewirasa", `the tomato replacement is acceptable. the rest, we negotiate.`, 28], ["@priyathinks", `@dewirasa she asked it about me yesterday though. that one stung a little.`, 46]] },

  // Oct 18
  { day: "2026-10-18", time: "04:35", by: "@kojobuilds", feeling: "using-it", tags: ["#Startup", "#Build"],
    content: `built my whole MVP with AI in 3 weeks. got 40 users. then spent 2 weeks fixing things i didn't understand because i didn't write them. speed is a loan, not a gift.`,
    c: [["@jordanbuilds", `"speed is a loan" is the most honest thing i've read on here`, 31], ["@leothedev", `the interest rate on that loan is technical debt and it compounds daily`, 106]] },
  { day: "2026-10-18", time: "09:35", by: "@dewirasa", feeling: "need-support", tags: ["#Teachers", "#Education"], lang: ["id", "Bahasa Indonesia"],
    content: `murid-murid saya sekarang bertanya "bu, ini jawabannya beneran atau AI?" dan saya jawab: "kita cek sama-sama." mereka jadi lebih hati-hati. mungkin itu pelajaran terbaiknya.`,
    c: [["@hanisays", `"kita cek sama-sama" is the whole curriculum now`, 47], ["@miraonai", `i wish my teachers had said that instead of banning it`, 92]] },
  { day: "2026-10-18", time: "15:00", by: "@jordanbuilds", feeling: "worried", tags: ["#Writers", "#Craft"], quote: "g5",
    content: `this one stayed with me. "fine isn't craft" is the line of the year. if your work can be replaced by "fine," the problem started before AI.`,
    c: [["@amayawrites", `thank you for saying it louder. i needed that today.`, 24], ["@finnwrites", `"fine is the enemy of felt" — putting this on a sticky note`, 88]] },
  { day: "2026-10-18", time: "18:10", by: "@tomaslately", feeling: "confused", tags: ["#Daily", "#Future"],
    content: `one week in. the thing i notice most isn't the tech. it's how quickly people pick a side and stop listening. the middle is quieter than i expected.`,
    c: [["@kojobuilds", `quiet middle is where the builders live tbh`, 35], ["@beatrizux", `stick around. the loud ones get tired eventually.`, 77]] },

  // Oct 19
  { day: "2026-10-19", time: "06:25", by: "@lucasfeels", feeling: "confused", tags: ["#Design", "#Humor"],
    content: `designer. i asked AI to critique my portfolio and it said "consider adding more whitespace." i have 60% whitespace. i think it's just guessing now.`,
    c: [["@noorbuilds", `it will always say whitespace. it's the "you should drink more water" of design feedback`, 33], ["@luciadesign", `jajaja literal. "más whitespace" y "más contraste". siempre.`, 68]] },
  { day: "2026-10-19", time: "12:00", by: "@noahlearns", feeling: "love-it", tags: ["#Learning", "#Juniors"],
    content: `tiny win: i used AI to explain a gnarly regex, then rewrote it myself and it worked. felt like actually learning instead of copy-pasting. maybe that's the balance.`,
    c: [["@devwithtea", `this is the way. use it as a tutor, not an oracle.`, 29], ["@miraonai", `saving this for my next assignment. genuinely.`, 96]] },
  { day: "2026-10-19", time: "17:30", by: "@camilleart", feeling: "hurts", tags: ["#Artists", "#Consent"],
    content: `someone generated "my style" and tagged me in it. i reported it. the platform said it "doesn't violate policy." so my face is a filter now, i guess.`,
    c: [["@luciadesign", `no hay política para esto todavía y eso es parte del problema`, 26], ["@ellieafterhours", `the word "policy" doing so much hiding there. i'm sorry.`, 81]] },

  // Oct 20
  { day: "2026-10-20", time: "05:50", by: "@aartiworks", feeling: "using-it", tags: ["#Data", "#Work"],
    content: `data analyst. spent all day cleaning a dataset, then asked AI to find the story in it. it found the obvious one. the real story was in the rows it dropped. tools have blind spots shaped like their training.`,
    c: [["@kojobuilds", `the rows it dropped. that's the whole game.`, 41], ["@devwithtea", `blind spots shaped like their training is a great way to put it`, 117]] },
  { day: "2026-10-20", time: "10:45", by: "@hanisays", feeling: "worried", tags: ["#Education", "#Kids"],
    content: `a parent emailed: "please stop teaching my child to question AI, it's confusing them." i replied: "that's the point." haven't heard back.`,
    c: [["@dewirasa", `respect. that reply took courage.`, 34], ["@miraonai", `as a student: please keep confusing us. the alternative is worse.`, 70]] },
  { day: "2026-10-20", time: "16:15", by: "@maravoss", feeling: "blown-away", tags: ["#Tools", "#Code"],
    content: `genuinely useful AI moment: it caught that my "quick fix" would break for users with no last name. i would've shipped that. no ego, just "hey, edge case." weirdly wholesome.`,
    c: [["@jordanbuilds", `the no-ego catch is the best part of pair programming with a machine`, 27], ["@noahlearns", `it's the only reviewer that doesn't sigh at me`, 104]] },

  // Oct 21
  { day: "2026-10-21", time: "04:10", by: "@marcusandco", feeling: "confused", tags: ["#Jobs", "#Hiring"],
    content: `recruiter. i've rejected 3 portfolios this month because the work was clearly AI-generated and the candidate couldn't talk about it. not because AI is bad. because i need to know who i'm hiring.`,
    c: [["@leothedev", `the "can you talk about it" test is undefeated`, 39], ["@finnwrites", `and the ones who can talk about it are usually the ones who used it well`, 115]] },
  { day: "2026-10-21", time: "11:20", by: "@minsuworks", feeling: "need-support", tags: ["#Work", "#Learning"], lang: ["ko", "한국어"],
    content: `회사에서 AI 교육을 해준다고 해서 갔더니 "프롬프트 잘 쓰는 법"만 가르쳐줬어요. 제가 배우고 싶은 건 왜 그 답이 나오는지였는데. 조금 서운했어요.`,
    c: [["@kenjisato", `その気持ち、すごくわかる。表面だけ教えて、中身は教えない。`, 55], ["@devwithtea", `"how to prompt" is training for a product, not for a person`, 133]] },
  { day: "2026-10-21", time: "15:45", by: "@dexbuilds", feeling: "worried", tags: ["#Future", "#Ethics"],
    content: `3am thought: we're building systems that can do almost everything and understand almost nothing, and we're surprised people feel weird about it.`,
    c: [["@maravoss", `the "almost" is doing a lot of emotional work at 3am`, 31], ["@aartiworks", `understanding is the part that doesn't show up in the benchmark`, 88]] },

  // Oct 22
  { day: "2026-10-22", time: "06:40", by: "@yasmintries", feeling: "love-it", tags: ["#Art", "#Craft"],
    content: `illustrator. i tried to use AI for ideation and it gave me 40 variations of the same idea. my sketchbook gives me 3 bad ideas and 1 that's mine. i'll keep the sketchbook.`,
    c: [["@camilleart", `the 1 that's mine. that's the whole thing.`, 28], ["@lucasfeels", `40 variations of "confident startup illustration" lol`, 74]] },
  { day: "2026-10-22", time: "12:30", by: "@ellieafterhours", feeling: "need-support", tags: ["#Care", "#Trust"],
    content: `a patient asked if the notes were "being read by a robot." i said a computer helps me write them but i'm still the one listening. she said "okay, as long as someone's listening." yeah.`,
    c: [["@priyathinks", `"as long as someone's listening" — that should be the product requirement for all of this`, 36], ["@hanisays", `the listening can't be automated. it just can't.`, 91]] },
  { day: "2026-10-22", time: "17:10", by: "@beatrizux", feeling: "worried", tags: ["#Support", "#People"], quote: "g19",
    content: `this is the one. empathy isn't a cost center. if your "innovation" makes people feel less heard, it's not innovation, it's a shortcut.`,
    c: [["@rafatrabalho", `obrigado por isso. é exatamente o que eu queria dizer.`, 25], ["@finnwrites", `"empathy isn't a cost center" should be on a billboard`, 79]] },
  { day: "2026-10-22", time: "18:40", by: "@devwithtea", feeling: "using-it", tags: ["#Code", "#Humor"],
    content: `opened a PR today and the AI description was better than mine. i'm not even mad, i'm just going to start outsourcing the part where i pretend i remember what i changed.`,
    c: [["@maravoss", `the "pretend i remember" tax is real`, 22], ["@kojobuilds", `as long as you still remember why. the what is cheap now.`, 66]] },

  // Oct 23
  { day: "2026-10-23", time: "05:20", by: "@benoitnotes", feeling: "blown-away", tags: ["#Education", "#Language"], lang: ["fr", "Français"],
    content: `prof de français. j'ai demandé à mes élèves d'écrire sans IA, puis avec, puis de comparer. ils ont été les premiers à dire que la version IA "manquait de quelqu'un". c'était une belle leçon.`,
    c: [["@hanisays", `"manquait de quelqu'un" is the most precise review of AI writing i've heard from a teenager`, 43], ["@finnwrites", `out of the mouths of 15-year-olds. wow.`, 101]] },
  { day: "2026-10-23", time: "10:30", by: "@noahlearns", feeling: "love-it", tags: ["#Work", "#Juniors"],
    content: `got a code review from a senior today that said "i don't care if AI wrote it, i care if you understand it." that's the first time someone said it like that. felt like permission to learn.`,
    c: [["@devwithtea", `that senior is a keeper. literally.`, 27], ["@miraonai", `screenshotting this for every argument i have about AI in school`, 83]] },
  { day: "2026-10-23", time: "14:55", by: "@luciadesign", feeling: "hurts", tags: ["#Artists", "#Identity"], quote: "g16",
    content: `camille said it better than i could. it's not jealousy. it's watching your identity get turned into a prompt.`,
    c: [["@camilleart", `merci lucía. ça compte de ne pas être seule là-dessus.`, 31], ["@yasmintries", `the identity-as-prompt line. oof.`, 87]] },
  { day: "2026-10-23", time: "16:50", by: "@aartiworks", feeling: "confused", tags: ["#Data", "#Truth"],
    content: `a dashboard told me a number was "up." the number was up because the source table was empty. we shipped a celebration email. i'm still thinking about it.`,
    c: [["@devwithtea", `the empty table celebration email is a whole genre of failure`, 34], ["@kojobuilds", `this is why i don't trust a metric until i've seen the query`, 72]] },

  // Oct 24
  { day: "2026-10-24", time: "04:55", by: "@tessacodes", feeling: "using-it", tags: ["#Code", "#Humor"],
    content: `frontend dev. i let AI write a component, it used a library we don't have, invented two props, and styled it beautifully. i've never been so impressed and so annoyed at the same time.`,
    c: [["@maravoss", `the invented props are always so confident. like it's daring you to check.`, 26], ["@tessacodes", `@maravoss it named one "isActive" and i almost believed it`, 44]] },
  { day: "2026-10-24", time: "11:50", by: "@amayawrites", feeling: "worried", tags: ["#Writers", "#Ethics"],
    content: `i keep thinking about the phrase "AI-assisted." assisted by whom, for whose benefit, and who gets to say no? the grammar hides a lot.`,
    c: [["@leothedev", `passive voice doing the heaviest lifting in the English language`, 37], ["@sanahere", `as someone in marketing: this is exactly how the phrase gets used in decks. hides the layoffs.`, 94]] },
  { day: "2026-10-24", time: "16:35", by: "@kenjisato", feeling: "using-it", tags: ["#Work", "#Trust"], lang: ["ja", "日本語"],
    content: `AIのおかげで障害対応のログを読むのが速くなった。でも、最後に判断するのは自分。その line を曖昧にしたら終わりだと思う。`,
    c: [["@noahlearns", `the line being clear is the whole job`, 33], ["@tessacodes", `translation please? but i think i agree with the vibe`, 61], ["@kenjisato", `@tessacodes "the last judgment has to be mine. if that line gets blurry, it's over."`, 78]] },

  // Oct 25
  { day: "2026-10-25", time: "06:05", by: "@rahulreflects", feeling: "confused", tags: ["#Code", "#Craft"],
    content: `engineer, 4 yrs. i asked AI to refactor a module. it made it 30% shorter and 0% clearer. shorter is not the same as simpler. i keep having to say this.`,
    c: [["@devwithtea", `shorter ≠ simpler is going to be on my gravestone`, 31], ["@kojobuilds", `it optimizes for lines, we optimize for the next person. different objective.`, 89]] },
  { day: "2026-10-25", time: "12:20", by: "@dewirasa", feeling: "love-it", tags: ["#Education", "#Kids"], lang: ["id", "Bahasa Indonesia"],
    content: `seorang murid bilang: "bu, AI bilang jawaban saya salah, tapi saya yakin benar." kami cek. muridnya benar. AI-nya salah. dia tersenyum sepanjang pelajaran.`,
    c: [["@hanisays", `that smile is the whole reason we teach`, 27], ["@miraonai", `i needed this story today`, 73]] },
  { day: "2026-10-25", time: "17:25", by: "@ellieafterhours", feeling: "confused", tags: ["#Life", "#Care"],
    content: `on my break i used AI to write a birthday message for my sister because i was too tired to find the words. it was fine. i sent it. then i felt weird. i'm still not sure why.`,
    c: [["@amayawrites", `because "fine" is not the same as "yours." even when you're tired, your tired words are yours.`, 29], ["@priyathinks", `be gentle with yourself. you were running on empty. the love was still real.`, 66], ["@ellieafterhours", `@priyathinks thank you. i think i needed to hear that.`, 84]] },

  // Oct 26
  { day: "2026-10-26", time: "05:15", by: "@emilyoutside", feeling: "hurts", tags: ["#Art", "#Creative"],
    content: `photographer. a client asked me to "just fix it with AI" instead of reshooting. fix what? the light was the point. the imperfect sky was the point. i don't know how to explain that in an invoice.`,
    c: [["@yasmintries", `the imperfect sky was the point. i'm going to cry in a good way`, 40], ["@luciadesign", `it's impossible to invoice for taste. that's the whole problem.`, 98]] },
  { day: "2026-10-26", time: "10:55", by: "@jordanbuilds", feeling: "love-it", tags: ["#Build", "#Ideas"],
    content: `unpopular opinion: the best use of AI i've found is asking it to argue against my own idea. it's a tireless devil's advocate. i ship better when something pushes back.`,
    c: [["@leothedev", `using the machine's infinite confidence against itself. respect.`, 34], ["@aartiworks", `i do this with data hypotheses. it's like a sparring partner with no ego.`, 91]] },
  { day: "2026-10-26", time: "15:55", by: "@hanisays", feeling: "worried", tags: ["#Juniors", "#Work"], quote: "g6",
    content: `every junior i know is having this exact fear and almost none of them say it out loud. noah said it. we should be building the entry ramp, not automating it away.`,
    c: [["@noahlearns", `thank you. genuinely. i thought i was being dramatic.`, 33], ["@devwithtea", `you weren't. half my team feels it and we're not even junior anymore.`, 77]] },
  { day: "2026-10-26", time: "17:50", by: "@amayawrites", feeling: "worried", tags: ["#News", "#Trust"],
    content: `first week here. my editor asked me to "let AI tighten" a sensitive interview. i said no. he looked at me like i'd asked to bring a typewriter. i'll keep asking.`,
    c: [["@leothedev", `the typewriter look. i know it well.`, 29], ["@finnwrites", `"let AI tighten" a sensitive interview is a sentence that should not exist`, 82]] },

  // Oct 27
  { day: "2026-10-27", time: "04:30", by: "@danielthoughts", feeling: "worried", tags: ["#Support", "#People"],
    content: `support lead. we added an AI assistant. our CSAT went up for simple tickets and down for hard ones. people don't want fast answers when they're scared. they want a person who stays.`,
    c: [["@priyathinks", `presence can't be optimized. that's the lesson every support team learns the hard way.`, 38], ["@ellieafterhours", `as someone on the other side of a screen at 3am: yes. stay.`, 95]] },
  { day: "2026-10-27", time: "11:15", by: "@minsuworks", feeling: "love-it", tags: ["#Work", "#Craft"], lang: ["ko", "한국어"],
    content: `오늘 처음으로 AI가 만든 초안을 그냥 버렸어요. 처음부터 다시 썼어요. 시간은 더 걸렸지만, 내 문장이라는 느낌이 들었어요. 그게 중요하다는 걸 이제 알았어요.`,
    c: [["@amayawrites", `the feeling of "my sentence." yes. that's worth the extra hour.`, 31], ["@kenjisato", `その感覚、大事にしてください。効率より長く残るもの。`, 79]] },
  { day: "2026-10-27", time: "16:20", by: "@marcusandco", feeling: "using-it", tags: ["#Hiring", "#Jobs"],
    content: `hot take from a recruiter: "AI proficiency" on a resume means nothing now. everyone has it. what i look for is judgment. taste. the ability to say "this is wrong." hard to put on a CV. easy to spot in 10 minutes.`,
    c: [["@leothedev", `judgment and taste. the two things that don't autocomplete.`, 27], ["@finnwrites", `and the ability to say "this is wrong" is the whole seniority ladder`, 84]] },

  // Oct 28
  { day: "2026-10-28", time: "06:30", by: "@sofiaworks", feeling: "worried", tags: ["#News", "#Trust"],
    content: `journalist. i used AI to transcribe 6 hours of interviews. it saved my wrists and my weekend. then i found one quote it "cleaned up" that changed the meaning. i caught it. this time.`,
    c: [["@leothedev", `the "cleaned up" quote is terrifying. accuracy isn't a style choice.`, 34], ["@finnwrites", `this is why "just check it" is not a real safety plan. attention is finite.`, 91]] },
  { day: "2026-10-28", time: "12:45", by: "@aartiworks", feeling: "love-it", tags: ["#Data", "#Trust"],
    content: `i built a tiny dashboard that flags when AI summaries disagree with the raw data. it's boring. nobody asked for it. it's the most useful thing i've built this year.`,
    c: [["@sofiaworks", `please give this to every newsroom. genuinely.`, 26], ["@kojobuilds", `boring infrastructure is the real hero arc`, 68]] },
  { day: "2026-10-28", time: "17:15", by: "@dexbuilds", feeling: "love-it", tags: ["#Build", "#Craft"], quote: "g3",
    content: `jordan's post is the good version of this story. the tool handled the boring parts, the human kept the part people feel. that's the whole deal. everything else is noise.`,
    c: [["@jordanbuilds", `appreciate you, dex. the boring parts are where the time goes.`, 29], ["@tessacodes", `"the part people feel" — saving this for my next build`, 76]] },
  { day: "2026-10-28", time: "18:25", by: "@yasmintries", feeling: "need-support", tags: ["#Art", "#Money"],
    content: `a client sent me an AI image and asked me to "make it look hand-drawn." i asked if they wanted me to redraw it or trace it. they said "whatever's faster." i haven't replied yet.`,
    c: [["@camilleart", `"whatever's faster" is how they talk about us too`, 31], ["@emilyoutside", `the silence before you reply is the most honest part of the job`, 88]] },

  // Oct 29 (today)
  { day: "2026-10-29", time: "02:40", by: "@amritspeaks", feeling: "confused", tags: ["#Intro", "#Future"],
    content: `joined at 2am because i couldn't sleep thinking about all this. student, 21. i don't think AI is evil or magic. i think we're all pretending we know how this ends. i'd rather talk about it honestly.`,
    c: [["@miraonai", `welcome. the 2am honesty is the only kind that counts here.`, 12], ["@danielthoughts", `we're all pretending a little. at least you said it out loud.`, 24]] },
  { day: "2026-10-29", time: "04:05", by: "@priyathinks", feeling: "confused", tags: ["#Future", "#People"],
    content: `last thought before sleep: the people who are scared of AI and the people who love it are usually scared and in love with the same thing — being replaced, or being free. same fear, different hope.`,
    c: [["@amayawrites", `same fear, different hope. that's the whole timeline in one line.`, 9], ["@maravoss", `okay this is too deep for a wednesday. but yes.`, 18]] },
  { day: "2026-10-29", time: "05:15", by: "@noahlearns", feeling: "love-it", tags: ["#Juniors", "#Work"],
    content: `update: i asked my manager for a "learning hour" every week to go through the AI-generated code with a senior. he said yes. small thing. feels big.`,
    c: [["@devwithtea", `that's not small. that's how you keep a generation of engineers.`, 7], ["@hanisays", `the yes matters. someone said yes.`, 15]] },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_HANDLES = new Set(PEOPLE.map((p) => p.handle));
for (const p of POSTS) {
  if (!ALL_HANDLES.has(p.by)) throw new Error(`Unknown author ${p.by}`);
  const postTime = at(p.day, p.time).getTime();
  if (postTime < new Date(PERSON.get(p.by).joined).getTime()) {
    throw new Error(`${p.by} posts on ${p.day} before joining`);
  }
  for (const [handle, , after] of p.c || []) {
    if (!ALL_HANDLES.has(handle)) throw new Error(`Unknown commenter ${handle} on ${p.day}`);
    const commentTime = postTime + after * 60_000;
    if (commentTime < new Date(PERSON.get(handle).joined).getTime()) {
      throw new Error(`${handle} comments on ${p.day} before joining`);
    }
  }
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);
console.log(`Connected to ${dbName}${DRY ? " (dry run)" : ""}`);

const users = db.collection("users");
const profiles = db.collection("profiles");
const posts = db.collection("posts");
const messages = db.collection("messages");
const reactions = db.collection("reactions");
const follows = db.collection("follows");
const moods = db.collection("moods");

// 1. People — create missing accounts + profiles, keep existing rows untouched.
const userIdByHandle = new Map();
const seededHandles = new Set();
for (const person of PEOPLE) {
  const norm = person.handle.replace(/^@/, "");
  const existing = await users.findOne({ handle: { $in: [person.handle, norm] } });
  if (existing) {
    userIdByHandle.set(person.handle, String(existing._id));
    continue;
  }
  seededHandles.add(person.handle);
  if (!DRY) {
    const _id = new ObjectId();
    await users.insertOne({
      _id,
      handle: person.handle,
      displayName: person.author,
      createdAt: person.joined,
      lastLoginAt: person.joined,
      verified: false,
    });
    userIdByHandle.set(person.handle, String(_id));
  }
  const profileExists = await profiles.findOne({ handle: person.handle });
  if (!profileExists && !DRY) {
    await profiles.insertOne({
      handle: person.handle,
      author: person.author,
      avatar_url: null,
      bio: person.bio,
      privacy: "public",
      updated_at: new Date(person.joined),
    });
  }
}

// 2. Posts — insert missing takes, keep a map from timeline_id to _id.
const existingPosts = await posts.find({ timeline_id: { $exists: true } }).project({ timeline_id: 1, _id: 1 }).toArray();
const postIdByTimeline = new Map(existingPosts.map((p) => [p.timeline_id, String(p._id)]));

const seedIds = [...new Set(POSTS.map((p) => p.quote).filter(Boolean))];
const seedPostRows = seedIds.length
  ? await posts.find({ seed_id: { $in: seedIds } }).project({ _id: 1, seed_id: 1 }).toArray()
  : [];
const seedPostId = new Map(seedPostRows.map((p) => [p.seed_id, String(p._id)]));

let insertedPosts = 0;
const newPosts = [];
for (let i = 0; i < POSTS.length; i++) {
  const p = POSTS[i];
  const timelineId = `tl-${p.day}-${String(i + 1).padStart(2, "0")}`;
  if (postIdByTimeline.has(timelineId)) continue;

  const created = clampTime(at(p.day, p.time));
  const [language, languageLabel] = p.lang || ["en", "English"];
  const doc = {
    timeline_id: timelineId,
    handle: p.by,
    author: PERSON.get(p.by).author,
    content: p.content,
    media_type: "text",
    feeling: p.feeling,
    custom_feeling: null,
    media_url: null,
    media_duration: null,
    stream_url: null,
    stream_ready: false,
    tags: p.tags,
    language,
    language_label: languageLabel,
    integrity_hash: hash(`${timelineId}:${p.by}:${p.content}`),
    integrity_verified: false,
    integrity_label: "Signed on post",
    transcript: null,
    boosts: 0,
    quoted_post_id: p.quote ? seedPostId.get(p.quote) ?? null : null,
    view_count: 0,
    author_joined_at: PERSON.get(p.by).joined,
    created_at: created,
    user_id: userIdByHandle.get(p.by) || new ObjectId().toString(),
  };
  newPosts.push({ doc, timelineId, source: p, created });
  if (!DRY) {
    const res = await posts.insertOne(doc);
    postIdByTimeline.set(timelineId, String(res.insertedId));
    insertedPosts++;
  }
}
if (!DRY) {
  for (const np of newPosts) np.doc.view_count = 0;
}
console.log(`Posts: ${insertedPosts} inserted, ${POSTS.length - insertedPosts} already present`);

// 3. Comments + reactions + views for every timeline post.
let insertedComments = 0;
let insertedReactions = 0;
let skippedReactions = 0;

// Reaction palette valid for this product.
const PALETTE = {
  "using-it": [["❤️", 5], ["🤩", 2], ["😟", 2]],
  "love-it": [["❤️", 5], ["🤩", 3], ["😟", 1]],
  "blown-away": [["🤩", 5], ["❤️", 3], ["😟", 1]],
  hurts: [["😟", 5], ["❤️", 3], ["🤩", 1]],
  worried: [["😟", 5], ["❤️", 3], ["🤩", 1]],
  confused: [["❤️", 3], ["😟", 3], ["🤩", 2]],
  "need-support": [["❤️", 5], ["😟", 3], ["🤩", 1]],
  custom: [["❤️", 4], ["😟", 2], ["🤩", 2]],
};
function pickReaction(feeling, rng) {
  const palette = PALETTE[feeling] || PALETTE.custom;
  const total = palette.reduce((n, [, w]) => n + w, 0);
  let r = rng() * total;
  for (const [emoji, w] of palette) {
    r -= w;
    if (r <= 0) return emoji;
  }
  return palette[0][0];
}

for (const post of POSTS) {
  const idx = POSTS.indexOf(post);
  const timelineId = `tl-${post.day}-${String(idx + 1).padStart(2, "0")}`;
  const postId = postIdByTimeline.get(timelineId);
  if (!postId) continue; // dry run
  const created = clampTime(at(post.day, post.time));
  const rng = rngFor(timelineId);

  // Comments (flat thread, natural replies reference each other by @handle).
  const usedCommentIds = new Set(
    (await messages.find({ timeline_id: { $regex: `^${timelineId}:c` } }).project({ timeline_id: 1 }).toArray()).map(
      (m) => m.timeline_id
    )
  );
  for (let ci = 0; ci < (post.c || []).length; ci++) {
    const [handle, body, after] = post.c[ci];
    const commentTimelineId = `${timelineId}:c${ci + 1}`;
    if (usedCommentIds.has(commentTimelineId)) continue;
    if (!DRY) {
      await messages.insertOne({
        timeline_id: commentTimelineId,
        post_id: postId,
        handle,
        author: PERSON.get(handle).author,
        body: body.trim().slice(0, 600),
        created_at: clampTime(new Date(created.getTime() + after * 60_000)),
      });
      insertedComments++;
    }
  }

  // Reactions: 3–9 people who had already joined, then saves and boosts.
  const others = shuffle(
    PEOPLE.filter(
      (p) => p.handle !== post.by && new Date(p.joined).getTime() <= created.getTime()
    ).map((p) => p.handle),
    rng
  );
  const n = 3 + Math.floor(rng() * 7);
  const reactors = others.slice(0, Math.min(n, others.length));
  const rows = [];
  for (const handle of reactors) {
    const reaction = pickReaction(post.feeling, rng);
    rows.push({
      post_id: postId,
      handle,
      handle_norm: handle.replace(/^@/, "").toLowerCase(),
      reaction,
      created_at: clampTime(new Date(created.getTime() + (5 + Math.floor(rng() * 2880)) * 60_000)),
    });
  }
  // Saves are private; boost is the public reshare.
  const savers = shuffle(reactors, rng).slice(0, 1 + Math.floor(rng() * 3));
  for (const handle of savers) {
    if (rng() < 0.45) continue;
    rows.push({
      post_id: postId,
      handle,
      handle_norm: handle.replace(/^@/, "").toLowerCase(),
      reaction: "🔖",
      created_at: clampTime(new Date(created.getTime() + (10 + Math.floor(rng() * 4320)) * 60_000)),
    });
  }
  const boosters = shuffle(reactors, rng).slice(0, 1 + Math.floor(rng() * 3));
  for (const handle of boosters) {
    if (rng() < 0.55) continue;
    rows.push({
      post_id: postId,
      handle,
      handle_norm: handle.replace(/^@/, "").toLowerCase(),
      reaction: "🔁",
      created_at: clampTime(new Date(created.getTime() + (8 + Math.floor(rng() * 2880)) * 60_000)),
    });
  }

  if (!DRY && rows.length) {
    try {
      const res = await reactions.insertMany(rows, { ordered: false });
      insertedReactions += res.insertedCount;
    } catch (e) {
      insertedReactions += e.result?.insertedCount ?? 0;
      skippedReactions += rows.length - (e.result?.insertedCount ?? 0);
      if (e.code !== 11000) throw e;
    }
  }

  if (!DRY) {
    const views = 8 + Math.floor(rng() * 40) + reactors.length * 2 + (post.c || []).length * 3;
    await posts.updateOne({ _id: new ObjectId(postId) }, { $set: { view_count: views } });
  }
}
console.log(`Comments: ${insertedComments} inserted`);
console.log(`Reactions: ${insertedReactions} inserted${skippedReactions ? `, ${skippedReactions} already existed` : ""}`);

// 4. A small follow graph among the seeded voices, so profiles aren't islands.
let insertedFollows = 0;
if (!DRY) {
  const byHandle = new Map(PEOPLE.map((p) => [p.handle, p]));
  for (const newbie of NEW_USERS) {
    const rng = rngFor(`follow:${newbie.handle}`);
    const join = new Date(newbie.joined).getTime();
    const older = PEOPLE.filter(
      (p) => p.handle !== newbie.handle && new Date(p.joined).getTime() <= join
    );
    const targets = shuffle(older.map((p) => p.handle), rng).slice(0, 4);
    for (const target of targets) {
      const res = await follows.updateOne(
        { follower: newbie.handle, following: target },
        {
          $setOnInsert: {
            follower: newbie.handle,
            following: target,
            status: "approved",
            created_at: new Date(Math.min(join + Math.floor(rng() * 72) * 3600_000, NOW - 60_000)),
            updated_at: new Date(Math.min(join + Math.floor(rng() * 72) * 3600_000, NOW - 60_000)),
          },
        },
        { upsert: true }
      );
      if (res.upsertedCount) insertedFollows++;
    }
    // A few people follow the new voice back.
    const backers = shuffle(older.map((p) => p.handle), rng).slice(0, 3);
    for (const backer of backers) {
      const res = await follows.updateOne(
        { follower: backer, following: newbie.handle },
        {
          $setOnInsert: {
            follower: backer,
            following: newbie.handle,
            status: "approved",
            created_at: new Date(Math.min(join + Math.floor(rng() * 96) * 3600_000, NOW - 60_000)),
            updated_at: new Date(Math.min(join + Math.floor(rng() * 96) * 3600_000, NOW - 60_000)),
          },
        },
        { upsert: true }
      );
      if (res.upsertedCount) insertedFollows++;
    }
    void byHandle;
  }
}
console.log(`Follows: ${insertedFollows} inserted`);

// 5. One mood tap per seeded author per day (feeds the public pulse).
let insertedMoods = 0;
if (!DRY) {
  for (const post of POSTS) {
    if (!seededHandles.has(post.by)) continue;
    const norm = post.by.replace(/^@/, "").toLowerCase();
    const created = clampTime(at(post.day, post.time));
    const res = await moods.updateOne(
      { handle_norm: norm, day: post.day },
      {
        $setOnInsert: {
          handle_norm: norm,
          day: post.day,
          feeling: post.feeling,
          source: "tap",
          created_at: created,
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount) insertedMoods++;
  }
}
console.log(`Moods: ${insertedMoods} inserted`);

await client.close();
console.log(DRY ? "Dry run complete — nothing written." : "Timeline seed complete.");
