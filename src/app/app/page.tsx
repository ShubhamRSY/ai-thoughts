"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HeartHandshake } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NavRail, { type TabId } from "@/components/NavRail";
import FilterBar, { type FeelingFilter } from "@/components/Feed/FilterBar";
import FeedGrid from "@/components/Feed/FeedGrid";
import ProfileView from "@/components/ProfileView";
import SubmitModal, { type SharePayload } from "@/components/Submit/SubmitModal";
import type { CapturedClip } from "@/components/Submit/MediaRecorderView";
import FeelingRoom from "@/components/Pulse/FeelingRoom";
import StreakCard from "@/components/StreakCard";
import DailyCheckIn from "@/components/DailyCheckIn";
import DailyPulse from "@/components/DailyPulse";
import DailyHabits from "@/components/DailyHabits";
import AccountCenter from "@/components/AccountCenter";
import MissedYesterday from "@/components/MissedYesterday";
import { useActivity } from "@/components/ActivityPanel";
import ActivityView from "@/components/ActivityView";
import PeopleSearchView from "@/components/PeopleSearchView";
import MaintenanceBanner, { useSiteFlags } from "@/components/MaintenanceBanner";
import FeaturedVoice from "@/components/FeaturedVoice";
import OnboardingWizard from "@/components/OnboardingWizard";
import PulseMoved from "@/components/PulseMoved";
import { digestBytes } from "@/lib/integrity";
import { useLocalProfile } from "@/hooks/useLocalProfile";
import { useAuth } from "@/hooks/useAuth";
import { useFeelingStreak } from "@/hooks/useFeelingStreak";
import type { MediaType, Thought, FeelingId, Reaction, PublishResult } from "@/lib/types";
import { FEED_PAGE_SIZE } from "@/lib/types";
import {
  fetchPulsePosts,
  isLive,
  publishPost,
  addReaction,
  reportPost,
  deletePost,
  archivePost,
  checkPublishGuard,
  markPublished,
  quoteRepost,
} from "@/lib/db";
import type { ReportReason } from "@/components/Feed/FeedCard";
import type { RegionScope } from "@/components/Feed/FilterBar";
import { todayKey as promptTodayKey } from "@/lib/daily-prompt";
import { BOOKMARK_REACTION } from "@/lib/likes";

type MediaFilter = "all" | MediaType;

export default function Home() {
  const router = useRouter();
  const { profile, save } = useLocalProfile();
  const { user } = useAuth();
  const identityHandle = user?.handle || profile.handle;
  const identityAuthor = user?.displayName || profile.author;
  const { streak, bump } = useFeelingStreak();
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [feedStatus, setFeedStatus] = useState<"loading" | "ready" | "error">("loading");
  /** Timestamp of the oldest take loaded from the main feed; null = nothing older to load. */
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [focusPostId, setFocusPostId] = useState<string | null>(null);
  const [mine, setMine] = useState<Thought[]>([]);
  const [media, setMedia] = useState<MediaFilter>("all");
  const [feeling, setFeeling] = useState<FeelingFilter>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("home");
  const [shareOpen, setShareOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<MediaType>("video");
  const [modalSession, setModalSession] = useState(0);
  const [room, setRoom] = useState<FeelingId | null>(null);
  const [shareFeeling, setShareFeeling] = useState<FeelingId | undefined>(undefined);
  const [regionScope, setRegionScope] = useState<RegionScope>("world");
  const [undoId, setUndoId] = useState<string | null>(null);
  const [following, setFollowing] = useState<string[]>([]);
  const [shareFromDaily, setShareFromDaily] = useState(false);
  /** null = not loaded yet (wizard hidden to avoid flash); true = already onboarded. */
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  /** Handle whose profile the "You" tab is currently showing (null = your own). */
  const [viewProfileHandle, setViewProfileHandle] = useState<string | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const { items: activityItems, unread: activityUnread, markAllRead, refresh: refreshActivity } =
    useActivity(!!user);
  const { maintenance, message: maintenanceMessage, featured } = useSiteFlags();

  useEffect(() => {
    if (!user) {
      setFollowing([]);
      return;
    }
    let cancelled = false;
    fetch("/api/follows", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.following) setFollowing(data.following);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  // First-run onboarding: only new accounts have onboarded=false in prefs.
  useEffect(() => {
    if (!user) {
      setOnboarded(null);
      return;
    }
    let cancelled = false;
    fetch("/api/prefs", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setOnboarded(data ? Boolean(data.onboarded) : true);
      })
      .catch(() => {
        if (!cancelled) setOnboarded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!undoId) return;
    const t = window.setTimeout(() => setUndoId(null), 10000);
    return () => window.clearTimeout(t);
  }, [undoId]);

  const followingSet = useMemo(
    () => new Set(following.map((h) => h.trim().toLowerCase().replace(/^@/, ""))),
    [following]
  );

  const filtered = useMemo(() => {
    let base = thoughts.filter((t) => {
      const mOk = media === "all" || t.mediaType === media;
      const fOk = feeling === "all" || t.feeling === feeling;
      const tOk = !tag || t.tags?.some((x) => x.toLowerCase() === tag.toLowerCase());
      return mOk && fOk && tOk;
    });

    if (regionScope === "today") {
      const day = promptTodayKey();
      base = base.filter((t) => t.promptDay === day);
      return base;
    }

    if (regionScope === "circle") {
      return base.filter((t) =>
        followingSet.has(t.handle.trim().toLowerCase().replace(/^@/, ""))
      );
    }

    return base;
  }, [thoughts, media, feeling, tag, regionScope, followingSet]);

  const todayAnswerCount = useMemo(() => {
    const day = promptTodayKey();
    return thoughts.filter((t) => t.promptDay === day).length;
  }, [thoughts]);

  useEffect(() => {
    if (!focusPostId || feedStatus !== "ready") return;
    const t = window.setTimeout(() => {
      document.getElementById(`post-${focusPostId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);
    return () => window.clearTimeout(t);
  }, [focusPostId, feedStatus, filtered.length]);

  const onFeelWith = useCallback(
    async (handle: string, next: boolean = true) => {
      if (!user) return;
      const norm = handle.trim().toLowerCase().replace(/^@/, "");
      const prev = following;
      setFollowing((p) => {
        const without = p.filter((h) => h.trim().toLowerCase().replace(/^@/, "") !== norm);
        return next ? [`@${norm}`, ...without] : without;
      });
      try {
        const res = await fetch("/api/follows", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle, action: next ? "follow" : "unfollow" }),
        });
        // A follow on a private account is only a request — not "following" yet.
        if (!res.ok || (next && (await res.json()).requested)) setFollowing(prev);
      } catch {
        setFollowing(prev);
      }
    },
    [user, following]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("post");
    if (id) {
      setFocusPostId(id);
      setTab("home");
      setRoom(null);
      setRegionScope("world");
      setMedia("all");
      setFeeling("all");
    }
  }, []);

  const openActivityPost = useCallback((postId: string) => {
    setFocusPostId(postId);
    setTab("home");
    setRoom(null);
    setRegionScope("world");
    setMedia("all");
    setFeeling("all");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("post", postId);
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const invitePeople = useCallback(async () => {
    const url = typeof window !== "undefined" ? window.location.origin : "";
    const text = `I’m on AiTo saying how AI makes me feel. Join me: ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "AiTo", text, url });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const circle = params.get("circle");
    if (circle) {
      // Circles removed — ignore legacy deep links
      params.delete("circle");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
      window.history.replaceState({}, "", next);
    }
  }, []);

  const openShare = (
    tabPref: MediaType = "text",
    presetFeeling?: FeelingId,
    fromDaily = false
  ) => {
    if (!user) {
      router.push("/sign-in?next=/app");
      return;
    }
    if (maintenance) {
      window.alert(maintenanceMessage || "Voices is pausing briefly — check back soon.");
      return;
    }
    setInitialTab(tabPref);
    setShareFeeling(presetFeeling);
    setShareFromDaily(fromDaily);
    setModalSession((s) => s + 1);
    setShareOpen(true);
  };

  const browseToday = useCallback(() => {
    setTab("home");
    setRoom(null);
    setRegionScope("today");
  }, []);

  const finishOnboarding = useCallback(async () => {
    setOnboarded(true);
    try {
      await fetch("/api/prefs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarded: true }),
      });
    } catch {
      /* Session-local flag already covers it. */
    }
  }, []);

  const handleOpenRoom = (id: FeelingId) => {
    setFeeling(id);
    setRoom(id);
  };

  const backFromRoom = () => {
    setRoom(null);
    setFeeling("all");
  };

  const handleShareInRoom = (id: FeelingId) => {
    openShare("text", id);
  };

  const onReport = useCallback(
    async (thoughtId: string, reason: ReportReason) => {
      if (!isLive()) return false;
      const t = thoughts.find((x) => x.id === thoughtId);
      return reportPost(thoughtId, reason, {
        handle: t?.handle,
        content: t?.content,
      });
    },
    [thoughts]
  );

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

  const onArchive = useCallback(
    async (thoughtId: string) => {
      const snapshot =
        thoughts.find((t) => t.id === thoughtId) ?? mine.find((t) => t.id === thoughtId);
      removeLocal(thoughtId);
      if (!isLive()) return;
      const ok = await archivePost(thoughtId, true);
      if (!ok && snapshot) {
        setThoughts((prev) => [snapshot, ...prev]);
        setMine((prev) => [snapshot, ...prev]);
      }
    },
    [thoughts, mine, removeLocal]
  );

  const undoPublish = useCallback(async () => {
    if (!undoId) return;
    await onDelete(undoId);
  }, [undoId, onDelete]);

  const publish = useCallback(
    async (data: SharePayload, clip?: CapturedClip): Promise<PublishResult> => {
      if (!user) return { ok: false, reason: "auth" };
      const guard = checkPublishGuard(data.content);
      if (!guard.ok) return guard;

      const userHandle = data.handle.startsWith("@") ? data.handle : `@${data.handle}`;
      if (profile.handle !== userHandle) save({ ...profile, handle: userHandle });

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
        if ("error" in posted) {
          if (posted.retryInSec) {
            return { ok: false, reason: "cooldown", retryInSec: posted.retryInSec };
          }
          if (posted.error.toLowerCase().includes("sign in")) {
            return { ok: false, reason: "auth" };
          }
          return { ok: false, reason: "blocked", message: posted.error };
        }
        markPublished();
        setRegionScope("world");
        setMedia("all");
        setFeeling("all");
        setRoom(null);
        setThoughts((prev) => [posted.thought, ...prev.filter((t) => t.id !== posted.thought.id)]);
        setMine((prev) => [posted.thought, ...prev.filter((t) => t.id !== posted.thought.id)]);
        setUndoId(posted.thought.id);
        setFocusPostId(posted.thought.id);
        bump(data.feeling);
        return { ok: true, thought: posted.thought };
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
      return { ok: true, thought: newThought };
    },
    [profile, save, bump, user]
  );

  const onReact = useCallback(async (thoughtId: string, reaction: Reaction) => {
    if (!isLive()) return true;
    return addReaction(thoughtId, reaction);
  }, []);

  const onQuoteRepost = useCallback(
    async (postId: string, comment: string) => {
      if (!user) return false;
      const result = await quoteRepost(postId, comment, user.handle, user.displayName || user.handle);
      if ("error" in result) return false;
      setThoughts((prev) => [result.thought, ...prev.filter((t) => t.id !== result.thought.id)]);
      setMine((prev) => [result.thought, ...prev.filter((t) => t.id !== result.thought.id)]);
      // The original take's boost count/boostedByMe changed server-side too —
      // reflect it locally so the count is right without a full refetch.
      setThoughts((prev) =>
        prev.map((t) =>
          t.id === postId && !t.boostedByMe
            ? { ...t, boostedByMe: true, boostCount: (t.boostCount ?? 0) + 1 }
            : t
        )
      );
      return true;
    },
    [user]
  );

  // Unsaving from the Saved list needs the feed's own `bookmarkedByMe` flag
  // flipped too — FeedCard's optimistic toggle is local-only, so without
  // this the item would only disappear after the next full feed refetch.
  const onUnsave = useCallback(
    async (thoughtId: string) => {
      setThoughts((prev) =>
        prev.map((t) => (t.id === thoughtId ? { ...t, bookmarkedByMe: false } : t))
      );
      const ok = await onReact(thoughtId, BOOKMARK_REACTION);
      if (ok === false) {
        setThoughts((prev) =>
          prev.map((t) => (t.id === thoughtId ? { ...t, bookmarkedByMe: true } : t))
        );
      }
    },
    [onReact]
  );

  const saved = useMemo(() => thoughts.filter((t) => t.bookmarkedByMe), [thoughts]);
  const reposted = useMemo(() => thoughts.filter((t) => t.boostedByMe), [thoughts]);

  const reloadFeed = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!isLive()) {
        setFeedStatus("ready");
        return;
      }
      const silent = Boolean(opts?.silent);
      if (!silent) setFeedStatus("loading");
      const posts = await fetchPulsePosts();
      if (!posts) {
        if (!silent) {
          setThoughts([]);
          setMine([]);
          setFeedStatus("error");
        }
        return;
      }
      const last = posts.length >= FEED_PAGE_SIZE ? posts[posts.length - 1].timestamp : null;
      if (silent && last) {
        // Quiet refresh: refresh the newest page but keep older pages the reader already loaded.
        const oldest = Date.parse(last);
        setThoughts((prev) => [...posts, ...prev.filter((t) => Date.parse(t.timestamp) < oldest)]);
        setFeedCursor((prev) => (prev && Date.parse(prev) < oldest ? prev : last));
      } else {
        setThoughts(posts);
        setFeedCursor(last);
      }
      setMine(posts.filter((t) => sameAuthor(t.handle, identityHandle)));
      setFeedStatus("ready");
    },
    [identityHandle]
  );

  const loadOlder = useCallback(async () => {
    if (!feedCursor || loadingMore) return;
    setLoadingMore(true);
    const rows = await fetchPulsePosts({ before: feedCursor });
    setLoadingMore(false);
    if (!rows) return;
    setThoughts((prev) => {
      const seen = new Set(prev.map((t) => t.id));
      return [...prev, ...rows.filter((t) => !seen.has(t.id))].sort(
        (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)
      );
    });
    setFeedCursor(rows.length >= FEED_PAGE_SIZE ? rows[rows.length - 1].timestamp : null);
  }, [feedCursor, loadingMore]);

  // First load + when signed-in identity changes
  useEffect(() => {
    void reloadFeed({ silent: false });
  }, [reloadFeed]);

  // When user returns to the app (background → foreground), refresh feed quietly
  useEffect(() => {
    if (!isLive()) return;

    let lastRefresh = 0;
    const MIN_GAP_MS = 12_000;

    const refreshIfStale = () => {
      const now = Date.now();
      if (now - lastRefresh < MIN_GAP_MS) return;
      lastRefresh = now;
      void reloadFeed({ silent: true });
      if (user) void refreshActivity();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      // bfcache restore (common on mobile back / home-screen PWA)
      if (e.persisted) refreshIfStale();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", refreshIfStale);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", refreshIfStale);
    };
  }, [reloadFeed, refreshActivity, user]);

  // Merge today's prompt lane posts so the filter has enough answers.
  useEffect(() => {
    if (!isLive() || regionScope !== "today") return;
    let cancelled = false;
    fetchPulsePosts({ promptDay: promptTodayKey() }).then((posts) => {
      if (cancelled || !posts) return;
      setThoughts((prev) => {
        const byId = new Map(prev.map((t) => [t.id, t]));
        for (const p of posts) byId.set(p.id, p);
        return Array.from(byId.values()).sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
      });
    });
    return () => {
      cancelled = true;
    };
  }, [regionScope]);

  const othersMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of thoughts) if (t.feeling) m[t.feeling] = (m[t.feeling] ?? 0) + 1;
    return m;
  }, [thoughts]);

  return (
    <div className="flex min-h-dvh">
      <NavRail
        active={tab}
        onTab={(t) => {
          setTab(t);
          setViewProfileHandle(null);
          if (t === "activity") void refreshActivity();
        }}
        onCreate={() => openShare("text")}
        activityCount={activityUnread}
      />
      <div className="app-frame flex-1">
      <MaintenanceBanner />
      <Header onShare={() => openShare("text")} />

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
                onReport={onReport}
                onDelete={onDelete}
                onOpenRoom={handleOpenRoom}
                onFeelWith={user ? onFeelWith : undefined}
                onQuoteRepost={user ? onQuoteRepost : undefined}
                followingHandles={followingSet}
                othersMap={othersMap}
                currentHandle={user?.handle ?? null}
                currentAuthor={identityAuthor ?? null}
              />
            ) : (
              <>
                <DailyCheckIn
                  streakCount={streak.count}
                  checkedInToday={streak.last === todayKey()}
                  todayAnswerCount={todayAnswerCount}
                  onShare={() => openShare("text", undefined, true)}
                  onBrowseToday={browseToday}
                />

                <DailyPulse
                  signedIn={!!user}
                  onNeedSignIn={() => router.push("/sign-in?next=/app")}
                  onTap={bump}
                />

                {featured && <FeaturedVoice voice={featured} />}

                <MissedYesterday
                  signedIn={!!user}
                  hasCircle={following.length > 0}
                  checkedInToday={streak.last === todayKey()}
                  onOpenCircle={() => {
                    setRegionScope("circle");
                  }}
                  onAnswerToday={() => openShare("text", undefined, true)}
                />

                <PulseMoved />

                <FilterBar
                  media={media}
                  onMediaChange={setMedia}
                  feeling={feeling}
                  onFeelingChange={setFeeling}
                  regionScope={regionScope}
                  onRegionScopeChange={(scope) => {
                    setRegionScope(scope);
                  }}
                  tag={tag}
                  onTagChange={setTag}
                  circleCount={following.length}
                  todayCount={todayAnswerCount}
                />

                <div className="app-pad mt-2">
                  <div className="mb-1 flex items-end justify-between border-b border-[var(--border-base)] pb-3 pt-4">
                    <div>
                      <h2 className="font-display text-lg font-medium text-[var(--foreground)]">
                        {regionScope === "today" ? "Today’s answers" : "Latest takes"}
                      </h2>
                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                        {regionScope === "today"
                          ? "Same prompt, many voices · Follow someone who resonates"
                          : regionScope === "circle"
                            ? following.length
                              ? "People you follow · Translate anytime"
                              : "Follow someone from ··· on a take"
                            : "The newest voices · tap Translate on any language"}
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
                    currentAuthor={identityAuthor ?? null}
                    onOpenRoom={handleOpenRoom}
                    onFeelWith={user ? onFeelWith : undefined}
                    onQuoteRepost={user ? onQuoteRepost : undefined}
                    followingHandles={followingSet}
                    othersMap={othersMap}
                    loading={feedStatus === "loading"}
                    focusPostId={focusPostId}
                    emptyHint={
                      feedStatus === "error"
                        ? "Couldn’t load Voices — check your connection and try again."
                        : regionScope === "today"
                          ? "No answers to today’s prompt yet — share yours."
                          : regionScope === "circle"
                            ? following.length
                              ? "No takes from people you follow yet."
                              : "Follow someone on a take to build your circle."
                            : media !== "all"
                              ? "No takes in this format — try All."
                              : "Be the first to share how AI makes you feel."
                    }
                  />
                  {feedCursor && feedStatus === "ready" && (
                    <div className="mt-6 flex justify-center">
                      <button
                        type="button"
                        onClick={() => void loadOlder()}
                        disabled={loadingMore}
                        className="rounded-full border border-[var(--border-base)] px-5 py-2 text-sm font-semibold text-[var(--foreground)] hover:border-[var(--accent)] disabled:opacity-60"
                      >
                        {loadingMore ? "Loading…" : "Load older takes"}
                      </button>
                    </div>
                  )}
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

        {tab === "activity" && (
          <ActivityView
            items={activityItems}
            unread={activityUnread}
            signedIn={!!user}
            following={following}
            onMarkAllRead={() => void markAllRead()}
            onSelectPost={openActivityPost}
            onUnfollow={(handle) => void onFeelWith(handle, false)}
            onInvite={() => void invitePeople()}
            onOpenSearch={() => setTab("search")}
          />
        )}

        {tab === "search" && (
          <PeopleSearchView
            signedIn={!!user}
            onNeedSignIn={() => router.push("/sign-in?next=/app")}
            onFollow={(handle, next) => onFeelWith(handle, next)}
            onOpenPerson={(handle) => {
              setViewProfileHandle(handle);
              setTab("you");
            }}
          />
        )}

        {tab === "you" && (() => {
          const viewingOther =
            viewProfileHandle &&
            viewProfileHandle.trim().toLowerCase().replace(/^@/, "") !==
              (user?.handle || "").trim().toLowerCase().replace(/^@/, "");
          if (showAccount && user) {
            return (
              <div className="app-pad pt-4">
                <AccountCenter onBack={() => setShowAccount(false)} />
              </div>
            );
          }
          return (
            <div className="app-pad pt-4">
              <ProfileView
                myThoughts={mine}
                savedThoughts={saved}
                repostedThoughts={reposted}
                onCreate={() => openShare("text")}
                onDelete={user ? onDelete : undefined}
                onArchive={user ? onArchive : undefined}
                onUnsave={onUnsave}
                viewHandle={viewingOther ? viewProfileHandle! : undefined}
                onFollowToggle={(handle, next) => onFeelWith(handle, next)}
                onBack={() => setViewProfileHandle(null)}
                onOpenAccount={() => setShowAccount(true)}
              />
              {!viewingOther && (
                <>
                  <StreakCard
                    count={streak.count}
                    todayFeeling={streak.todayFeeling}
                    checkedInToday={streak.last === todayKey()}
                    onCreate={() => openShare("text")}
                  />
                  <DailyHabits
                    checkedInToday={streak.last === todayKey()}
                    displayHandle={identityHandle}
                    signedIn={!!user}
                    onOpenAccount={user ? () => setShowAccount(true) : undefined}
                  />
                </>
              )}
            </div>
          );
        })()}
      </main>
      </div>

      {undoId && (
        <div className="app-rail pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
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
        fromDailyPrompt={shareFromDaily}
        lockedIdentity={!!user}
        signedIn={!!user}
        onFeelWith={(handle) => onFeelWith(handle, true)}
        onBrowseToday={browseToday}
        onClose={() => {
          setShareOpen(false);
          setShareFromDaily(false);
        }}
        onPublish={publish}
      />

      {user && onboarded === false && (
        <OnboardingWizard
          identityHandle={identityHandle}
          identityAuthor={identityAuthor}
          onPublish={publish}
          onFeelWith={onFeelWith}
          onDone={finishOnboarding}
        />
      )}
    </div>
  );
}

function sameAuthor(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  return a.trim().toLowerCase().replace(/^@/, "") === b.trim().toLowerCase().replace(/^@/, "");
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
