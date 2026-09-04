"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HeartHandshake } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MobileNav, { type TabId } from "@/components/MobileNav";
import FilterBar, { type FeelingFilter } from "@/components/Feed/FilterBar";
import FeedGrid from "@/components/Feed/FeedGrid";
import ProfileView from "@/components/ProfileView";
import SubmitModal, { type SharePayload } from "@/components/Submit/SubmitModal";
import type { CapturedClip } from "@/components/Submit/MediaRecorderView";
import PulseOverview, { type FeelingTally } from "@/components/Pulse/PulseOverview";
import FeelingRoom from "@/components/Pulse/FeelingRoom";
import StreakCard from "@/components/StreakCard";
import { INITIAL_THOUGHTS } from "@/lib/mock-data";
import { digestBytes } from "@/lib/integrity";
import { useLocalProfile } from "@/hooks/useLocalProfile";
import { useAuth } from "@/hooks/useAuth";
import { useFeelingStreak } from "@/hooks/useFeelingStreak";
import type { MediaType, Thought, FeelingId, Reaction, PublishResult } from "@/lib/types";
import {
  fetchPulsePosts,
  isLive,
  publishPost,
  addReaction,
  reportPost,
  checkPublishGuard,
  markPublished,
} from "@/lib/db";
import type { ReportReason } from "@/components/Feed/FeedCard";

type MediaFilter = "all" | MediaType;

export default function Home() {
  const { profile, save } = useLocalProfile();
  const { user } = useAuth();
  const identityHandle = user?.handle || profile.handle;
  const identityAuthor = user?.displayName || profile.author;
  const { streak, bump } = useFeelingStreak();
  const [thoughts, setThoughts] = useState<Thought[]>(INITIAL_THOUGHTS);
  const [mine, setMine] = useState<Thought[]>([]);
  const [media, setMedia] = useState<MediaFilter>("all");
  const [feeling, setFeeling] = useState<FeelingFilter>("all");
  const [tab, setTab] = useState<TabId>("home");
  const [shareOpen, setShareOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<MediaType>("video");
  const [modalSession, setModalSession] = useState(0);
  const [room, setRoom] = useState<FeelingId | null>(null);
  const [shareFeeling, setShareFeeling] = useState<FeelingId | undefined>(undefined);

  const filtered = thoughts.filter((t) => {
    const mOk = media === "all" || t.mediaType === media;
    const fOk = feeling === "all" || t.feeling === feeling;
    return mOk && fOk;
  });

  const openShare = (tabPref: MediaType = "video", presetFeeling?: FeelingId) => {
    setInitialTab(tabPref);
    setShareFeeling(presetFeeling);
    setModalSession((s) => s + 1);
    setShareOpen(true);
  };

  const handleOpenRoom = (id: FeelingId) => {
    setFeeling(id);
    setRoom(id);
  };

  const backFromRoom = () => {
    setRoom(null);
    setFeeling("all");
  };

  const handleShareInRoom = (id: FeelingId) => {
    openShare("video", id);
  };

  const onReport = useCallback((thoughtId: string, reason: ReportReason) => {
    if (!isLive()) return;
    const t = INITIAL_THOUGHTS.find((x) => x.id === thoughtId);
    void reportPost(thoughtId, reason, {
      handle: t?.handle,
      content: t?.content,
    });
  }, []);

  const publish = useCallback(
    async (data: SharePayload, clip?: CapturedClip): Promise<PublishResult> => {
      const guard = checkPublishGuard(data.content);
      if (!guard.ok) return guard;

      const userHandle = data.handle.startsWith("@") ? data.handle : `@${data.handle}`;
      if (!user && profile.handle !== userHandle) save({ ...profile, handle: userHandle });

      let integrity = data.integrity;
      if (clip?.blob) {
        const hash = await digestBytes(clip.blob);
        integrity = {
          hash,
          verified: true,
          statusLabel: "Capture chip · unmodified",
        };
      }

      const refined: SharePayload = { ...data, integrity };

      if (isLive()) {
        const posted = await publishPost(refined, clip?.blob ?? null);
        if (!posted) return { ok: false, reason: "failed" };
        markPublished();
        setThoughts((prev) => [posted, ...prev]);
        setMine((prev) => [posted, ...prev]);
        bump(data.feeling);
        return { ok: true };
      }

      markPublished();
      const newThought: Thought = {
        ...refined,
        id: `t${Date.now()}`,
        reactions: [
          { type: "🔥", count: 1 },
          { type: "🤔", count: 0 },
        ],
        timeLabel: "now",
      };

      setThoughts((prev) => [newThought, ...prev]);
      setMine((prev) => [newThought, ...prev]);
      bump(data.feeling);
      return { ok: true };
    },
    [profile, save, bump, user]
  );

  const onReact = useCallback((thoughtId: string, reaction: Reaction) => {
    if (isLive()) void addReaction(thoughtId, reaction);
  }, []);

  useEffect(() => {
    if (!isLive()) return;
    let cancelled = false;
    fetchPulsePosts().then((posts) => {
      if (!cancelled && posts && posts.length > 0) setThoughts(posts);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isLive()) return;
    const id = setInterval(() => {
      setThoughts((prev) => {
        if (prev.length === 0) return prev;
        const tIdx = (Date.now() / 1000) % prev.length;
        const target = prev[Math.floor(tIdx)];
        if (!target) return prev;
        const rIdx = Math.floor(Math.random() * Math.max(target.reactions.length, 1));
        return prev.map((t) =>
          t.id === target.id
            ? {
                ...t,
                reactions: t.reactions.map((r, i) =>
                  i === rIdx ? { ...r, count: r.count + 1 } : r
                ),
              }
            : t
        );
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const feelingTally = useMemo(() => computeTally(thoughts), [thoughts]);

  const othersMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of thoughts) if (t.feeling) m[t.feeling] = (m[t.feeling] ?? 0) + 1;
    return m;
  }, [thoughts]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col sm:border-x sm:border-zinc-800/40">
      <Header onShare={() => openShare("video")} />

      <main className="flex-1 pb-28">
        {tab === "home" && (
          <>
            {room ? (
              <FeelingRoom
                feelingId={room}
                thoughts={thoughts}
                onCreate={() => handleShareInRoom(room)}
                onBack={backFromRoom}
                onReact={onReact}
              />
            ) : (
              <>
                <PulseOverview
                  thoughts={thoughts}
                  tally={feelingTally}
                  activeId={room}
                  onOpenRoom={handleOpenRoom}
                />

                <FilterBar
                  media={media}
                  onMediaChange={setMedia}
                  feeling={feeling}
                  onFeelingChange={setFeeling}
                />

                <div className="mt-5 px-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Latest takes
                    </h2>
                    <span className="text-[11px] tabular-nums text-zinc-600">
                      {filtered.length} shown
                    </span>
                  </div>
                  <FeedGrid
                    thoughts={filtered}
                    onReact={onReact}
                    onReport={onReport}
                    onOpenRoom={handleOpenRoom}
                    othersMap={othersMap}
                  />
                </div>

                <div className="mt-8">
                  <Footer />
                </div>

                <p className="mx-4 mt-4 flex items-center justify-center gap-1.5 pb-2 text-[11px] font-medium text-zinc-500">
                  <HeartHandshake className="h-3.5 w-3.5 text-emerald-400" />
                  All ages. All feelings. It&apos;s okay to feel bad about AI too.
                </p>
              </>
            )}
          </>
        )}

        {tab === "you" && (
          <div className="px-4 pt-4">
            <ProfileView myThoughts={mine} onCreate={() => openShare("video")} />
            <StreakCard
              count={streak.count}
              todayFeeling={streak.todayFeeling}
              checkedInToday={streak.last === todayKey()}
              onCreate={() => openShare("video")}
            />
          </div>
        )}
      </main>

      <MobileNav active={tab} onTab={setTab} onCreate={() => openShare("video")} />

      <SubmitModal
        key={modalSession}
        open={shareOpen}
        initialTab={initialTab}
        presetHandle={identityHandle}
        presetAuthor={identityAuthor}
        presetFeeling={shareFeeling}
        lockedIdentity={!!user}
        onClose={() => setShareOpen(false)}
        onPublish={publish}
      />
    </div>
  );
}

function computeTally(thoughts: Thought[]): FeelingTally[] {
  const counts: Record<string, number> = {};
  for (const t of thoughts) if (t.feeling) counts[t.feeling] = (counts[t.feeling] ?? 0) + 1;
  return (Object.entries(counts) as [FeelingId, number][])
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
