"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export default function ProfilePage() {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [userVerified, setUserVerified] = useState(false);
  const [bio, setBio] = useState<string>("");
  const [website, setWebsite] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error) toast.error(error.message);
      if (!data.user) { router.replace("/login"); return; }
      const meta = data.user.user_metadata || {};
      const full = [meta.first_name, meta.last_name].filter(Boolean).join(" ") || meta.name || meta.full_name || null;
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('username, display_name, avatar_url, verified')
          .eq('id', data.user.id)
          .maybeSingle();
        if (prof) {
          if (prof.display_name) setDisplayName(prof.display_name as string);
          if (prof.avatar_url) setAvatarUrl(prof.avatar_url as string);
          // Галочка показывается, если verified=true либо в profiles, либо в user_metadata (как раньше)
          setUserVerified(Boolean((prof as any)?.verified || meta.verified));
          if (prof.username) setUsername(prof.username as string);
        } else {
          setDisplayName(full);
          setAvatarUrl(meta.avatar_url || meta.picture || null);
          setUserVerified(Boolean(meta.verified));
        }
      } catch {}
      setBio(meta.bio || "");
      setWebsite(meta.website || "");
      setEmail(data.user.email);
      setLoading(false);
    })();

    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => { mounted = false; clearInterval(t); };
  }, [router]);

  const timeLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(now);
    } catch { return now.toLocaleString(); }
  }, [now]);

  if (loading) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center">
        <div className="text-sm text-foreground/70">Загрузка…</div>
      </main>
    );
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
            <a className={`${linkBase} ${pathname === "/dashboard" ? linkActive : linkHover}`} href="/dashboard">
              <Image src="/dashboard/home.png" alt="Главная" width={16} height={16} className="opacity-80" />
              Главная
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/history" ? linkActive : linkHover}`} href="/dashboard/feed">
              <Image src="/dashboard/feed.png" alt="История" width={16} height={16} className="opacity-80" />
              История
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/quizzes" ? linkActive : linkHover}`} href="/dashboard/quizzes">
              <Image src="/dashboard/quizzes.png" alt="Календарь" width={16} height={16} className="opacity-80" />
              Квизы
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/friends" ? linkActive : linkHover}`} href="/dashboard/friends">
              <Image src="/dashboard/friends.png" alt="Календарь" width={16} height={16} className="opacity-80" />
              Друзья
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/chats" ? linkActive : linkHover}`} href="/dashboard/chats">
              <Image src="/dashboard/chats.png" alt="Календарь" width={16} height={16} className="opacity-80" />
              Чаты
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/subscription" ? linkActive : linkHover}`} href="/dashboard/subscription">
              <Image src="/dashboard/subscription.png" alt="Подписка" width={16} height={16} className="opacity-80" />
              Premium
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/profile/settings" ? linkActive : linkHover}`} href="/dashboard/profile/settings">
              <Image src="/dashboard/subscription.png" alt="Настройки" width={16} height={16} className="opacity-80" />
              Настройки
            </a>
          </nav>

          {/* Профиль снизу (активный) */}
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
                <div className="text-xs text-foreground/60 truncate">{email}</div>
                {username && (
                  <div className="text-[11px] text-foreground/60 truncate">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`@${username}`); toast.success('Скопировано: @' + username); }}
                      className="hover:underline"
                      title="Скопировать @username"
                    >
                      @{username}
                    </button>
                    <a
                      href={`/u/${username}`}
                      onClick={(e) => e.stopPropagation()}
                      className="ml-2 hover:underline"
                      title="Открыть публичный профиль"
                    >
                      Профиль
                    </a>
                  </div>
                )}
              </div>
            </button>
          </div>
        </aside>

        {/* Content */}
        <section className="relative bg-background/80">
          {/* Top bar */}
          <div className="sticky top-0 z-10 border-b px-4 lg:px-8 py-4 flex items-center justify-between bg-background/80 backdrop-blur">
            <div className="text-sm text-foreground/80 flex items-center gap-1.5">
              <span>Профиль</span>
              {userVerified && (
                <Image src="/verification/check.png" alt="verified" width={14} height={14} className="opacity-90" />
              )}
            </div>
            <div className="text-xs sm:text-sm text-foreground/70">{timeLabel}</div>
          </div>

          {/* Full-width hero */}
          <div className="w-full border-b bg-background/10">
            <div className="h-24 sm:h-32 bg-gradient-to-r from-foreground/15 via-foreground/35 to-foreground/15" />
            <div className="px-4 lg:px-8 py-4">
              <div className="flex items-start gap-4 sm:gap-6">
                <div className="-mt-12 sm:-mt-16 h-20 w-20 sm:h-24 sm:w-24 rounded-full border bg-background overflow-hidden flex-shrink-0">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-foreground/10" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-lg sm:text-xl font-semibold truncate flex items-center gap-2">
                      <span>{displayName || 'Ваш профиль'}</span>
                      {userVerified && (
                        <Image src="/verification/check.png" alt="verified" width={16} height={16} className="opacity-90" />
                      )}
                      {username && (
                        <button
                          type="button"
                          onClick={() => { navigator.clipboard.writeText(`@${username}`); toast.success('Скопировано: @' + username); }}
                          title="Скопировать @username"
                          className="text-xs font-normal text-foreground/60 font-mono truncate hover:underline"
                        >
                          @{username}
                        </button>
                      )}
                    </div>
                    <span className="text-[10px] px-1.5 py-[2px] rounded-none border bg-background/60 text-foreground/80">CEO</span>
                  </div>
                  <div className="mt-2 text-xs text-foreground/70 whitespace-pre-wrap">
                    {email}
                  </div>
                  {username && (
                    <div className="mt-1 text-xs text-foreground/60 truncate">
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(`@${username}`); toast.success('Скопировано: @' + username); }}
                        className="underline underline-offset-2 hover:opacity-80"
                        title="Скопировать @username"
                      >
                        @{username}
                      </button>
                      <a
                        href={`/u/${username}`}
                        className="ml-2 hover:underline"
                        title="Открыть публичный профиль"
                      >
                        Профиль
                      </a>
                    </div>
                  )}
                  {bio && (
                    <div className="mt-2 text-xs text-foreground/80 whitespace-pre-wrap">{bio}</div>
                  )}
                  {website && (
                    <div className="mt-2 text-xs">
                      <a href={website} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:opacity-80 truncate inline-block max-w-full">{website}</a>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <a href="/dashboard/profile/settings" className="rounded-none border px-3 py-2 text-xs hover:bg-foreground/10 whitespace-nowrap">Открыть настройки</a>
                </div>
              </div>
            </div>
          </div>

          {/* Body under hero (минимальный контент, CTA на настройки) */}
          <div className="px-4 lg:px-8 py-8">
            <div className="mx-auto max-w-4xl space-y-6">
              <div className="rounded-none border bg-background/10 p-5">
                <div className="text-sm font-medium mb-2">Быстрые действия</div>
                <div className="text-xs text-foreground/70">Большинство параметров переехали в раздел «Настройки».</div>
                <div className="mt-3">
                  <a href="/dashboard/profile/settings" className="rounded-none border px-3 py-2 text-xs hover:bg-foreground/10">Перейти в настройки профиля</a>
                </div>
              </div>

              {/* Username: @username */}
              <div className="rounded-none border bg-background/10 p-5">
                <div className="text-sm font-medium mb-2">Юзернейм</div>
                <div className="text-xs text-foreground/70 mb-3">Укажите публичное имя в формате @username (латиница, цифры и подчёркивания, 3–32 символа). По нему вас смогут найти в чатах.</div>
                <form
                  onSubmit={async (e)=>{
                    e.preventDefault();
                    setUsernameError(null);
                    const raw = (username||'').trim();
                    const cleaned = raw.startsWith('@') ? raw.slice(1) : raw;
                    if (!/^[A-Za-z0-9_]{3,32}$/.test(cleaned)) { setUsernameError('Допустимы латиница, цифры и подчёркивания, 3–32 символа'); return; }
                    setUsernameBusy(true);
                    try {
                      const { data: u } = await supabase.auth.getUser();
                      if (!u.user) throw new Error('Нет сессии');
                      // проверим уникальность (case-insensitive)
                      const { data: exists } = await supabase
                        .from('profiles')
                        .select('id')
                        .neq('id', u.user.id)
                        .ilike('username', cleaned);
                      if (exists && exists.length>0) { setUsernameError('Юзернейм уже занят'); setUsernameBusy(false); return; }
                      // upsert в profiles
                      await supabase.from('profiles').upsert({ id: u.user.id, username: cleaned }, { onConflict: 'id' });
                      // сохраним также в user_metadata для удобства
                      await supabase.auth.updateUser({ data: { username: cleaned } });
                      setUsername(cleaned);
                      toast.success('Юзернейм сохранён');
                    } catch (err:any) {
                      setUsernameError(err?.message || 'Не удалось сохранить');
                    }
                    setUsernameBusy(false);
                  }}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center"
                >
                  <div className="flex-1 flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                    <span className="text-foreground/60">@</span>
                    <input
                      value={username?.startsWith('@')? username.slice(1) : (username||'')}
                      onChange={(e)=>setUsername(e.target.value.startsWith('@')? e.target.value.slice(1): e.target.value)}
                      placeholder="username"
                      className="flex-1 bg-transparent outline-none text-sm"
                    />
                  </div>
                  <button disabled={usernameBusy} className="rounded-none border px-3 py-2 text-xs hover:bg-foreground/10 disabled:opacity-60">Сохранить</button>
                </form>
                {usernameError && <div className="mt-2 text-[12px] text-red-500">{usernameError}</div>}
                {username && <div className="mt-2 text-[12px] text-foreground/70">Ваш публичный адрес: <span className="font-mono">@{username}</span></div>}
              </div>
            </div>
          </div>

          {/* Bottom bar (оставим как в макете) */}
          <div className="sticky bottom-0 px-4 lg:px-8 pb-6">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-center gap-3 rounded-xl border bg-foreground/10 px-4 py-3">
                <input className="flex-1 bg-transparent outline-none text-xs sm:text-sm placeholder:text-foreground/60" placeholder="Здесь позже появится поиск по настройкам…" />
                <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
                  <span className="block h-3 w-3 bg-background" style={{ clipPath: "polygon(0 100%, 100% 50%, 0 0)" }} />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
