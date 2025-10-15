"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

export default function FeedPage() {
  const router = useRouter();
  const pathname = usePathname();
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
  // Изображения для нового поста
  const [uploading, setUploading] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<string[]>([]);
  // Реплаи (комментарии)
  type Reply = { id: string; post_id: string; user_id: string; content: string; created_at: string; author_name?: string|null; author_avatar?: string|null; author_verified?: boolean|null };
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const [repliesLoading, setRepliesLoading] = useState<Record<string, boolean>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyPosting, setReplyPosting] = useState<Record<string, boolean>>({});
  // UI
  const [uiError, setUiError] = useState<string | null>(null);
  const [uiSuccess, setUiSuccess] = useState<string | null>(null);
  const [likeBusy, setLikeBusy] = useState<Set<string>>(new Set());

  const reportError = (msg: string, err?: unknown) => {
    if (typeof window !== 'undefined' && err) {
      const details = (err as any)?.message || (err as any)?.hint || (err as any)?.code || err;
      console.error(msg, details);
    }
    setUiError(msg);
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
      if (!data.user) { router.replace("/login"); return; }
      setEmail(data.user.email);
      setUserId(data.user.id);
      const meta = data.user.user_metadata || {};
      const full = [meta.first_name, meta.last_name].filter(Boolean).join(" ") || meta.name || meta.full_name || null;
      setDisplayName(full);
      setUserAvatarUrl(meta.avatar_url || meta.picture || null);
      setUserVerified(Boolean(meta.verified));
      setUserRole(meta.role || meta.position || meta.title || null);
      setLoading(false);
      await loadPosts(true);
      await loadUserLikes(data.user.id);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) router.replace("/login");
    });
    return () => { sub.subscription.unsubscribe(); };
  }, [router]);

  async function loadPosts(initial = false) {
    if (initial) { setPosts([]); setFeedCursor(null); setHasMore(true); }
    if (!hasMore && !initial) return;
    if (isFetchingRef.current && !initial) return;
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
    } catch (err) { reportError('Не удалось загрузить ленту', err); }
    setPostsLoading(false);
    isFetchingRef.current = false;
  }

  function dedupePosts(list: Post[]): Post[] {
    const seen = new Set<string>();
    const out: Post[] = [];
    for (const p of list) { if (!p?.id) continue; if (seen.has(p.id)) continue; seen.add(p.id); out.push(p); }
    return out;
  }

  async function loadUserLikes(uid: string) {
    try {
      const { data, error } = await supabase.from('posts_likes').select('post_id').eq('user_id', uid);
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
      let ins = await supabase.from("posts").insert(payloadFull).select('id').single();
      let error = ins.error;
      if (error) {
        const msg = (error as any)?.message || '';
        if (/column .* does not exist/i.test(msg) || /missing column/i.test(msg) || /schema cache/i.test(msg)) {
          const minimal = { user_id: userId, content } as any;
          const retry = await supabase.from("posts").insert(minimal).select('id').single();
          if (retry.error) throw retry.error;
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
        } else { throw error; }
      }
      setNewPost("");
      setPendingMedia([]);
      reportSuccess('Пост опубликован');
    } catch (err) { reportError('Не удалось опубликовать пост', err); }
    finally { setPublishing(false); }
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
          ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const key = `${userId}/${uuid}-${file.name}`;
        const { error: upErr } = await bucket.upload(key, file, { upsert: false, contentType: file.type });
        if (!upErr) {
          const { data } = bucket.getPublicUrl(key);
          if (data?.publicUrl) uploaded.push(data.publicUrl);
        }
      }
      setPendingMedia(prev => [...prev, ...uploaded]);
    } catch (err) { reportError('Не удалось загрузить изображения', err); }
    finally { setUploading(false); e.target.value = ''; }
  }
  function removePendingMedia(url: string) { setPendingMedia(prev => prev.filter(u => u !== url)); }

  async function toggleLike(postId: string) {
    if (!userId) return;
    const liked = userLikes.has(postId);
    if (likeBusy.has(postId)) return;
    setLikeBusy((prev) => new Set(prev).add(postId));
    try {
      if (liked) {
        const { error } = await supabase.from('posts_likes').delete().eq('post_id', postId).eq('user_id', userId);
        if (error) throw error; reportSuccess('Лайк снят');
      } else {
        const { error } = await supabase.from('posts_likes').insert({ post_id: postId, user_id: userId } as any);
        if (error) throw error; reportSuccess('Лайк сохранён');
      }
      await loadUserLikes(userId);
    } catch (err: any) {
      const msg = err?.message || ""; const code = err?.code || "";
      if (code === '23505' || /duplicate key/i.test(msg)) { await loadUserLikes(userId); return; }
      reportError('Не удалось изменить лайк', err);
    } finally {
      setLikeBusy((prev) => { const next = new Set(prev); next.delete(postId); return next; });
    }
  }

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
    } catch (err) { reportError('Не удалось загрузить комментарии', err); }
    finally { setRepliesLoading(prev => ({ ...prev, [postId]: false })); }
  }

  async function addReply(postId: string) {
    if (!userId) return;
    const text = (replyDrafts[postId] || '').trim(); if (!text) return;
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
    } catch (err) { reportError('Не удалось отправить комментарий', err); }
    finally { setReplyPosting(prev => ({ ...prev, [postId]: false })); }
  }

  // Realtime подписки
  useEffect(() => {
    const ch = supabase
      .channel('posts-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, (payload) => {
        const type = (payload as any).eventType as 'INSERT'|'UPDATE'|'DELETE';
        const newRow = (payload as any).new as Post | null;
        const oldRow = (payload as any).old as Post | null;
        setPosts((prev) => {
          if (type === 'INSERT' && newRow) return dedupePosts([newRow, ...prev]);
          if (type === 'UPDATE' && newRow) return prev.map(p => p.id === newRow.id ? { ...p, ...newRow } : p);
          if (type === 'DELETE' && oldRow) return prev.filter(p => p.id !== oldRow.id);
          return prev;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts_likes' }, () => {
        if (userId) loadUserLikes(userId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts_replies' }, (payload) => {
        const type = (payload as any).eventType as 'INSERT'|'UPDATE'|'DELETE';
        const pid = (payload.new as any)?.post_id || (payload.old as any)?.post_id;
        if (!pid) return;
        setReplies((prev) => {
          const list = prev[pid]; if (!list) return prev;
          if (type === 'INSERT' && payload.new) return { ...prev, [pid]: [...list, payload.new as any] };
          if (type === 'UPDATE' && payload.new) return { ...prev, [pid]: list.map(r => r.id === (payload.new as any).id ? (payload.new as any) : r) };
          if (type === 'DELETE' && payload.old) return { ...prev, [pid]: list.filter(r => r.id !== (payload.old as any).id) };
          return prev;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  // Автодозагрузка при скролле
  useEffect(()=>{
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver((entries)=>{
      const e = entries[0]; if (e.isIntersecting) loadPosts(false);
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
              <Image src="/dashboard/feed.png" alt="Главная" width={16} height={16} className="opacity-80" />
              Лента
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/quizzes" ? linkActive : linkHover}`} href="/dashboard/quizzes">
              <Image src="/dashboard/quizzes.png" alt="История" width={16} height={16} className="opacity-80" />
              Квизы
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/lobby" ? linkActive : linkHover}`} href="/dashboard/lobby">
              <Image src="/dashboard/calendar.png" alt="Календарь" width={16} height={16} className="opacity-80" />
              Лобби
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/friends" ? linkActive : linkHover}`} href="/dashboard/friends">
              <Image src="/dashboard/friends.png" alt="Календарь" width={16} height={16} className="opacity-80" />
              Друзья
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/chats" ? linkActive : linkHover}`} href="/dashboard/chats">
              <Image src="/dashboard/chats.png" alt="Организация" width={16} height={16} className="opacity-80" />
              Чаты
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/subscription" ? linkActive : linkHover}`} href="/dashboard/subscription">
              <Image src="/dashboard/subscription.png" alt="Подписка" width={16} height={16} className="opacity-80" />
              Premium
            </a>
          </nav>

          {/* Профиль снизу */}
          <div className="mt-auto pt-4 border-t">
            <button onClick={() => router.push("/dashboard/profile")} className="w-full flex items-center gap-3 px-3 py-2 rounded-none hover:bg-foreground/10 text-left">
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
            <div className="text-sm text-foreground/80">Лента</div>
          </div>

          <div className="px-4 lg:px-8 py-8">
            <div className="mx-auto w-full max-w-2xl">
              {uiError && (
                <div className="mb-4 rounded-none border border-red-500 bg-red-500/10 text-red-600 px-3 py-2 text-sm flex items-start justify-between gap-3">
                  <span>{uiError}</span>
                  <button onClick={() => setUiError(null)} className="text-xs underline">Закрыть</button>
                </div>
              )}
              {uiSuccess && (
                <div className="mb-4 rounded-none border border-green-500 bg-green-500/10 text-green-700 px-3 py-2 text-sm flex items-start justify-between gap-3">
                  <span>{uiSuccess}</span>
                  <button onClick={() => setUiSuccess(null)} className="text-xs underline">Закрыть</button>
                </div>
              )}

              {/* Композер поста */}
              <div className="rounded-lg border bg-background p-4 mb-6 shadow-sm">
                <textarea
                  value={newPost}
                  onChange={(e) => setNewPost(e.target.value)}
                  placeholder="Что нового?"
                  className="w-full resize-none rounded-md border bg-background px-3 py-2 outline-none text-sm min-h-24 focus:ring-2 focus:ring-foreground/20"
                />
                {pendingMedia.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {pendingMedia.map((u) => (
                      <div key={u} className="relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="media" className="w-full h-24 object-cover border rounded-md" />
                        <button onClick={() => removePendingMedia(u)} className="absolute right-1 top-1 text-[10px] border bg-background/80 px-1 rounded group-hover:opacity-100 opacity-90">×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <label className="text-xs flex items-center gap-2">
                    <input type="file" accept="image/*" multiple onChange={onSelectImages} className="hidden" id="post-images" />
                    <span className="rounded-md border px-2 py-1 hover:bg-foreground/10 cursor-pointer" onClick={() => document.getElementById('post-images')?.click()}>
                      {uploading ? 'Загрузка…' : 'Добавить изображения'}
                    </span>
                  </label>
                  <div className="mt-3 flex items-center justify-end">
                    <button onClick={addPost} disabled={!newPost.trim() || publishing} className="rounded-md border px-3 py-2 text-sm hover:bg-foreground/10 disabled:opacity-60 shadow-sm">
                      {publishing ? "Публикуем…" : "Опубликовать"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Лента постов */}
              {postsLoading ? (
                <div className="text-sm text-foreground/60">Загрузка…</div>
              ) : posts.length === 0 ? (
                <div className="text-sm text-foreground/60">Постов нет</div>
              ) : (
                <ul className="flex flex-col gap-4">
                  {posts.map((p) => (
                    <li key={`${p.id}-${p.created_at}`} className="rounded-lg border bg-background p-4 shadow-sm hover:shadow-md transition-shadow">
                      {/* Шапка поста */}
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-full overflow-hidden border bg-foreground/10 flex-shrink-0">
                          {p.author_avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.author_avatar} alt={p.author_name || 'avatar'} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-xs text-foreground/60">👤</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2 text-sm min-w-0">
                              <span className="font-medium truncate max-w-[200px] sm:max-w-[260px]">{p.author_name || 'Без имени'}</span>
                              {p.author_verified ? (
                                <Image src="/verification/check.png" alt="verified" width={14} height={14} className="opacity-90" />
                              ) : null}
                              {(p.author_role || (p.user_id === userId && userRole)) && (
                                <span className="rounded-md border px-1 py-[1px] text-[10px] uppercase tracking-wide">{p.author_role || userRole}</span>
                              )}
                            </div>
                            <span className="text-foreground/60 text-xs whitespace-nowrap mt-0.5">{timeAgo(p.created_at)}</span>
                          </div>

                          {/* Контент */}
                          <div className="mt-2 text-[15px] leading-6 whitespace-pre-wrap break-words">{p.content}</div>

                          {/* Медиа */}
                          {p.media_urls && p.media_urls.length > 0 && (
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              {p.media_urls.map((u, idx) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={`${p.id}-${idx}`} src={u} alt="media" className="w-full max-h-64 object-cover border rounded-md hover:opacity-95 transition" />
                              ))}
                            </div>
                          )}

                          {/* Панель действий */}
                          <div className="mt-3 flex items-center gap-3 text-xs">
                            <button onClick={() => toggleLike(p.id)} disabled={likeBusy.has(p.id)} className={`rounded-md border px-3 py-1 hover:bg-foreground/10 ${userLikes.has(p.id) ? 'bg-foreground/10' : ''} ${likeBusy.has(p.id) ? 'opacity-60 cursor-not-allowed' : ''}`} title={userLikes.has(p.id) ? 'Убрать лайк' : 'Поставить лайк'}>
                              ❤ <span className="ml-1">{typeof p.likes_count === 'number' ? p.likes_count : 0}</span>
                            </button>
                            <button onClick={() => { if (!replies[p.id]) loadReplies(p.id); setRepliesLoading(prev => ({ ...prev, [p.id]: !!repliesLoading[p.id] })); if (replies[p.id]) setReplies({ ...replies }); }} className="rounded-md border px-3 py-1 hover:bg-foreground/10" title="Комментарии">
                              💬 Комментарии
                            </button>
                            {userId === p.user_id && (
                              <button onClick={() => deletePost(p.id)} className="rounded-md border px-3 py-1 hover:bg-foreground/10 ml-auto" title="Удалить пост">
                                🗑 Удалить
                              </button>
                            )}
                          </div>

                          {/* Секция реплаев */}
                          {replies[p.id] && (
                            <div className="mt-3 rounded-lg border bg-background p-3 space-y-3">
                              {repliesLoading[p.id] ? (
                                <div className="text-[12px] text-foreground/60">Загрузка комментариев…</div>
                              ) : replies[p.id].length === 0 ? (
                                <div className="text-[12px] text-foreground/60">Пока нет комментариев</div>
                              ) : (
                                <ul className="space-y-2">
                                  {replies[p.id].map(r => (
                                    <li key={r.id} className="flex items-start gap-2">
                                      <div className="h-7 w-7 rounded-full overflow-hidden border bg-foreground/10 flex-shrink-0">
                                        {r.author_avatar ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img src={r.author_avatar} alt={r.author_name || 'avatar'} className="h-full w-full object-cover" />
                                        ) : (
                                          <div className="h-full w-full flex items-center justify-center text-[10px] text-foreground/60">👤</div>
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 text-[12px]">
                                          <span className="font-medium truncate">{r.author_name || 'Без имени'}</span>
                                          {r.author_verified ? (<Image src="/verification/check.png" alt="verified" width={14} height={14} className="opacity-90" />) : null}
                                        </div>
                                        <div className="text-[13px] whitespace-pre-wrap break-words">{r.content}</div>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {/* Поле ввода реплая */}
                              <div className="flex items-center gap-2">
                                <input value={replyDrafts[p.id] || ''} onChange={(e)=> setReplyDrafts(prev => ({ ...prev, [p.id]: e.target.value }))} className="flex-1 rounded-md border bg-background px-3 py-2 text-sm" placeholder="Написать комментарий…" />
                                <button onClick={() => addReply(p.id)} disabled={replyPosting[p.id]} className="rounded-md border px-3 py-2 text-xs hover:bg-foreground/10">{replyPosting[p.id] ? 'Отправка…' : 'Отправить'}</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Сенсинел для дозагрузки */}
              <div ref={sentinelRef} className="h-10" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

// Вынесенные функции, если нужны (deletePost из оригинала)
async function deletePost(id: string) {
  // Минимальная реализация удаления; при необходимости можно добавить проверку автора
  const { error } = await supabase.from('posts').delete().eq('id', id);
  if (error) console.warn('Не удалось удалить пост', error);
}
