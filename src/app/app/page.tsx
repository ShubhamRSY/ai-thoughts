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
  deletePost,
  checkPublishGuard,
  markPublished,
} from "@/lib/db";
import type { ReportReason } from "@/components/Feed/FeedCard";
import {
  detectContinent,
  preferredLanguages,
  rankByRegion,
  continentLabel,
  type ContinentId,
} from "@/lib/region";
import type { RegionScope } from "@/components/Feed/FilterBar";

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
  const [continent, setContinent] = useState<ContinentId>("americas");
  const [regionScope, setRegionScope] = useState<RegionScope>("near");
  const [undoId, setUndoId] = useState<string | null>(null);

  useEffect(() => {
    setContinent(detectContinent());
  }, []);

  useEffect(() => {
    if (!undoId) return;
    const t = window.setTimeout(() => setUndoId(null), 10000);
    return () => window.clearTimeout(t);
  }, [undoId]);

  const preferred = useMemo(() => preferredLanguages(continent), [continent]);

  const filtered = useMemo(() => {
    const base = thoughts.filter((t) => {
      const mOk = media === "all" || t.mediaType === media;
      const fOk = feeling === "all" || t.feeling === feeling;
      return mOk && fOk;
    });

    // Near you: lift languages common to this continent (and the browser) first.
    // Never hide other languages — translate stays available on every take.
    if (regionScope === "near") {
      return rankByRegion(base, preferred);
    }
    return base;
  }, [thoughts, media, feeling, regionScope, preferred]);

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

  const removeLocal = useCallback((thoughtId: string) => {
    setThoughts((prev) => prev.filter((t) => t.id !== thoughtId));
    setMine((prev) => prev.filter((t) => t.id !== thoughtId));
    setUndoId((id) => (id === thoughtId ? null : id));
  }, []);

  const onDelete = useCallback(
    async (thoughtId: string) => {
      const snapshot = thoughts.find((t) => t.id === thoughtId);
      removeLocal(thoughtId);
      if (!isLive()) return;
      const ok = await deletePost(thoughtId);
      if (!ok && snapshot) {
        setThoughts((prev) => [snapshot, ...prev]);
        if (sameAuthor(snapshot.handle, identityHandle)) {
          setMine((prev) => [snapshot, ...prev]);
        }
      }
    },
    [thoughts, removeLocal, identityHandle]
  );

  const undoPublish = useCallback(async () => {
    if (!undoId) return;
    await onDelete(undoId);
  }, [undoId, onDelete]);

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
        setUndoId(posted.id);
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
      setUndoId(newThought.id);
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
      if (cancelled || !posts || posts.length === 0) return;
      setThoughts(posts);
      setMine(posts.filter((t) => sameAuthor(t.handle, identityHandle)));
    });
    return () => {
      cancelled = true;
    };
  }, [identityHandle]);

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
    <div className="app-frame">
      <Header onShare={() => openShare("video")} />

      <main className="flex-1 pb-nav">
        {tab === "home" && (
          <>
            {room ? (
              <FeelingRoom
                feelingId={room}
                thoughts={thoughts}
                onCreate={() => handleShareInRoom(room)}
                onBack={backFromRoom}
                onReact={onReact}
                onDelete={onDelete}
                currentHandle={user?.handle ?? null}
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
                  regionScope={regionScope}
                  onRegionScopeChange={setRegionScope}
                  continent={continent}
                  onContinentChange={setContinent}
                />

                <div className="app-pad mt-2">
                  <div className="mb-1 flex items-end justify-between border-b border-[var(--border-base)] pb-3 pt-4">
                    <div>
                      <h2 className="font-display text-lg font-medium text-[var(--foreground)]">
                        Latest takes
                      </h2>
                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                        {regionScope === "near"
                          ? `${continentLabel(continent)} first · other languages still here · tap Translate`
                          : "Voices from everywhere · tap Translate on any language"}
                      </p>
                    </div>
                    <span className="text-[11px] tabular-nums text-[var(--muted)]">
                      {filtered.length}
                    </span>
                  </div>
                  <FeedGrid
                    thoughts={filtered}
                    onReact={onReact}
                    onReport={onReport}
                    onDelete={onDelete}
                    currentHandle={user?.handle ?? null}
                    onOpenRoom={handleOpenRoom}
                    othersMap={othersMap}
                  />
                </div>

                <div className="mt-8">
                  <Footer />
                </div>

                <p className="app-pad mt-4 flex items-center justify-center gap-1.5 pb-2 text-[11px] font-medium text-[var(--muted)]">
                  <HeartHandshake className="h-3.5 w-3.5 text-[var(--accent)]" />
                  All ages. All languages. Honest takes — with dignity.
                </p>
              </>
            )}
          </>
        )}

        {tab === "you" && (
          <div className="app-pad pt-4">
            <ProfileView
              myThoughts={mine}
              onCreate={() => openShare("video")}
              onDelete={user ? onDelete : undefined}
            />
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

      {undoId && (
        <div className="app-rail pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 sm:bottom-6">
          <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full border border-[var(--border-base)] bg-[var(--foreground)] px-4 py-2.5 text-sm text-[var(--surface)] shadow-lg">
            <span>Take shared</span>
            <button
              type="button"
              onClick={() => void undoPublish()}
              className="rounded-full bg-[var(--surface)]/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide hover:bg-[var(--surface)]/25"
            >
              Undo
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setUndoId(null)}
              className="text-[var(--surface)]/70 hover:text-[var(--surface)]"
            >
              ×
            </button>
          </div>
        </div>
      )}

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

function sameAuthor(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  return a.trim().toLowerCase().replace(/^@/, "") === b.trim().toLowerCase().replace(/^@/, "");
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
