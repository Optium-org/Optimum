"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

// Предполагаем наличие таблицы profiles(id, username, full_name, avatar_url)
// и таблицы friend_requests(id, from_id, to_id, status: 'pending'|'accepted'|'rejected', created_at)

export default function FriendsPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userVerified, setUserVerified] = useState<boolean>(false);

  const [uiError, setUiError] = useState<string | null>(null);
  const [uiSuccess, setUiSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Поиск
  const [query, setQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [results, setResults] = useState<Array<{ id: string; username: string; full_name?: string | null; avatar_url?: string | null }>>([]);

  // Заявки и друзья
  const [incoming, setIncoming] = useState<any[]>([]); // pending, to me
  const [outgoing, setOutgoing] = useState<any[]>([]); // pending, from me
  const [friends, setFriends] = useState<any[]>([]);   // accepted pairs

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const me = data.user;
      if (!me) { router.replace("/login"); return; }
      setUserId(me.id);
      const meta: any = me.user_metadata || {};
      const full = [meta.first_name, meta.last_name].filter(Boolean).join(" ") || meta.name || meta.full_name || null;
      setDisplayName(full);
      setAvatarUrl(meta.avatar_url || meta.picture || null);
      setUserVerified(Boolean(meta.verified));
      setLoading(false);
      await refreshLists(me.id);
      subscribe(me.id);
    })();
    return () => { mounted = false; cleanup(); };
  }, []);

  function reportError(msg: string, err?: unknown) {
    console.error(msg, err);
    setUiError(msg);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setUiError((cur) => (cur === msg ? null : cur)), 4000);
    }
  }
  function reportSuccess(msg: string) {
    setUiSuccess(msg);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setUiSuccess((cur) => (cur === msg ? null : cur)), 3000);
    }
  }

  async function refreshLists(me: string) {
    // incoming pending
    const { data: inc } = await supabase
      .from("friend_requests")
      .select("id, from_id, to_id, status, created_at, profiles_from:from_id(id, username, full_name, avatar_url)")
      .eq("to_id", me)
      .eq("status", "pending");
    setIncoming(inc || []);

    // outgoing pending
    const { data: out } = await supabase
      .from("friend_requests")
      .select("id, from_id, to_id, status, created_at, profiles_to:to_id(id, username, full_name, avatar_url)")
      .eq("from_id", me)
      .eq("status", "pending");
    setOutgoing(out || []);

    // friends accepted (я отправил или мне отправили)
    const { data: acc1 } = await supabase
      .from("friend_requests")
      .select("id, from_id, to_id, status, created_at, profiles_from:from_id(id, username, full_name, avatar_url), profiles_to:to_id(id, username, full_name, avatar_url)")
      .eq("from_id", me)
      .eq("status", "accepted");
    const { data: acc2 } = await supabase
      .from("friend_requests")
      .select("id, from_id, to_id, status, created_at, profiles_from:from_id(id, username, full_name, avatar_url), profiles_to:to_id(id, username, full_name, avatar_url)")
      .eq("to_id", me)
      .eq("status", "accepted");
    const merged = [...(acc1 || []), ...(acc2 || [])];
    setFriends(merged);
  }

  function subscribe(me: string) {
    cleanup();
    const ch = supabase.channel(`friends-${me}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `from_id=eq.${me}` }, () => refreshLists(me))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `to_id=eq.${me}` }, () => refreshLists(me))
      .subscribe();
    channelRef.current = ch;
  }
  function cleanup() {
    try { channelRef.current?.unsubscribe(); } catch {}
    channelRef.current = null;
  }

  // Поиск с дебаунсом по @username
  useEffect(() => {
    let alive = true;
    const q = query.trim();
    if (!userId || !q) { setResults([]); return; }
    const handle = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const raw = q.startsWith('@') ? q.slice(1) : q;
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .ilike('username', `%${raw}%`)
          .limit(10);
        if (!alive) return;
        if (error) { setResults([]); }
        else {
          const arr = (data || []).filter((u: any) => u.id !== userId);
          setResults(arr as any);
        }
      } finally {
        if (alive) setSearchLoading(false);
      }
    }, 250);
    return () => { alive = false; clearTimeout(handle); };
  }, [query, userId]);

  async function sendRequest(toId: string) {
    if (!userId || userId === toId) return;
    // Проверим, нет ли уже заявки
    const { data: existing } = await supabase
      .from('friend_requests')
      .select('id, status, from_id, to_id')
      .or(`and(from_id.eq.${userId},to_id.eq.${toId}),and(from_id.eq.${toId},to_id.eq.${userId})`)
      .limit(1);
    if (existing && existing.length > 0) {
      reportError('Заявка уже существует или вы уже друзья');
      return;
    }
    const { error } = await supabase
      .from('friend_requests')
      .insert({ from_id: userId, to_id: toId, status: 'pending' });
    if (error) return reportError('Не удалось отправить заявку', error);
    reportSuccess('Заявка отправлена');
    await refreshLists(userId);
  }

  async function acceptRequest(reqId: string) {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', reqId);
    if (error) return reportError('Не удалось принять заявку', error);
    reportSuccess('Заявка принята');
    if (userId) await refreshLists(userId);
  }

  async function declineRequest(reqId: string) {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'rejected' })
      .eq('id', reqId);
    if (error) return reportError('Не удалось отклонить заявку', error);
    reportSuccess('Заявка отклонена');
    if (userId) await refreshLists(userId);
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
            <a className={`${linkBase} ${pathname === "/dashboard" ? linkHover : linkHover}`} href="/dashboard/feed">
              <Image src="/dashboard/feed.png" alt="Главная" width={16} height={16} className="opacity-80" />
              Лента
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/quizzes" ? linkHover : linkHover}`} href="/dashboard/quizzes">
              <Image src="/dashboard/quizzes.png" alt="Квизы" width={16} height={16} className="opacity-80" />
              Квизы
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/friends" ? linkActive : linkHover}`} href="/dashboard/friends">
              <Image src="/dashboard/friends.png" alt="Друзья" width={16} height={16} className="opacity-80" />
              Друзья
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/chats" ? linkActive : linkHover}`} href="/dashboard/chats">
              <Image src="/dashboard/chats.png" alt="Друзья" width={16} height={16} className="opacity-80" />
              Чаты
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/subscription" ? linkActive : linkHover}`} href="/dashboard/subscription">
              <Image src="/dashboard/subscription.png" alt="Подписка" width={16} height={16} className="opacity-80" />
              Premium
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
                </div>
              </div>
            </button>
          </div>
        </aside>

        {/* Content */}
        <section className="relative bg-background/80">
          {/* Top bar */}
          <div className="sticky top-0 z-10 border-b px-4 lg:px-8 py-4 flex items-center justify-between bg-background/80 backdrop-blur">
            <div className="text-sm text-foreground/80">Друзья</div>
          </div>

          <div className="px-4 lg:px-8 py-8">
            <div className="mx-auto w-full max-w-4xl space-y-6">
              {uiError && (
                <div className="rounded-md border border-red-500 bg-red-500/10 text-red-600 px-3 py-2 text-sm">{uiError}</div>
              )}
              {uiSuccess && (
                <div className="rounded-md border border-green-500 bg-green-500/10 text-green-700 px-3 py-2 text-sm">{uiSuccess}</div>
              )}

              {/* Поиск */}
              <div className="rounded-lg border bg-background p-5 shadow-sm">
                <div className="text-sm font-medium mb-2">Найти друзей</div>
                <input
                  value={query}
                  onChange={(e)=>setQuery(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="@username"
                />
                <div className="mt-3">
                  {searchLoading ? (
                    <div className="text-xs text-foreground/60">Ищем…</div>
                  ) : results.length === 0 ? (
                    <div className="text-xs text-foreground/60">Никого не нашли</div>
                  ) : (
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {results.map(u => (
                        <li key={u.id} className="rounded-md border bg-background px-3 py-2 text-sm flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-7 w-7 rounded-full overflow-hidden border bg-foreground/10 flex-shrink-0">
                              {u.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={u.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-[10px] text-foreground/60">👤</div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate">@{u.username}</div>
                              {u.full_name ? <div className="text-xs text-foreground/60 truncate">{u.full_name}</div> : null}
                            </div>
                          </div>
                          <button onClick={() => sendRequest(u.id)} className="rounded-md border px-3 py-2 text-xs hover:bg-foreground/10">Добавить</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Входящие заявки */}
              <div className="rounded-lg border bg-background p-5 shadow-sm">
                <div className="text-sm font-medium mb-2">Входящие заявки</div>
                {incoming.length === 0 ? (
                  <div className="text-xs text-foreground/60">Нет входящих заявок</div>
                ) : (
                  <ul className="space-y-2">
                    {incoming.map((r: any) => (
                      <li key={r.id} className="rounded-md border bg-background px-3 py-2 text-sm flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-7 w-7 rounded-full overflow-hidden border bg-foreground/10 flex-shrink-0">
                            {r.profiles_from?.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.profiles_from.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-[10px] text-foreground/60">👤</div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate">@{r.profiles_from?.username || r.from_id}</div>
                            {r.profiles_from?.full_name ? <div className="text-xs text-foreground/60 truncate">{r.profiles_from.full_name}</div> : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => acceptRequest(r.id)} className="rounded-md border px-3 py-2 text-xs bg-foreground text-background hover:opacity-90">Принять</button>
                          <button onClick={() => declineRequest(r.id)} className="rounded-md border px-3 py-2 text-xs hover:bg-foreground/10">Отклонить</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Исходящие заявки */}
              <div className="rounded-lg border bg-background p-5 shadow-sm">
                <div className="text-sm font-medium mb-2">Исходящие заявки</div>
                {outgoing.length === 0 ? (
                  <div className="text-xs text-foreground/60">Нет исходящих заявок</div>
                ) : (
                  <ul className="space-y-2">
                    {outgoing.map((r: any) => (
                      <li key={r.id} className="rounded-md border bg-background px-3 py-2 text-sm flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-7 w-7 rounded-full overflow-hidden border bg-foreground/10 flex-shrink-0">
                            {r.profiles_to?.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.profiles_to.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-[10px] text-foreground/60">👤</div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate">@{r.profiles_to?.username || r.to_id}</div>
                            {r.profiles_to?.full_name ? <div className="text-xs text-foreground/60 truncate">{r.profiles_to.full_name}</div> : null}
                          </div>
                        </div>
                        <div className="text-[11px] text-foreground/60">Ожидает подтверждения</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Друзья */}
              <div className="rounded-lg border bg-background p-5 shadow-sm">
                <div className="text-sm font-medium mb-2">Список друзей</div>
                {friends.length === 0 ? (
                  <div className="text-xs text-foreground/60">Пока нет друзей</div>
                ) : (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {friends.map((r: any) => {
                      const other = r.from_id === userId ? r.profiles_to : r.profiles_from;
                      return (
                        <li key={r.id} className="rounded-md border bg-background px-3 py-2 text-sm flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-7 w-7 rounded-full overflow-hidden border bg-foreground/10 flex-shrink-0">
                              {other?.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={other.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-[10px] text-foreground/60">👤</div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate">@{other?.username}</div>
                              {other?.full_name ? <div className="text-xs text-foreground/60 truncate">{other.full_name}</div> : null}
                            </div>
                          </div>
                          <button onClick={() => router.push(`/dashboard/chats?to=${other?.id}`)} className="rounded-md border px-3 py-2 text-xs hover:bg-foreground/10">Написать</button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
