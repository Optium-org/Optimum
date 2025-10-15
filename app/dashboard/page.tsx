"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  // Классы для ссылок сайдбара (должны быть определены до использования ниже)
  const linkBase = "flex items-center gap-3 rounded-none px-3 py-2";
  const linkHover = "hover:bg-foreground/10";
  const linkActive = "bg-foreground/10 text-foreground";
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [userVerified, setUserVerified] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [dateParam, setDateParam] = useState<string | null>(null); // YYYY-MM-DD из URL
  // telegram prefs
  const [prefTgEnabled, setPrefTgEnabled] = useState<boolean>(false);
  const [prefTgChatId, setPrefTgChatId] = useState<string>("");
  // status filter
  type StatusFilter = "all" | "active" | "done";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // --- Лента постов ---
  type Post = {
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    author_name?: string | null;
    author_avatar?: string | null;
    author_verified?: boolean | null;
    author_role?: string | null;
    likes_count?: number | null;
    media_urls?: string[] | null;
  };
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [newPost, setNewPost] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());
  // Пагинация
  const pageSize = 20;
  const [feedCursor, setFeedCursor] = useState<string | null>(null); // created_at последнего поста
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isFetchingRef = useRef(false);
  // Таймеры для возможных отложенных операций (очищаются в cleanup)
  const timersRef = useRef<number[]>([]);
  // Изображения для нового поста
  const [uploading, setUploading] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<string[]>([]); // публичные URL загруженных картинок
  // Реплаи (комментарии)
  type Reply = { id: string; post_id: string; user_id: string; content: string; created_at: string; author_name?: string|null; author_avatar?: string|null; author_verified?: boolean|null };
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const [repliesLoading, setRepliesLoading] = useState<Record<string, boolean>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyPosting, setReplyPosting] = useState<Record<string, boolean>>({});
  // UI ошибки
  const [uiError, setUiError] = useState<string | null>(null);
  const [likeBusy, setLikeBusy] = useState<Set<string>>(new Set());
  // UI успехи
  const [uiSuccess, setUiSuccess] = useState<string | null>(null);
  const reportError = (msg: string, err?: unknown) => {
    if (typeof window !== 'undefined' && err) {
      const details = (err as any)?.message || (err as any)?.hint || (err as any)?.code || err;
      console.error(msg, details);
    }
    setUiError(msg);
    // авто-сокрытие через 6 секунд
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setUiError((cur) => (cur === msg ? null : cur)), 6000);
    }
  };
  const reportSuccess = (msg: string) => {
    setUiSuccess(msg);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setUiSuccess((cur) => (cur === msg ? null : cur)), 4000);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setEmail(data.user.email);
      setUserId(data.user.id);
      const meta = data.user.user_metadata || {};
      const full = [meta.first_name, meta.last_name].filter(Boolean).join(" ") || meta.name || meta.full_name || null;
      setDisplayName(full);
      setUserAvatarUrl(meta.avatar_url || meta.picture || null);
      setUserVerified(Boolean(meta.verified));
      setUserRole(meta.role || meta.position || meta.title || null);
      setPrefTgEnabled(!!meta.pref_tg_enabled);
      setPrefTgChatId(meta.pref_tg_chat_id || "");
      setLoading(false);
      // загрузим общую ленту (все посты) и лайки пользователя
      await loadPosts(true);
      await loadUserLikes(data.user.id);
      // читать ?date из window.location.search
      try {
        const sp = new URLSearchParams(window.location.search);
        const d = sp.get("date");
        if (d) {
          setDateParam(d);
          setFilter("date");
        }
      } catch {}
    })();

    // инициализация звука завершения (оставлено на будущее)
    try {
      doneAudio.current = typeof Audio !== 'undefined' ? new Audio('/sounds/done.mp3') : null;
      if (doneAudio.current) { doneAudio.current.volume = 0.8; try { doneAudio.current.preload = 'auto'; doneAudio.current.load(); } catch {} }
    } catch {}

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) router.replace("/login");
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      // clear timers
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    };
  }, [router]);

  // Загрузка общей ленты постов (все посты)
  async function loadPosts(initial = false) {
    if (initial) {
      setPosts([]);
      setFeedCursor(null);
      setHasMore(true);
    }
    if (!hasMore && !initial) return;
    if (isFetchingRef.current && !initial) return; // защита от параллельных запросов
    setPostsLoading(true);
    isFetchingRef.current = true;
    let q = supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(pageSize);
    if (feedCursor) q = q.lt('created_at', feedCursor);
    try {
      const { data, error } = await q;
      if (error) throw error;
      if (data) {
        // визуальный фолбек: если это наши посты и author_* пустые, подставим локальные значения для отображения
        const batch = (data as Post[]).map((p) => {
          if (p.user_id === userId) {
            return {
              ...p,
              author_name: p.author_name ?? (displayName || p.author_name),
              author_avatar: p.author_avatar ?? (userAvatarUrl || p.author_avatar),
              author_verified: typeof p.author_verified === 'boolean' ? p.author_verified : userVerified,
              author_role: p.author_role ?? userRole ?? p.author_role,
            };
          }
          return p;
        });
        setPosts(prev => {
          const merged = initial ? batch : [...prev, ...batch];
          return dedupePosts(merged);
        });
        setHasMore(batch.length === pageSize);
        if (batch.length > 0) setFeedCursor(batch[batch.length-1].created_at);
      }
    } catch (err) {
      reportError('Не удалось загрузить ленту', err);
    }
    setPostsLoading(false);
    isFetchingRef.current = false;
  }

  // Утилита: дедупликация по id с сохранением порядка
  function dedupePosts(list: Post[]): Post[] {
    const seen = new Set<string>();
    const out: Post[] = [];
    for (const p of list) {
      if (!p?.id) continue;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }

  // Лайки текущего пользователя (множество post_id)
  async function loadUserLikes(uid: string) {
    try {
      const { data, error } = await supabase
        .from('posts_likes')
        .select('post_id')
        .eq('user_id', uid);
      if (error) throw error;
      if (data) setUserLikes(new Set(data.map((x: any) => x.post_id)));
    } catch {}
  }

  async function addPost() {
    if (!userId) return;
    const content = newPost.trim();
    if (!content) return;
    setPublishing(true);
    try {
      const payloadFull: any = {
        user_id: userId,
        content,
        author_name: displayName,
        author_avatar: userAvatarUrl,
        author_verified: userVerified,
        author_role: userRole,
        media_urls: pendingMedia,
      };
      // 1) пробуем полную вставку
      let ins = await supabase.from("posts").insert(payloadFull).select('id').single();
      let error = ins.error;
      if (error) {
        const msg = (error as any)?.message || '';
        // 2) при любой ошибке структуры/кэша схемы — пробуем минимальный payload
        if (
          /column .* does not exist/i.test(msg) ||
          /missing column/i.test(msg) ||
          /schema cache/i.test(msg)
        ) {
          const minimal = { user_id: userId, content } as any;
          const retry = await supabase.from("posts").insert(minimal).select('id').single();
          if (retry.error) throw retry.error;
          // 3) best-effort: обновим только что созданную запись author_* полями, если колонки уже добавлены
          try {
            const pid = (retry.data as any)?.id;
            if (pid) {
              await supabase.from('posts').update({
                author_name: displayName,
                author_avatar: userAvatarUrl,
                author_verified: userVerified,
                author_role: userRole,
                media_urls: pendingMedia,
              } as any).eq('id', pid);
            }
          } catch {}
        } else {
          throw error;
        }
      }
      setNewPost("");
      setPendingMedia([]);
      reportSuccess('Пост опубликован');
    } catch (err) {
      reportError('Не удалось опубликовать пост', err);
    } finally {
      setPublishing(false);
    }
  }

  async function onSelectImages(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      if (!userId) return;
      const files = e.target.files; if (!files || files.length === 0) return;
      setUploading(true);
      const bucket = supabase.storage.from('posts');
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const uuid = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
          ? globalThis.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const key = `${userId}/${uuid}-${file.name}`;
        const { error: upErr } = await bucket.upload(key, file, { upsert: false, contentType: file.type });
        if (!upErr) {
          const { data } = bucket.getPublicUrl(key);
          if (data?.publicUrl) uploaded.push(data.publicUrl);
        }
      }
      setPendingMedia(prev => [...prev, ...uploaded]);
    } catch (err) {
      reportError('Не удалось загрузить изображения', err);
    } finally { setUploading(false); e.target.value = ''; }
  }

  function removePendingMedia(url: string) {
    setPendingMedia(prev => prev.filter(u => u !== url));
  }

  async function toggleLike(postId: string) {
    if (!userId) return;
    const liked = userLikes.has(postId);
    if (likeBusy.has(postId)) return; // защита от двойного клика
    setLikeBusy((prev) => new Set(prev).add(postId));
    try {
      if (liked) {
        const { error } = await supabase.from('posts_likes').delete().eq('post_id', postId).eq('user_id', userId);
        if (error) throw error;
        reportSuccess('Лайк снят');
      } else {
        const { error } = await supabase.from('posts_likes').insert({ post_id: postId, user_id: userId } as any);
        if (error) throw error;
        reportSuccess('Лайк сохранён');
      }
      // обновим локально set, posts подтянутся realtime/триггерами
      await loadUserLikes(userId);
    } catch (err: any) {
      // Идемпотентность: если запись уже существует, не считаем это ошибкой UI
      const msg = err?.message || "";
      const code = err?.code || "";
      if (code === '23505' || /duplicate key/i.test(msg)) {
        await loadUserLikes(userId);
        return;
      }
      reportError('Не удалось изменить лайк', err);
    } finally {
      setLikeBusy((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  }

  // Загрузка реплаев к посту
  async function loadReplies(postId: string) {
    setRepliesLoading(prev => ({ ...prev, [postId]: true }));
    try {
      const { data, error } = await supabase
        .from('posts_replies')
        .select('id,post_id,user_id,content,created_at,author_name,author_avatar,author_verified')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      if (data) setReplies(prev => ({ ...prev, [postId]: data as Reply[] }));
    } catch (err) {
      reportError('Не удалось загрузить комментарии', err);
    } finally {
      setRepliesLoading(prev => ({ ...prev, [postId]: false }));
    }
  }

  async function addReply(postId: string) {
    if (!userId) return;
    const text = (replyDrafts[postId] || '').trim();
    if (!text) return;
    setReplyPosting(prev => ({ ...prev, [postId]: true }));
    try {
      const { error } = await supabase.from('posts_replies').insert({
        post_id: postId,
        user_id: userId,
        content: text,
        author_name: displayName,
        author_avatar: userAvatarUrl,
        author_verified: userVerified,
      } as any);
      if (error) throw error;
      setReplyDrafts(prev => ({ ...prev, [postId]: '' }));
      reportSuccess('Комментарий опубликован');
      // сам реплай добавится в список через realtime INSERT
    } catch (err) {
      reportError('Не удалось отправить комментарий', err);
    } finally {
      setReplyPosting(prev => ({ ...prev, [postId]: false }));
    }
  }

  // Realtime: изменения постов и лайков
  useEffect(() => {
    const ch = supabase
      .channel('posts-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, (payload) => {
        const type = (payload as any).eventType as 'INSERT'|'UPDATE'|'DELETE';
        const newRow = (payload as any).new as Post | null;
        const oldRow = (payload as any).old as Post | null;
        setPosts((prev) => {
          if (type === 'INSERT' && newRow) {
            // prepend и дедуп
            return dedupePosts([newRow, ...prev]);
          }
          if (type === 'UPDATE' && newRow) {
            return prev.map(p => p.id === newRow.id ? { ...p, ...newRow } : p);
          }
          if (type === 'DELETE' && oldRow) {
            return prev.filter(p => p.id !== oldRow.id);
          }
          return prev;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts_likes' }, () => {
        // только синхронизируем набор лайков пользователя, посты приходят как UPDATE через триггер
        if (userId) loadUserLikes(userId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts_replies' }, (payload) => {
        const pid = (payload.new as any)?.post_id || (payload.old as any)?.post_id;
        if (!pid) return;
        // точечное обновление, если уже открыт список реплаев
        setReplies((prev) => {
          const list = prev[pid];
          if (!list) return prev; // не загружены — не трогаем
          if (type === 'INSERT' && payload.new) {
            return { ...prev, [pid]: [...list, payload.new as any] };
          }
          if (type === 'UPDATE' && payload.new) {
            return { ...prev, [pid]: list.map(r => r.id === (payload.new as any).id ? (payload.new as any) : r) };
          }
          if (type === 'DELETE' && payload.old) {
            return { ...prev, [pid]: list.filter(r => r.id !== (payload.old as any).id) };
          }
          return prev;
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId]);

  // Автодозагрузка при скролле: IntersectionObserver на sentinel
  useEffect(()=>{
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver((entries)=>{
      const e = entries[0];
      if (e.isIntersecting) loadPosts(false);
    }, { rootMargin: '200px' });
    io.observe(el);
    return ()=>io.disconnect();
  }, [sentinelRef.current, feedCursor, hasMore]);

  function timeAgo(iso: string) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return "только что";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} мин назад`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs} ч назад`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days} дн назад`;
    return new Date(iso).toLocaleString("ru-RU");
  }

  return (
    <main className="min-h-screen w-full">
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] min-h-screen">
        {/* Sidebar */}
        <aside className="sticky top-0 h-screen overflow-y-auto bg-background/90 border-r p-4 lg:p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <Image src="/optimum_logo.png" alt="Optimum" width={80} height={80} />
          </div>

          <nav className="space-y-2 text-sm">
            <a className={`${linkBase} ${pathname === "/dashboard" ? linkActive : linkHover} text-foreground`} href="/dashboard">
              <Image src="/dashboard/home.png" alt="Главная" width={16} height={16} className="opacity-80" />
              Главная
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/feed" ? linkActive : linkHover} text-foreground`} href="/dashboard/feed">
              <Image src="/dashboard/feed.png" alt="Лента" width={16} height={16} className="opacity-80" />
              Лента
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/quizzes" ? linkActive : linkHover}`} href="/dashboard/quizzes">
              <Image src="/dashboard/quizzes.png" alt="Квизы" width={16} height={16} className="opacity-80" />
              Квизы
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/friends" ? linkActive : linkHover}`} href="/dashboard/friends">
              <Image src="/dashboard/friends.png" alt="Друзья" width={16} height={16} className="opacity-80" />
              Друзья
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/leaderboard" ? linkActive : linkHover}`} href="/dashboard/leaderboard">
              <Image src="/dashboard/friends.png" alt="Лидерборд" width={16} height={16} className="opacity-80" />
              Лидерборд
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/chats" ? linkActive : linkHover}`} href="/dashboard/chats">
              <Image src="/dashboard/chats.png" alt="Чаты" width={16} height={16} className="opacity-80" />
              Чаты
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/subscription" ? linkActive : linkHover}`} href="/dashboard/subscription">
              <Image src="/dashboard/subscription.png" alt="Подписка" width={16} height={16} className="opacity-80" />
              Premium
            </a>
          </nav>


          <div className="mt-auto pt-4 border-t">
            <button
              onClick={() => router.push("/dashboard/profile")}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-none hover:bg-foreground/10 text-left"
            >
              <div className="h-8 w-8 rounded-full border bg-foreground/10 overflow-hidden" aria-hidden>
                {userAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={userAvatarUrl} alt="avatar" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{displayName || "Профиль"}</div>
                <div className="text-xs text-foreground/60 truncate">{email}</div>
              </div>
            </button>
          </div>
        </aside>

        {/* Content */}
        <section className="relative bg-background/80">
          {/* Top bar */}
          <div className="sticky top-0 z-10 border-b px-4 lg:px-8 py-4 flex items-center justify-between bg-background/80 backdrop-blur">
            <div className="text-sm text-foreground/80">Главная</div>
            <div className="flex items-center gap-3">
              <a className={`${linkBase} ${linkHover}`} href="#">
                <Image src="/dashboard/calendar.png" alt="Календарь" width={16} height={16} className="opacity-80" />
              </a>
              <a className={`${linkBase} ${linkHover}`} href="#">
                <Image src="/dashboard/task.png" alt="Задания" width={16} height={16} className="opacity-80" />
              </a>
              <a className={`${linkBase} ${linkHover}`} href="#">
                <Image src="/dashboard/subscription.png" alt="Подписка" width={16} height={16} className="opacity-80" />
              </a>
              <a className={`${linkBase} ${linkHover}`} href="#">
                <Image src="/dashboard/historic.png" alt="История" width={16} height={16} className="opacity-80" />
              </a>
            </div>
          </div>

          {/* Center content */}
          <div className="px-4 lg:px-8 py-8">
            <div className="mx-auto w-full max-w-4xl space-y-6">
              {/* Логотип и приветствие */}
              <div className="rounded-lg bg-background p-6 shadow-sm text-center">
                <div className="flex items-center justify-center mb-3">
                  <Image src="/icons/logo-dark.png" alt="Optimum" width={60} height={60} />
                </div>
                <div className="text-3xl font-semibold">Добро пожаловать{displayName ? ", " : ""}{displayName || ""}!</div>
                <div className="text-lg text-foreground/60 mt-1">Рады видеть вас в Optimum</div>
              </div>

              {/* Баннеры 2x2 (конфигурация) */}
              {(() => {
                const bannerCards = [
                  { title: 'AI Quizzes', href: '/dashboard/quizes', imageSrc: '/banners/ai-banner.png', description: 'Генерируй и проходи квизы на базе ИИ' },
                  { title: 'Квизы',      href: '/dashboard/quizzes', imageSrc: '/banners/feed_banner.png', description: 'Делись своими впечатлениями и результатами викторин' },
                  { title: 'Лобби',      href: '/dashboard/lobby',   imageSrc: '/banners/Lobby_banner.png', description: 'Создавай комнаты и приглашай друзей' },
                  { title: 'Чаты',       href: '/dashboard/chats',   imageSrc: '/banners/chats_banner.png', description: 'Общайся и делись впечатлениями' },
                ];
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {bannerCards.map((b, idx) => (
                      <div key={`${b.title}-${idx}`} className="flex flex-col gap-2">
                        <a
                          href={b.href}
                          className="group relative flex flex-col rounded-lg border overflow-hidden bg-background/10 hover:bg-foreground/5 transition-colors"
                        >
                          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-foreground/20 via-foreground/60 to-foreground/20 opacity-70" />
                          <div className="relative w-full aspect-[16/9]">
                            <img src={b.imageSrc} alt={b.title} className="absolute inset-0 w-full h-full object-cover" />
                          </div>
                          {/* Оверлей с заголовком и кнопкой, виден при наведении */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end">
                            <div className="w-full p-4 flex items-center justify-between gap-3">
                              <div className="text-sm sm:text-base font-medium text-white drop-shadow">{b.title}</div>
                              <span className="rounded-none border border-white/70 bg-white/10 text-white text-xs px-3 py-1 hover:bg-white/20 transition">Перейти</span>
                            </div>
                          </div>
                        </a>
                        <div className="px-1 text-[12px] leading-5 text-foreground/70">
                          {b.description}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
