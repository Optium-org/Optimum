"use client";
// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type ChatItem = {
  id: string;
  name: string;
  avatar?: string | null;
  verified?: boolean;
  lastMessage?: string;
  lastTime?: string; // formatted time
  unread?: number;
};

type Message = {
  id: string;
  chat_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type ProfileHit = {
  id: string;
  username: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  verified?: boolean | null;
};

const PAGE_SIZE = 30;

export default function ChatsPage() {
  // ---- AUTH ----
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ---- CHATS ----
  const [chatsDb, setChatsDb] = useState<ChatItem[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [chatsOffset, setChatsOffset] = useState(0);
  const [chatsHasMore, setChatsHasMore] = useState(true);
  const CHATS_PAGE = 20;
  const [otherByChat, setOtherByChat] = useState<Record<string, { id: string; display_name?: string | null; username?: string | null; avatar_url?: string | null; verified?: boolean | null }>>({});

  // ---- UI FILTER ----
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creatingDirect, setCreatingDirect] = useState(false);

  // ---- MESSAGES ----
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const oldestCursorRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // ---- TYPING ----
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const typingTimeouts = useRef<Record<string, any>>({});

  // Presence, last_read
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null);
  const [myLastReadAt, setMyLastReadAt] = useState<string | null>(null);
  const [otherOnline, setOtherOnline] = useState(false);
  const messagesListRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [pendingNewCount, setPendingNewCount] = useState(0);

  // ---- USER SEARCH BY @ ----
  const [searchUsers, setSearchUsers] = useState<ProfileHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const atQuery = query.trim().startsWith("@");

  // ---- AUTH INIT ----
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!data.user) { setLoading(false); return; }
      setUserId(data.user.id);
      setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user) setUserId(null); else setUserId(session.user.id);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  // ---- LOAD CHATS (lazy) ----
  async function loadChatsPage(initial = false) {
    if (!userId || chatsLoading || (!chatsHasMore && !initial)) return;
    setChatsLoading(true);
    try {
      const from = initial ? 0 : chatsOffset;
      const to = from + CHATS_PAGE - 1;
      const { data, error } = await supabase
        .from('chats_overview')
        .select('id,name,avatar,last_message,last_time,unread')
        .order('last_time', { ascending: false })
        .range(from, to);
      if (error) throw error;
      const mapped: ChatItem[] = (data as any[]).map((r) => ({ id: r.id, name: r.name, avatar: r.avatar, lastMessage: r.last_message || '', lastTime: r.last_time || '', unread: r.unread || 0 }));
      setChatsDb(prev => initial ? uniqueChatsById(mapped) : uniqueChatsById([...prev, ...mapped]));
      setChatsOffset(to + 1);
      setChatsHasMore((data || []).length === CHATS_PAGE);
    } catch {}
    setChatsLoading(false);
  }
  useEffect(() => { if (userId) { setChatsOffset(0); setChatsHasMore(true); loadChatsPage(true); } }, [userId]);

  // Обогащение: для 1-на-1 чатов подставляем профиль второго участника (display_name и т.п.)
  useEffect(() => {
    if (!userId) return;
    const ids = chatsDb.map((c) => c.id);
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: members } = await supabase
          .from('chat_members')
          .select('chat_id, user_id')
          .in('chat_id', ids);
        if (!members) return;
        const grouped: Record<string, string[]> = {};
        for (const m of members as any[]) {
          const cid = m.chat_id as string; const uid = m.user_id as string;
          (grouped[cid] ||= []).push(uid);
        }
        const directChatOther: Record<string, string> = {};
        for (const cid of Object.keys(grouped)) {
          const arr = grouped[cid];
          if (arr.length === 2) {
            const other = arr.find((u) => u !== userId);
            if (other) directChatOther[cid] = other;
          }
        }
        const otherIds = Array.from(new Set(Object.values(directChatOther)));
        if (otherIds.length === 0) return;
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name, username, avatar_url, verified')
          .in('id', otherIds);
        const byId: Record<string, any> = {};
        for (const p of (profs || []) as any[]) byId[p.id] = p;
        const map: Record<string, any> = {};
        for (const [cid, uid] of Object.entries(directChatOther)) {
          if (byId[uid]) map[cid] = byId[uid];
        }
        if (!cancelled) setOtherByChat(map);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [userId, chatsDb]);

  // ---- LOAD MESSAGES (initial and pagination) ----
  async function loadMessages(chatId: string, initial = false) {
    if (!chatId) return;
    if (msgLoading) return;
    setMsgLoading(true);
    try {
      let q = supabase
        .from("messages")
        .select("id,chat_id,user_id,content,created_at")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (!initial && oldestCursorRef.current) {
        q = q.lt('created_at', oldestCursorRef.current);
      }
      const { data, error } = await q;
      if (error) throw error;
      const batch = (data || []) as Message[];
      setHasMore(batch.length === PAGE_SIZE);
      if (batch.length > 0) oldestCursorRef.current = batch[batch.length - 1].created_at;
      setMessages((prev) => {
        const add = batch.reverse();
        return initial ? uniqueById(add) : uniqueById([...add, ...prev]);
      });
    } catch {}
    setMsgLoading(false);
  }

  // helper: дедупликация сообщений по id
  const uniqueById = (arr: Message[]) => {
    const map = new Map<string, Message>();
    for (const m of arr) map.set(m.id, m);
    return Array.from(map.values());
  };

  // helper: дедупликация чатов по id
  const uniqueChatsById = (arr: ChatItem[]) => {
    const map = new Map<string, ChatItem>();
    for (const c of arr) map.set(c.id, c);
    return Array.from(map.values());
  };

  // Выбор активного чата
  useEffect(() => {
    if (!activeId) return;
    // reset paging
    oldestCursorRef.current = null;
    setMessages([]);
    setHasMore(true);
    loadMessages(activeId, true);
    // сброс индикаторов
    setPendingNewCount(0);
    setIsAtBottom(true);
  }, [activeId]);

  // Бесконечная прокрутка: догрузка при достижении верха
  useEffect(() => {
    if (!topSentinelRef.current) return;
    const el = topSentinelRef.current;
    const io = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (e.isIntersecting && hasMore && !msgLoading && activeId) {
        loadMessages(activeId, false);
      }
    }, { root: null, rootMargin: '0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [topSentinelRef.current, hasMore, msgLoading, activeId]);

  // Автоскролл к последнему сообщению при новых сообщениях / смене чата
  useEffect(() => {
    if (!activeId) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, activeId]);

  // ---- REALTIME: новые сообщения ----
  useEffect(() => {
    if (!activeId) return;
    const ch = supabase
      .channel(`chat-${activeId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${activeId}` }, (payload) => {
        const row = (payload as any).new as Message;
        setMessages((prev) => (prev.some(m => m.id === row.id) ? prev : [...prev, row]));
        // если сообщение от собеседника и мы не у низа — покажем кнопку и увеличим счётчик
        if (row.user_id !== userId) {
          const el = messagesListRef.current;
          if (el) {
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
            if (!nearBottom) {
              setPendingNewCount((c) => c + 1);
              setIsAtBottom(false);
            } else {
              // автоскролл вниз если у низа
              setTimeout(()=> bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 0);
            }
          }
        } else {
          // своё сообщение — скроллим вниз
          setTimeout(()=> bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 0);
        }
      })
      // индикатор "печатает" через broadcast
      .on('broadcast', { event: 'typing' }, (payload: any) => {
        const uid = payload?.payload?.user_id as string | undefined;
        if (!uid || uid === userId) return;
        setTypingUsers((prev) => new Set([...Array.from(prev).filter((x) => x !== uid), uid]));
        // авто-очистка через 2.5с
        if (typingTimeouts.current[uid]) clearTimeout(typingTimeouts.current[uid]);
        typingTimeouts.current[uid] = setTimeout(() => {
          setTypingUsers((prev) => { const next = new Set(prev); next.delete(uid); return next; });
        }, 2500);
      })
      // следим за обновлением last_read_at собеседника
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_members', filter: `chat_id=eq.${activeId}` }, (payload: any) => {
        const row = payload.new as { user_id: string; last_read_at: string | null };
        if (row.user_id !== userId) {
          setOtherLastReadAt(row.last_read_at || null);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId, userId]);

  // Presence (онлайн/оффлайн)
  useEffect(() => {
    if (!activeId || !userId) return;
    const otherId = otherByChat[activeId]?.id;
    const presence = supabase.channel(`presence-${activeId}`, {
      config: { presence: { key: userId } }
    });
    presence.on('presence', { event: 'sync' }, () => {
      const state = presence.presenceState() as Record<string, Array<{ user_id: string }>>;
      const flat = Object.values(state).flat();
      setOtherOnline(!!flat.find(p => p.user_id === otherId));
    });
    presence.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        presence.track({ user_id: userId });
      }
    });
    return () => { supabase.removeChannel(presence); };
  }, [activeId, userId, otherByChat[activeId]?.id]);

  // слежение за прокруткой сообщений — определяем, у низа ли пользователь
  useEffect(() => {
    const el = messagesListRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
      setIsAtBottom(nearBottom);
      if (nearBottom) setPendingNewCount(0);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [messagesListRef.current]);

  // Индикатор "печатает…" с простым троттлингом
  const typingStampRef = useRef<number>(0);
  function notifyTyping() {
    if (!activeId || !userId) return;
    const now = Date.now();
    if (typingStampRef.current && now - typingStampRef.current < 1000) return;
    typingStampRef.current = now;
    try {
      supabase.channel(`chat-${activeId}`).send({ type: 'broadcast', event: 'typing', payload: { user_id: userId } });
    } catch {}
  }

  // Сообщения для рендера: по возрастанию времени (сверху — старые, внизу — новые)
  const sortedMessages = useMemo(() => {
    const arr = [...messages];
    arr.sort((a,b)=> new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return arr;
  }, [messages]);

  // индекс первого непрочитанного сообщения по myLastReadAt
  const newBoundaryIndex = useMemo(() => {
    if (!myLastReadAt) return -1;
    const t = new Date(myLastReadAt).getTime();
    return sortedMessages.findIndex(m => new Date(m.created_at).getTime() > t);
  }, [myLastReadAt, sortedMessages]);

  // Активный чат по activeId
  const activeChat = useMemo(() => chatsDb.find((c) => c.id === activeId) || null, [chatsDb, activeId]);

  // Отправка сообщения
  async function sendMessage(text: string) {
    if (!activeId || !userId) return;
    const content = text.trim(); if (!content) return;
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({ chat_id: activeId, user_id: userId, content } as any)
        .select('id, chat_id, user_id, content, created_at')
        .single();
      if (error) throw error;
      if (data) {
        setMessages(prev => (prev.some(m => m.id === data.id) ? prev : [...prev, data as Message]));
        // прокрутка вниз
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 0);
      }
      // после отправки пометим, что всё просмотрено мной (обновим last_read)
      await supabase
        .from('chat_members')
        .update({ last_read_at: new Date().toISOString() } as any)
        .eq('chat_id', activeId)
        .eq('user_id', userId);
    } catch (err: any) {
      toast.error(err?.message || 'Не удалось отправить сообщение');
    }
  }

  // Компонент ввода сообщения
  function ChatInput({ onSend, onTyping }: { onSend: (text: string) => void | Promise<void>; onTyping: () => void }) {
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    async function submit() {
      const t = text.trim();
      if (!t || sending) return;
      setSending(true);
      try { await onSend(t); setText(""); }
      finally { setSending(false); }
    }
    return (
      <div className="border-t p-3 bg-background/80">
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="flex items-end gap-2 rounded-md border bg-background px-2 py-2"
        >
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); onTyping(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            className="flex-1 bg-transparent outline-none text-sm resize-none max-h-40"
            rows={1}
            placeholder="Написать сообщение…"
          />
          <button type="submit" disabled={sending || !text.trim()} className="rounded-md border px-3 py-1.5 text-xs hover:bg-foreground/10 disabled:opacity-60">Отправить</button>
        </form>
      </div>
    );
  }

  // Поиск пользователей по @username
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!atQuery) { setSearchUsers([]); return; }
      const raw = query.trim().slice(1);
      if (raw.length < 2) { setSearchUsers([]); return; }
      setSearchLoading(true);
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, verified')
          .ilike('username', `${raw}%`)
          .neq('id', userId || '')
          .limit(10);
        if (!cancelled) setSearchUsers((data || []) as ProfileHit[]);
      } catch {
        if (!cancelled) setSearchUsers([]);
      }
      if (!cancelled) setSearchLoading(false);
    };
    const t = setTimeout(run, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, userId, atQuery]);

  // Создание/открытие личного чата
  async function startDirectChat(otherUserId: string, title?: string | null) {
    if (!userId) return;
    if (creatingDirect) return;
    setCreatingDirect(true);
    try {
      // Найти уже существующий 1-на-1
      const { data: myChats } = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('user_id', userId);
      const ids = (myChats || []).map((r: any) => r.chat_id);
      if (ids.length) {
        const { data: existing } = await supabase
          .from('chat_members')
          .select('chat_id')
          .in('chat_id', ids)
          .eq('user_id', otherUserId)
          .limit(1)
          .maybeSingle();
        if (existing?.chat_id) {
          const cid = existing.chat_id as string;
          if (!chatsDb.find(c => c.id === cid)) {
            try {
              const { data: chatRow } = await supabase.from('chats').select('id, name, avatar, updated_at').eq('id', cid).maybeSingle();
              const nowLabel = new Date(chatRow?.updated_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              setChatsDb(prev => {
                const next = [{ id: cid, name: (title || chatRow?.name || 'Личный чат'), avatar: chatRow?.avatar || null, verified: false, lastMessage: '', lastTime: nowLabel, unread: 0 }, ...prev];
                return uniqueChatsById(next);
              });
              setOtherByChat(prev => ({ ...prev, [cid]: { id: otherUserId, display_name: title || null } }));
            } catch {}
          }
          setActiveId(cid);
          return;
        }
      }
      // Создать новый чат
      const { data: chatIns, error: chatErr } = await supabase
        .from('chats')
        .insert({ name: title || 'Личный чат', is_group: false, creator_id: userId })
        .select('id')
        .single();
      if (chatErr || !chatIns) { throw chatErr || new Error('Не удалось создать чат'); }
      const chatId = chatIns.id as string;
      const { error: m1 } = await supabase.from('chat_members').insert({ chat_id: chatId, user_id: userId } as any);
      if (m1) throw m1;
      const { error: m2 } = await supabase.from('chat_members').insert({ chat_id: chatId, user_id: otherUserId } as any);
      if (m2) throw m2;
      const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setChatsDb(prev => uniqueChatsById([{ id: chatId, name: title || 'Личный чат', avatar: null, verified: false, lastMessage: '', lastTime: nowLabel, unread: 0 }, ...prev]));
      setOtherByChat(prev => ({ ...prev, [chatId]: { id: otherUserId, display_name: title || null } }));
      setActiveId(chatId);
      toast.success('Чат создан');
    } catch (err: any) {
      toast.error(err?.message || 'Не удалось создать чат');
    } finally {
      setCreatingDirect(false);
    }
  }

  // Фильтр и отображение чатов
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chatsDb;
    return chatsDb.filter((c) => c.name.toLowerCase().includes(q) || c.lastMessage?.toLowerCase().includes(q));
  }, [chatsDb, query]);

  const displayChats = useMemo(() => {
    const mapped = filtered.map((c) => {
      const other = otherByChat[c.id];
      if (other) {
        return {
          ...c,
          name: other.display_name || (other.username ? `@${other.username}` : c.name),
          avatar: other.avatar_url || c.avatar,
          verified: other.verified ?? c.verified,
        } as ChatItem;
      }
      return c;
    });
    return uniqueChatsById(mapped);
  }, [filtered, otherByChat]);

  // refs и lazy для левой колонки
  const leftListRef = useRef<HTMLDivElement | null>(null);
  const leftBottomRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    const root = leftListRef.current;
    const target = leftBottomRef.current;
    if (!root || !target) return;
    const io = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (e.isIntersecting) loadChatsPage(false);
    }, { root, threshold: 0 });
    io.observe(target);
    return () => io.disconnect();
  }, [leftListRef.current, leftBottomRef.current, userId, chatsHasMore, chatsLoading]);

  return (
    <main className="min-h-screen w-full">
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] min-h-screen">
        {/* Левая колонка */}
        <aside className="relative h-screen overflow-hidden border-r bg-gradient-to-b from-background/95 to-background/80">
          <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
            <div className="px-4 py-3 flex items-center justify-between">
              <a href="/dashboard" className="flex items-center gap-2 hover:opacity-90 transition">
                <Image src="/icons/logo-dark.png" alt="Optimum" width={24} height={24} />
                <span className="text-sm font-medium">Optimum</span>
              </a>
            </div>
            <div className="px-3 pb-3">
              <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-foreground/60"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск" className="w-full bg-transparent outline-none text-sm" />
              </div>
              {atQuery && (
                <div className="relative z-20 mt-2 rounded-md border bg-background/60">
                  <div className="px-2 py-1.5 text-[11px] text-foreground/60">Люди</div>
                  {searchLoading ? (
                    <div className="px-2 pb-2 text-xs text-foreground/60">Поиск…</div>
                  ) : searchUsers.length === 0 ? (
                    <div className="px-2 pb-2 text-xs text-foreground/60">Ничего не найдено</div>
                  ) : (
                    <ul className="px-1 pb-2 space-y-1">
                      {searchUsers.map((u) => (
                        <li key={u.id} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-foreground/5">
                          <div className="h-7 w-7 rounded-full overflow-hidden border bg-foreground/10 flex-shrink-0">
                            {u.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={u.avatar_url} alt={u.username || ''} className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 text-xs">
                              <span className="truncate font-medium">{u.display_name || u.username || 'Пользователь'}</span>
                              {u.verified ? (<Image src="/verification/check.png" alt="verified" width={12} height={12} className="opacity-90" />) : null}
                            </div>
                            <div className="text-[11px] text-foreground/60 truncate">@{u.username}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => startDirectChat(u.id, u.display_name || (u.username ? `@${u.username}` : ''))}
                            className={`text-[11px] rounded-md border px-2 py-1 hover:bg-foreground/10 ${creatingDirect ? 'opacity-60 cursor-not-allowed' : ''}`}
                            disabled={creatingDirect}
                          >
                            Начать чат
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="h-[calc(100vh-88px)] overflow-y-auto px-2 pb-4" ref={left => leftListRef.current = left}>
            <ul className="space-y-1">
              {displayChats.map((c, idx) => (
                <li key={c.id}>
                  <button onClick={() => setActiveId(c.id)} className={`w-full text-left rounded-md px-2 py-2 flex items-center gap-3 transition ${activeId === c.id ? "bg-foreground/10" : "hover:bg-foreground/5"}`}>
                    <div className="relative h-10 w-10 rounded-full overflow-hidden border bg-foreground/10 flex-shrink-0">
                      {c.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.avatar} alt={c.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-xs text-foreground/60">👤</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium">{c.name}</div>
                        {c.verified ? (<Image src="/verification/check.png" alt="verified" width={14} height={14} className="opacity-90" />) : null}
                        <div className="ml-auto text-[11px] text-foreground/60 whitespace-nowrap">{c.lastTime}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="truncate text-[12px] text-foreground/60">{c.lastMessage || ""}</div>
                        {c.unread ? (<span className="ml-auto rounded-full bg-foreground/20 text-[10px] px-2 py-[2px]">{c.unread}</span>) : null}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && !chatsLoading && (<li className="px-2 py-6 text-center text-xs text-foreground/60">Чаты не найдены</li>)}
              <li ref={leftBottomRef} />
            </ul>
          </div>
        </aside>

        {/* Правая колонка */}
        <section className="relative bg-background/80">
          <div className="sticky top-0 z-10 border-b px-4 lg:px-6 py-3 flex items-center gap-3 bg-background/80 backdrop-blur min-h-[56px]">
            {activeChat ? (
              <>
                <div className="h-8 w-8 rounded-full overflow-hidden border bg-foreground/10">
                  {activeChat.avatar ? (// eslint-disable-next-line @next/next/no-img-element
                    <img src={activeChat.avatar} alt={activeChat.name} className="h-full w-full object-cover" />) : null}
                </div>
                <div className="text-sm font-medium flex items-center gap-2">
                  <span>{otherByChat[activeChat.id]?.display_name || (otherByChat[activeChat.id]?.username ? `@${otherByChat[activeChat.id]?.username}` : activeChat.name)}</span>
                  {otherOnline ? <span className="inline-block h-2 w-2 rounded-full bg-green-500" title="Онлайн" /> : <span className="inline-block h-2 w-2 rounded-full bg-foreground/40" title="Оффлайн" />}
                </div>
                {typingUsers.size > 0 && (<div className="text-[11px] text-foreground/60">печатает…</div>)}
              </>
            ) : (<div className="text-sm text-foreground/70">Чаты</div>)}
          </div>

          <div className="h-[calc(100vh-56px)] flex flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-2" ref={messagesListRef} onScrollCapture={notifyTyping}>
              <div ref={topSentinelRef} />
              {!activeChat ? (
                <div className="h-full w-full flex items-center justify-center">
                  <div className="text-xs text-foreground/60 border rounded-md px-3 py-1 bg-background/60">Выберите чат, чтобы начать переписку</div>
                </div>
              ) : (
                <ul className="space-y-2">
                  {sortedMessages.map((m, idx) => (
                    <>
                      {/* Разделитель «Новые сообщения» */}
                      {newBoundaryIndex === idx && (
                        <li key={`divider-${m.id}`} className="text-center text-[11px] text-foreground/60 my-2"><span className="inline-block px-2 py-0.5 rounded-full border bg-background/60">Новые сообщения</span></li>
                      )}
                      <li key={m.id} className={`max-w-[80%] ${m.user_id === userId ? 'ml-auto text-right' : ''}`}>
                        <div className={`inline-block rounded-md border px-3 py-2 text-sm ${m.user_id === userId ? 'bg-foreground/5' : 'bg-background'}`}>
                          <div className="whitespace-pre-wrap break-words">{m.content}</div>
                          <div className="mt-1 text-[10px] text-foreground/60 flex items-center gap-2">
                            <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {m.user_id === userId && (
                              <span className="inline-flex items-center gap-0.5">
                                {otherLastReadAt && new Date(otherLastReadAt).getTime() >= new Date(m.created_at).getTime() ? (
                                  <>
                                    <span aria-label="read" title="Прочитано">✓</span>
                                    <span aria-hidden>✓</span>
                                  </>
                                ) : (
                                  <span aria-label="sent" title="Отправлено">✓</span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    </>
                  ))}
                  {msgLoading && (<li className="text-center text-xs text-foreground/60">Загрузка…</li>)}
                  <li ref={bottomRef} />
                </ul>
              )}
            </div>
            {activeChat && (
              <>
                {/* Плавающая кнопка «вниз» */}
                {!isAtBottom && pendingNewCount > 0 && (
                  <button
                    onClick={() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); setPendingNewCount(0); setIsAtBottom(true); }}
                    className="absolute right-4 bottom-24 z-10 rounded-full border bg-background px-3 py-2 text-xs shadow hover:bg-foreground/10"
                    title="Прокрутить вниз"
                  >
                    ↓ Вниз {pendingNewCount > 0 ? `(${pendingNewCount})` : ''}
                  </button>
                )}
                <ChatInput onSend={sendMessage} onTyping={notifyTyping} />
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
