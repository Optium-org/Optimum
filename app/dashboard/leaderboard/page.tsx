"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

interface RowAgg {
  user_id: string;
  total_score: number;
}
interface Profile {
  id: string;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userVerified, setUserVerified] = useState<boolean>(false);

  const [loading, setLoading] = useState(true);
  const [uiError, setUiError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<RowAgg & { profile?: Profile }>>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      setUserId(u?.id || null);
      const meta: any = u?.user_metadata || {};
      const full = [meta.first_name, meta.last_name].filter(Boolean).join(" ") || meta.name || meta.full_name || null;
      setDisplayName(full);
      setAvatarUrl(meta.avatar_url || meta.picture || null);
      setUserVerified(Boolean(meta.verified));
      setLoading(false);
      await loadLeaderboard();
    })();
    return () => { alive = false; };
  }, []);

  async function loadLeaderboard() {
    try {
      // 1) Агрегация по user_id
      const { data: agg, error } = await supabase
        .from("quiz_players")
        .select("user_id, score")
        .not("score", "is", null);
      if (error) throw error;
      const map = new Map<string, number>();
      (agg || []).forEach((r: any) => {
        const uid = r.user_id as string;
        const sc = Number(r.score) || 0;
        map.set(uid, (map.get(uid) || 0) + sc);
      });
      const arr: RowAgg[] = Array.from(map.entries())
        .map(([uid, total]) => ({ user_id: uid, total_score: total }))
        .sort((a, b) => b.total_score - a.total_score)
        .slice(0, 100);

      // 2) Подтянем профили одним запросом
      const ids = arr.map((r) => r.user_id);
      let profiles: Profile[] = [];
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url")
          .in("id", ids);
        profiles = (profs || []) as any;
      }
      const profById = new Map(profiles.map((p) => [p.id, p]));
      setRows(arr.map((r) => ({ ...r, profile: profById.get(r.user_id) })));
    } catch (e) {
      console.error(e);
      setUiError("Не удалось загрузить лидерборд");
      if (typeof window !== 'undefined') {
        window.setTimeout(() => setUiError(null), 4000);
      }
    }
  }

  const linkBase = "flex items-center gap-3 rounded-none px-3 py-2";
  const linkHover = "hover:bg-foreground/10";
  const linkActive = "bg-foreground/10 text-foreground";

  return (
    <main className="min-h-screen w-full">
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] min-h-screen">
        {/* Sidebar */}
        <aside className="sticky top-0 h-screen overflow-y-auto bg-background/90 border-r p-4 lg:p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <Image src="/optimum_logo.png" alt="Optimum" width={80} height={80} />
          </div>

          <nav className="space-y-2 text-sm">
            <a className={`${linkBase} ${pathname === "/dashboard" ? linkHover : linkHover}`} href="/dashboard">
              <Image src="/dashboard/home.png" alt="Главная" width={16} height={16} className="opacity-80" />
              Главная
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/feed" ? linkActive : linkHover}`} href="/dashboard/feed">
              <Image src="/dashboard/feed.png" alt="Лента" width={16} height={16} className="opacity-80" />
              Лента
            </a>
            <a className={`${linkBase} ${pathname?.startsWith("/dashboard/quizzes") ? linkHover : linkHover}`} href="/dashboard/quizzes">
              <Image src="/dashboard/quizzes.png" alt="Квизы" width={16} height={16} className="opacity-80" />
              Квизы
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/friends" ? linkHover : linkHover}`} href="/dashboard/friends">
              <Image src="/dashboard/friends.png" alt="Друзья" width={16} height={16} className="opacity-80" />
              Друзья
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/leaderboard" ? linkActive : linkHover}`} href="/dashboard/leaderboard">
              <Image src="/dashboard/leaderboard.png" alt="Лидерборд" width={16} height={16} className="opacity-80" />
              Лидерборд
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/chats" ? linkHover : linkHover}`} href="/dashboard/chats">
              <Image src="/dashboard/chats.png" alt="Чаты" width={16} height={16} className="opacity-80" />
              Чаты
            </a>
          </nav>

          {/* Профиль снизу */}
          <div className="mt-auto pt-4 border-t">
            <button onClick={() => router.push("/dashboard/profile")} className="w-full flex items-center gap-3 px-3 py-2 rounded-none bg-foreground/10 text-left">
              <div className="h-8 w-8 rounded-full border bg-foreground/10 overflow-hidden" aria-hidden>
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-1.5">
                  <span>{displayName || "Профиль"}</span>
                  {userVerified && (
                    <Image src="/verification/check.png" alt="verified" width={14} height={14} className="opacity-90" />
                  )}
                </div>
              </div>
            </button>
          </div>
        </aside>

        {/* Content */}
        <section className="relative bg-background/80">
          {/* Top bar */}
          <div className="sticky top-0 z-10 border-b px-4 lg:px-8 py-4 flex items-center justify-between bg-background/80 backdrop-blur">
            <div className="text-sm text-foreground/80">Лидерборд</div>
          </div>

          <div className="px-4 lg:px-8 py-8">
            <div className="mx-auto w-full max-w-4xl space-y-6">
              {uiError && (
                <div className="rounded-md border border-red-500 bg-red-500/10 text-red-600 px-3 py-2 text-sm">{uiError}</div>
              )}

              <div className="rounded-lg border bg-background p-5 shadow-sm">
                <div className="text-sm font-medium mb-3">Топ игроков (сумма очков)</div>
                {rows.length === 0 ? (
                  <div className="text-xs text-foreground/60">Пока пусто — сыграйте несколько раундов!</div>
                ) : (
                  <ol className="space-y-2">
                    {rows.map((r, i) => (
                      <li key={r.user_id} className="flex items-center justify-between rounded-md border bg-background/60 px-3 py-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="text-xs w-6 text-right tabular-nums">{i + 1}.</div>
                          <div className="h-8 w-8 rounded-full overflow-hidden border bg-foreground/10 flex-shrink-0">
                            {r.profile?.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.profile.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-[10px] text-foreground/60">👤</div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{r.profile?.full_name || r.profile?.username || r.user_id.slice(0, 6)}</div>
                            {r.profile?.username ? (
                              <div className="text-[11px] text-foreground/60 truncate">@{r.profile.username}</div>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-sm font-semibold tabular-nums">{r.total_score}</div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
