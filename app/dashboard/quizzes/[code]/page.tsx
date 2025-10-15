"use client";

import { useEffect, useMemo, useRef, useState, use } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

type Room = {
  id: string;
  code: string;
  host_id: string;
  status: "waiting" | "in_progress" | "finished";
  current_question_index: number | null;
  question_started_at: string | null;
  question_duration_seconds: number | null;
};

type Question = {
  id: string;
  room_id: string;
  order_index: number;
  prompt: string;
  options: string[];
  correct_index: number | null;
};

type Player = {
  room_id: string;
  user_id: string;
  joined_at: string;
  score: number;
  display_name?: string | null;
  avatar_url?: string | null;
};

type PageProps = { params: Promise<{ code: string }> };

export default function RoomPage({ params }: PageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { code: codeParam } = use(params);
  const roomCode = (codeParam || "").toUpperCase();

  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userVerified, setUserVerified] = useState<boolean>(false);

  const [loading, setLoading] = useState(true);
  const [uiError, setUiError] = useState<string | null>(null);
  const [uiSuccess, setUiSuccess] = useState<string | null>(null);

  const [room, setRoom] = useState<Room | null>(null);
  const [totalQuestions, setTotalQuestions] = useState<number | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [verifiedMap, setVerifiedMap] = useState<Record<string, boolean>>({});
  const [question, setQuestion] = useState<Question | null>(null);
  const [answersMap, setAnswersMap] = useState<Record<string, number>>({}); // user_id -> selected_index
  const [prevRanks, setPrevRanks] = useState<Record<string, number>>({});
  const [finalOpen, setFinalOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewQuestions, setReviewQuestions] = useState<Array<Question>>([]);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoFinishRef = useRef<string | null>(null);
  const [, forceTick] = useState(0);

  const isHost = userId && room && userId === room.host_id;

  // Состояния для перегенерации вопросов (только хост)
  const [regenTopic, setRegenTopic] = useState<string>("");
  const [regenDifficulty, setRegenDifficulty] = useState<"easy" | "medium" | "hard">("easy");
  const [regenCount, setRegenCount] = useState<string>("10");
  const [regenDuration, setRegenDuration] = useState<string>("30");
  const [regenLoading, setRegenLoading] = useState(false);
  const [isRegenOpen, setIsRegenOpen] = useState(false);
  const [isLeaveOpen, setIsLeaveOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteHints, setInviteHints] = useState<Array<{id:string; username:string; full_name?:string|null; avatar_url?:string|null}>>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSelected, setInviteSelected] = useState<{id:string; username:string} | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      const user = data.user;
      if (!user) { router.replace("/login"); return; }
      setUserId(user.id);
      const meta = user.user_metadata || {};
      const full = [meta.first_name, meta.last_name].filter(Boolean).join(" ") || meta.name || meta.full_name || null;
      setDisplayName(full);
      setAvatarUrl(meta.avatar_url || meta.picture || null);
      setUserVerified(Boolean(meta.verified));
      await loadRoomByCode(roomCode, { full, avatar: meta.avatar_url || meta.picture || null });
      setLoading(false);
    })();
    return () => { mounted = false; cleanup(); };
  }, [roomCode]);

  async function loadRoomByCode(code: string, me?: { full: string | null; avatar: string | null }) {
    const { data: roomRow, error } = await supabase
      .from("quiz_rooms")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    if (error) return reportError("Не удалось загрузить комнату", error);
    if (!roomRow) { reportError("Комната не найдена"); return; }
    setRoom(roomRow as Room);
    // авто-join, если ещё не в списке
    if (userId) {
      await supabase.from("quiz_players").insert({
        room_id: roomRow.id,
        user_id: userId,
        display_name: me?.full || displayName,
        avatar_url: me?.avatar || avatarUrl,
      }).then(() => {}).catch(() => {});
    }
    // первичная загрузка
    await refreshPlayers(roomRow.id);
    await refreshQuestion(roomRow as Room);
    // загрузим количество вопросов
    try {
      const { count } = await supabase
        .from("quiz_questions")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomRow.id);
      setTotalQuestions(count ?? null);
    } catch {}
    // подписки
    subscribe(roomRow.id);
  }

  async function refreshPlayers(roomId: string) {
    const { data } = await supabase
      .from("quiz_players")
      .select("room_id, user_id, joined_at, score, display_name, avatar_url")
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true });
    setPlayers((data || []) as Player[]);
  }

  async function refreshQuestion(r: Room) {
    if (r.current_question_index == null) { setQuestion(null); return; }
    const { data } = await supabase
      .from("quiz_questions")
      .select("*")
      .eq("room_id", r.id)
      .eq("order_index", r.current_question_index)
      .maybeSingle();
    setQuestion((data || null) as Question | null);
    // загрузим ответы текущего вопроса, чтобы понимать отправлял ли пользователь
    const { data: answers } = await supabase
      .from("quiz_answers")
      .select("user_id, selected_index")
      .eq("room_id", r.id)
      .eq("question_id", (data as any)?.id || "");
    const map: Record<string, number> = {};
    (answers || []).forEach((a: any) => { map[a.user_id] = a.selected_index; });
    setAnswersMap(map);
    setupTimer(r);
  }

  function setupTimer(r: Room) {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (!r.question_started_at || !r.question_duration_seconds) return;
    timerRef.current = setInterval(() => forceTick((x) => x + 1), 1000);
  }

  function cleanup() {
    try { channelRef.current?.unsubscribe(); } catch {}
    channelRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function reportError(msg: string, err?: unknown) {
    // Улучшим вывод ошибки
    const extra = (err && typeof err === 'object') ? (err as any).message || JSON.stringify(err) : String(err || "");
    console.error(msg, extra);
    setUiError(extra ? `${msg}: ${extra}` : msg);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setUiError((cur) => (cur === (extra ? `${msg}: ${extra}` : msg) ? null : cur)), 5000);
    }
  }
  function reportSuccess(msg: string) {
    setUiSuccess(msg);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setUiSuccess((cur) => (cur === msg ? null : cur)), 3500);
    }
  }

  function subscribe(roomId: string) {
    cleanup();
    const ch = supabase.channel(`quiz-room-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_rooms', filter: `id=eq.${roomId}` }, (payload) => {
        const newRow = (payload as any).new as Room;
        setRoom((prev) => ({ ...(prev || {} as any), ...newRow }));
        refreshQuestion(newRow);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_players', filter: `room_id=eq.${roomId}` }, () => {
        refreshPlayers(roomId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_answers', filter: `room_id=eq.${roomId}` }, (payload) => {
        const a = (payload as any).new as { user_id: string; selected_index: number; question_id: string };
        if (a && question && a.question_id === question.id) {
          setAnswersMap((m) => ({ ...m, [a.user_id]: a.selected_index }));
        }
      })
      .subscribe();
    channelRef.current = ch;
  }

  const now = Date.now();
  const remaining = useMemo(() => {
    if (!room?.question_started_at || !room?.question_duration_seconds) return null;
    const started = new Date(room.question_started_at).getTime();
    const endAt = started + room.question_duration_seconds * 1000;
    return Math.max(0, Math.ceil((endAt - now) / 1000));
  }, [room?.question_started_at, room?.question_duration_seconds, now]);

  async function startQuestion() {
    if (!isHost || !room) return;
    const index = room.current_question_index ?? 0;
    const { error } = await supabase
      .from("quiz_rooms")
      .update({ status: "in_progress", current_question_index: index, question_started_at: new Date().toISOString() })
      .eq("id", room.id);
    if (error) return reportError("Не удалось стартовать вопрос", error);
    reportSuccess("Вопрос запущен");
  }

  async function nextQuestion() {
    if (!isHost || !room) return;
    const index = (room.current_question_index ?? 0) + 1;
    const { error } = await supabase
      .from("quiz_rooms")
      .update({ current_question_index: index, question_started_at: new Date().toISOString() })
      .eq("id", room.id);
    if (error) return reportError("Не удалось переключить вопрос", error);
    reportSuccess("Следующий вопрос");
  }

  async function prevQuestion() {
    if (!isHost || !room) return;
    const index = Math.max(0, (room.current_question_index ?? 0) - 1);
    const { error } = await supabase
      .from("quiz_rooms")
      .update({ current_question_index: index, question_started_at: new Date().toISOString() })
      .eq("id", room.id);
    if (error) return reportError("Не удалось переключить на предыдущий", error);
    reportSuccess("Предыдущий вопрос");
  }

  async function finishQuestion() {
    if (!isHost || !room || !question) return;
    // В реалтайм‑режиме очки уже начисляются при отправке ответа.
    // Здесь только показываем правильный ответ и (если не последний вопрос) авто‑переходим дальше.
    if (question.correct_index == null) return reportError("У вопроса не задан правильный ответ");
    setRevealCorrect(true);
    if (isHost && !isLastQuestion) {
      setTimeout(() => {
        if (question && room) {
          nextQuestion();
        }
      }, 3000);
    }
  }

  async function finishQuiz() {
    if (!isHost || !room) return;
    // Переводим комнату в finished
    const { error } = await supabase
      .from('quiz_rooms')
      .update({ status: 'finished' })
      .eq('id', room.id);
    if (error) return reportError('Не удалось завершить квиз', error);
    setFinalOpen(true);
  }

  async function openReview() {
    if (!room) return;
    setReviewOpen(true);
    // Загрузка всех вопросов для обзора
    const { data, error } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('room_id', room.id)
      .order('order_index', { ascending: true });
    if (error) { reportError('Не удалось загрузить вопросы для обзора', error); return; }
    setReviewQuestions((data || []) as any);
  }

  async function submitAnswer(idx: number) {
    if (!room || !question || !userId) return;
    if (remaining !== null && remaining <= 0) return; // дедлайн
    if (answersMap[userId || ""] != null) return; // уже отвечал (локальная проверка)

    // Пытаемся вставить ответ один раз; при дубликате БД вернёт 23505
    const { error } = await supabase
      .from("quiz_answers")
      .insert({ room_id: room.id, question_id: question.id, user_id: userId, selected_index: idx });

    if (error) {
      if ((error as any).code === "23505") {
        // уже отвечал — приведём локальное состояние к факту
        setAnswersMap((m) => ({ ...m, [userId]: idx }));
        return;
      }
      return reportError("Не удалось отправить ответ", error);
    }

    // Локально отметим выбор
    setAnswersMap((m) => ({ ...m, [userId]: idx }));

    // Реалтайм‑начисление очков сразу после первого ответа
    if (question.correct_index != null) {
      const delta = idx === question.correct_index ? 100 : -50;
      await supabase
        .from("quiz_players")
        .update({ score: (null as any) }) // заглушка, ниже инкремент через RPC или явное чтение
        .eq("room_id", room.id)
        .eq("user_id", userId);
      // Поскольку PostgREST не поддерживает инкремент напрямую в простом виде,
      // сделаем безопасный read-modify-write
      const { data: cur } = await supabase
        .from("quiz_players")
        .select("score")
        .eq("room_id", room.id)
        .eq("user_id", userId)
        .single();
      const newScore = (cur?.score ?? 0) + delta;
      await supabase
        .from("quiz_players")
        .update({ score: newScore })
        .eq("room_id", room.id)
        .eq("user_id", userId);
    }
  }

  async function regenerateQuestions() {
    if (!isHost || !room) return;
    const count = Math.max(1, Math.min(50, parseInt(regenCount || "10", 10) || 10));
    const dur = Math.max(5, Math.min(600, parseInt(regenDuration || "30", 10) || 30));
    setRegenLoading(true);
    try {
      const res = await fetch("/api/quizzes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: room.id,
          topic: regenTopic || "Общий",
          difficulty: regenDifficulty,
          question_count: count,
          question_duration_seconds: dur,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        throw new Error(j.error || "Не удалось сгенерировать вопросы");
      }
      // Сохраним длительность на уровне локального состояния комнаты
      setRoom((prev) => prev ? ({ ...prev, question_duration_seconds: dur, current_question_index: 0 }) : prev);
      await refreshQuestion({ ...(room as any), question_duration_seconds: dur, current_question_index: 0 });
      if (typeof j.count === 'number') setTotalQuestions(j.count);
      reportSuccess(`Сгенерировано вопросов: ${j.count}`);
    } catch (e) {
      reportError("Ошибка генерации вопросов", e);
    }
    setRegenLoading(false);
  }

  // Подгружаем признак верификации пользователей, присутствующих в комнате
  useEffect(() => {
    (async () => {
      try {
        const ids = players.map(p => p.user_id).filter(Boolean);
        if (ids.length === 0) { setVerifiedMap({}); return; }
        const { data, error } = await supabase
          .from('profiles')
          .select('id, verified')
          .in('id', ids);
        if (error) { return; }
        const map: Record<string, boolean> = {};
        for (const r of data || []) { map[(r as any).id] = !!(r as any).verified; }
        setVerifiedMap(map);
      } catch {}
    })();
  }, [players]);

  // Дебаунс-поиск юзернеймов по вводу @
  useEffect(() => {
    let alive = true;
    const term = inviteUsername.trim();
    if (!isInviteOpen || !term.startsWith("@") || term.length < 2) {
      setInviteHints([]);
      setInviteSelected(null);
      return;
    }
    const q = term.slice(1);
    setInviteLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .ilike('username', `%${q}%`)
          .limit(8);
        if (!alive) return;
        if (error) {
          setInviteHints([]);
        } else {
          const list = (data || []) as any[];
          setInviteHints(list as any);
          // авто-выбор при точном совпадении @username
          const exact = list.find(u => `@${u.username}`.toLowerCase() === term.toLowerCase());
          setInviteSelected(exact ? { id: exact.id, username: exact.username } : null);
        }
      } catch {
        if (alive) setInviteHints([]);
      }
      if (alive) setInviteLoading(false);
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [inviteUsername, isInviteOpen]);

  // Автозавершение вопроса у хоста по истечении таймера (однократно на вопрос)
  useEffect(() => {
    if (!isHost || !room || !question) return;
    if (remaining === null) return;
    if (remaining > 0) return;
    if (autoFinishRef.current === question.id) return; // уже завершали этот вопрос
    autoFinishRef.current = question.id;
    finishQuestion();
  }, [isHost, room?.id, question?.id, remaining]);

  // Отсортированный лидерборд и вычисление текущих рангов
  const sortedPlayers = useMemo(() => {
    const arr = [...players];
    arr.sort((a, b) => {
      const sa = a.score ?? 0;
      const sb = b.score ?? 0;
      if (sb !== sa) return sb - sa; // по убыванию очков
      // тай-брейкер: кто раньше присоединился
      return (new Date(a.joined_at).getTime() || 0) - (new Date(b.joined_at).getTime() || 0);
    });
    return arr;
  }, [players]);

  const currentRanks = useMemo(() => {
    const ranks: Record<string, number> = {};
    sortedPlayers.forEach((p, idx) => { ranks[p.user_id] = idx + 1; });
    return ranks;
  }, [sortedPlayers]);

  // После изменения состава/очков обновляем prevRanks для следующего рендера (видеть движение)
  useEffect(() => {
    setPrevRanks((prev) => {
      // если ключи/порядок поменялись — установим текущие как базу
      return currentRanks;
    });
  }, [currentRanks]);

  const linkBase = "flex items-center gap-3 rounded-none px-3 py-2";
  const linkHover = "hover:bg-foreground/10";
  const linkActive = "bg-foreground/10 text-foreground";

  const isLastQuestion = useMemo(() => {
    if (totalQuestions == null) return false;
    const idx = room?.current_question_index ?? 0;
    return idx >= totalQuestions - 1;
  }, [room?.current_question_index, totalQuestions]);

  // Конфетти через библиотеку canvas-confetti при открытии финального экрана
  useEffect(() => {
    if (!finalOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('canvas-confetti');
        if (cancelled) return;
        const confetti = mod.default;
        const duration = 2500;
        const end = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 } as any;
        const frame = () => {
          confetti({ ...defaults, particleCount: 3, origin: { x: Math.random(), y: Math.random() - 0.2 } });
          if (Date.now() < end) requestAnimationFrame(frame);
        };
        // Несколько залпов в начале
        confetti({ ...defaults, particleCount: 80, origin: { x: 0.2, y: 0.2 } });
        confetti({ ...defaults, particleCount: 80, origin: { x: 0.8, y: 0.2 } });
        requestAnimationFrame(frame);
      } catch (e) {
        console.warn('confetti load failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [finalOpen]);

  return (
    <main className="min-h-screen w-full">
      <div className="min-h-screen">
        {/* Content */}
        <section className="relative bg-background/80">
          {/* Top bar */}
          <div className="sticky top-0 z-10 border-b px-4 lg:px-8 py-4 bg-background/80 backdrop-blur">
            <div className="relative w-full flex items-center justify-between">
              <div className="text-sm text-foreground/80">Комната {roomCode}</div>
              <div className="text-xs text-foreground/60">Статус: {room?.status || '—'}</div>
              {/* Centered question index */}
              <div className="absolute left-1/2 -translate-x-1/2 text-sm font-medium text-foreground">
                Вопрос {room?.current_question_index != null ? (room.current_question_index + 1) : 1}
                {totalQuestions != null ? ` / ${totalQuestions}` : ""}
              </div>
            </div>
          </div>
          {/* Progress bar under TopBar */}
          {remaining !== null && room?.question_duration_seconds ? (
            <div className="px-4 lg:px-8 pt-2">
              <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-foreground transition-all"
                  style={{
                    width: `${Math.max(0, Math.min(100, (1 - (remaining / (room?.question_duration_seconds || 1))) * 100))}%`,
                  }}
                />
              </div>
              <div className="mt-1 text-[11px] text-foreground/60">Осталось: {remaining}s</div>
            </div>
          ) : null}

          <div className="px-4 lg:px-8 py-8">
            <div className="mx-auto w-full max-w-5xl space-y-6">
              {uiError && (
                <div className="rounded-md border border-red-500 bg-red-500/10 text-red-600 px-3 py-2 text-sm">{uiError}</div>
              )}
              {uiSuccess && (
                <div className="rounded-md border border-green-500 bg-green-500/10 text-green-700 px-3 py-2 text-sm">{uiSuccess}</div>
              )}

              {/* Лобби до старта: код + сетка из 10 ячеек */}
              {room?.status !== 'in_progress' && (
                <div className="rounded-lg border bg-background p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">Код комнаты: <span className="font-mono">{room?.code}</span></div>
                    <div className="text-xs text-foreground/60">Ожидаем старт от хоста…</div>
                  </div>
                  <div className="mt-4">
                    <div className="text-sm font-medium mb-3">Игроки</div>
                    <ul className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {Array.from({ length: 10 }).map((_, i) => {
                        const pl = players[i];
                        if (pl) {
                          return (
                            <li key={pl.user_id} className="rounded-lg border bg-background p-3 flex flex-col items-center justify-center text-center">
                              <div className="relative h-14 w-14 rounded-full overflow-hidden border bg-foreground/10">
                                {pl.avatar_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={pl.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-xl text-foreground/60">👤</div>
                                )}
                                {/* Badge верификации на аватаре */}
                                {verifiedMap[pl.user_id] && (
                                  <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background border flex items-center justify-center">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                  </span>
                                )}
                              </div>
                              <div className="mt-2 w-full truncate text-xs inline-flex items-center justify-center gap-1">
                                <span className="truncate max-w-[140px]">{pl.display_name || pl.user_id}</span>
                                {verifiedMap[pl.user_id] && (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                )}
                              </div>
                            </li>
                          );
                        }
                        return (
                          <li key={`empty-${i}`}>
                            <button
                              onClick={() => setIsInviteOpen(true)}
                              className="group w-full h-full rounded-lg border bg-background p-3 flex flex-col items-center justify-center text-center hover:border-foreground/40"
                              title="Пригласить друзей"
                            >
                              <div className="h-14 w-14 rounded-full border border-dashed bg-foreground/5 flex items-center justify-center text-2xl text-foreground/30 group-hover:text-foreground/60">+
                              </div>
                              <div className="mt-2 text-xs text-foreground/40 group-hover:text-foreground/60">Пусто</div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
              {/* Текущий вопрос — показываем только когда игра в прогрессе */}
              {(room?.status === 'in_progress') && question && (
                <div className="rounded-lg border bg-background p-5 shadow-sm">
                  <div className="text-sm font-medium">Вопрос {room?.current_question_index != null ? (room!.current_question_index + 1) : 1}</div>
                  <div className="mt-2 text-[17px] sm:text-lg leading-7 font-medium">{question.prompt}</div>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                    {question.options.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => submitAnswer(idx)}
                        disabled={(answersMap[userId || ""] != null) || (remaining !== null && remaining <= 0)}
                        aria-pressed={answersMap[userId || ""] === idx}
                        className={`group text-left rounded-lg border-2 px-4 py-5 sm:py-6 min-h-24 sm:min-h-28 text-base sm:text-[17px] leading-6 transition
                          ${answersMap[userId || ""] === idx
                            ? 'bg-foreground/10 border-foreground'
                            : 'border-foreground/20 hover:border-foreground/40 hover:bg-foreground/5'}
                          disabled:opacity-60 disabled:cursor-not-allowed`}
                      >
                        <span className="block">{opt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Лидерборд (по очкам) */}
              <div className="rounded-lg border bg-background p-5 shadow-sm">
                <div className="text-sm font-medium mb-2">Таблица лидеров</div>
                {sortedPlayers.length === 0 ? (
                  <div className="text-xs text-foreground/60">Пока нет игроков</div>
                ) : (
                  <ul className="space-y-2">
                    {sortedPlayers.map((pl, idx) => {
                      const rank = idx + 1;
                      const prev = prevRanks[pl.user_id];
                      let indicator: React.ReactNode = null;
                      if (prev != null) {
                        if (prev > rank) {
                          // поднялся
                          indicator = (
                            <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>
                              +{prev - rank}
                            </span>
                          );
                        } else if (prev < rank) {
                          // опустился
                          indicator = (
                            <span className="inline-flex items-center gap-1 text-red-600 text-xs">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>
                              -{rank - prev}
                            </span>
                          );
                        } else {
                          indicator = <span className="text-foreground/50 text-xs">—</span>;
                        }
                      }
                      return (
                        <li key={pl.user_id} className="rounded-md border bg-background px-3 py-2 text-sm flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-6 text-xs text-foreground/60">{rank}</div>
                            <div className="h-7 w-7 rounded-full overflow-hidden border bg-foreground/10 flex-shrink-0">
                              {pl.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={pl.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-[10px] text-foreground/60">👤</div>
                              )}
                            </div>
                            <span className="truncate">{pl.display_name || pl.user_id}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {indicator}
                            <span className="text-xs text-foreground/60">{pl.score ?? 0} очк.</span>
                          </div>
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
      {/* Прокладка под нижнюю панель */}
      <div className="h-24" />
      {/* BottomNav */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 backdrop-blur">
        <div className="px-4 lg:px-8 py-4 sm:py-5">
          <div className="relative w-full">
            {/* Left: regenerate (прижата к левому краю контейнера) */}
            <div className="absolute inset-y-0 left-0 flex items-center">
              <button
                onClick={() => setIsRegenOpen(true)}
                disabled={!isHost || regenLoading}
                title="Перегенерировать квиз"
                className="inline-flex items-center gap-2 rounded-md border px-5 py-4 text-base hover:bg-foreground/10 disabled:opacity-50"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-3-7.7"/><path d="M21 3v7h-7"/></svg>
              </button>
            </div>

            {/* Center: brand (строго по центру) */}
            <div className="flex items-center justify-center">
              <button onClick={() => setIsLeaveOpen(true)} className="inline-flex items-center gap-2 cursor-pointer select-none">
                <Image src="/icons/logo-dark.png" alt="Optimum" width={26} height={26} className="opacity-90" />
                <div className="text-lg font-medium">Optimum AI</div>
              </button>
            </div>

            {/* Right: prev/next или Начать до старта */}
            <div className="absolute inset-y-0 right-0 flex items-center gap-2">
              {room?.status !== 'in_progress' ? (
                <button
                  onClick={startQuestion}
                  disabled={!isHost}
                  title="Начать игру"
                  className="rounded-md border px-4 py-4 hover:bg-foreground/10 disabled:opacity-50"
                >
                  Начать
                </button>
              ) : (!isLastQuestion ? (
                <>
                  <button
                    onClick={prevQuestion}
                    disabled={!isHost}
                    title="Предыдущий вопрос"
                    className="rounded-md border px-4 py-4 hover:bg-foreground/10 disabled:opacity-50"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                  </button>
                  <button
                    onClick={nextQuestion}
                    disabled={!isHost}
                    title="Следующий вопрос"
                    className="rounded-md border px-4 py-4 hover:bg-foreground/10 disabled:opacity-50"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6"/></svg>
                  </button>
                </>
              ) : (
                <button
                  onClick={finishQuiz}
                  disabled={!isHost}
                  title="Завершить тест"
                  className="rounded-md border px-4 py-4 hover:bg-foreground/10 disabled:opacity-50"
                >
                  Завершить тест
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Modal: перегенерация квиза */}
      {isRegenOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => (!regenLoading ? setIsRegenOpen(false) : null)} />
          <div className="relative z-10 w-full max-w-lg rounded-lg border bg-background p-5 shadow-lg">
            <div className="text-sm font-medium">Параметры перегенерации</div>
            <div className="text-xs text-foreground/60 mt-1">Настройте тему, сложность, количество вопросов и длительность.</div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs flex flex-col gap-1">
                <span className="text-foreground/60">Тема (опц.)</span>
                <input value={regenTopic} onChange={(e)=>setRegenTopic(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Напр.: Фильмы" />
              </label>
              <label className="text-xs flex flex-col gap-1">
                <span className="text-foreground/60">Сложность</span>
                <select value={regenDifficulty} onChange={(e)=>setRegenDifficulty(e.target.value as any)} className="rounded-md border bg-background px-3 py-2 text-sm">
                  <option value="easy">Лёгкая</option>
                  <option value="medium">Средняя</option>
                  <option value="hard">Сложная</option>
                </select>
              </label>
              <label className="text-xs flex flex-col gap-1">
                <span className="text-foreground/60">Кол-во вопросов</span>
                <input type="number" min={1} max={50} inputMode="numeric" value={regenCount} onChange={(e)=>setRegenCount(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="10" />
              </label>
              <label className="text-xs flex flex-col gap-1">
                <span className="text-foreground/60">Длительность (сек.)</span>
                <input type="number" min={5} max={600} inputMode="numeric" value={regenDuration} onChange={(e)=>setRegenDuration(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="30" />
              </label>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setIsRegenOpen(false)} disabled={regenLoading} className="rounded-md border px-3 py-2 text-xs hover:bg-foreground/10 disabled:opacity-50">Отмена</button>
              <button
                onClick={async () => { await regenerateQuestions(); setIsRegenOpen(false); }}
                disabled={regenLoading}
                className="rounded-md border px-3 py-2 text-sm bg-foreground text-background hover:opacity-90 disabled:opacity-60"
              >
                {regenLoading ? "Генерируем…" : "Сгенерировать"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal: выход из лобби */}
      {isLeaveOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsLeaveOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-lg border bg-background p-5 shadow-lg">
            <div className="text-sm font-medium">Хотите покинуть лобби?</div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setIsLeaveOpen(false)} className="rounded-md border px-3 py-2 text-xs hover:bg-foreground/10">Нет</button>
              <button onClick={() => router.push('/dashboard')} className="rounded-md border px-3 py-2 text-sm bg-foreground text-background hover:opacity-90">Да</button>
            </div>
          </div>
        </div>
      )}
      {/* Modal: пригласить друзей */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsInviteOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-lg border bg-background p-5 shadow-lg">
            <div className="text-sm font-medium">Пригласить друзей</div>
            <div className="text-xs text-foreground/60 mt-1">Введите @username или выберите из списка друзей.</div>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <input
                value={inviteUsername}
                onChange={(e)=>{ setInviteUsername(e.target.value); setInviteSelected(null); }}
                placeholder="@username"
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
              {/* Подсказки по username */}
              {(inviteUsername.startsWith('@')) && (
                <div className="rounded-md border bg-background py-1 max-h-64 overflow-auto">
                  {inviteLoading ? (
                    <div className="px-3 py-2 text-xs text-foreground/60">Поиск…</div>
                  ) : inviteHints.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-foreground/60">Ничего не найдено</div>
                  ) : (
                    <ul className="divide-y">
                      {inviteHints.map(u => (
                        <li key={u.id}>
                          <button
                            type="button"
                            onClick={() => { setInviteUsername(`@${u.username}`); setInviteSelected({ id: u.id, username: u.username }); }}
                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-foreground/5 text-left"
                          >
                            <span className="h-7 w-7 rounded-full overflow-hidden border bg-foreground/10 inline-flex items-center justify-center">
                              {u.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={u.avatar_url} alt="avatar" className="h-7 w-7 object-cover" />
                              ) : (
                                <span className="text-[10px] text-foreground/60">👤</span>
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm">@{u.username}</span>
                              {u.full_name ? <span className="block text-xs text-foreground/60 truncate">{u.full_name}</span> : null}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            {(() => {
              const isSelf = inviteSelected?.id && userId && inviteSelected.id === userId;
              const alreadyIn = inviteSelected?.id ? players.some(p => p.user_id === inviteSelected.id) : false;
              const invalid = !inviteSelected || isSelf || alreadyIn;
              return (
                <div className="mt-4 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-foreground/60">
                    {isSelf ? 'Нельзя пригласить самого себя' : alreadyIn ? 'Пользователь уже в лобби' : ''}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={()=>setIsInviteOpen(false)} className="rounded-md border px-3 py-2 text-xs hover:bg-foreground/10">Отмена</button>
                    <button
                      disabled={invalid}
                      onClick={()=>{ /* TODO: отправить инвайт */ setIsInviteOpen(false); setUiSuccess('Приглашение отправлено'); }}
                      className="rounded-md border px-3 py-2 text-sm bg-foreground text-background hover:opacity-90 disabled:opacity-50"
                    >
                      Отправить
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
      {/* Финальный полноэкранный лидерборд с конфетти */}
      {finalOpen && (
        <div className="fixed inset-0 z-40 bg-background/95 backdrop-blur flex items-center justify-center p-6">
          <div className="relative z-10 w-full max-w-3xl rounded-xl border bg-background shadow-xl p-6">
            <div className="text-lg font-semibold mb-4 text-center">Поздравляем! Итоги квиза</div>
            <ul className="space-y-2">
              {sortedPlayers.map((pl, idx) => (
                <li key={pl.user_id} className="rounded-md border bg-background px-3 py-2 text-sm flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-6 text-xs text-foreground/60">{idx + 1}</div>
                    <div className="h-7 w-7 rounded-full overflow-hidden border bg-foreground/10 flex-shrink-0">
                      {pl.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pl.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-[10px] text-foreground/60">👤</div>
                      )}
                    </div>
                    <span className="truncate">{pl.display_name || pl.user_id}</span>
                  </div>
                  <span className="text-xs text-foreground/60">{pl.score ?? 0} очк.</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button onClick={openReview} className="rounded-md border px-4 py-2 text-sm hover:bg-foreground/10">Посмотреть все вопросы</button>
              <button onClick={() => router.push('/dashboard')} className="rounded-md border px-4 py-2 text-sm bg-foreground text-background hover:opacity-90">Вернуться в лобби</button>
            </div>
          </div>
        </div>
      )}
      {/* Модалка обзора вопросов */}
      {reviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setReviewOpen(false)} />
          <div className="relative z-10 w-full max-w-3xl max-h-[80vh] overflow-auto rounded-lg border bg-background p-6 shadow-xl">
            <div className="text-sm font-medium">Вопросы и правильные ответы</div>
            <ol className="mt-3 space-y-3 list-decimal list-inside">
              {reviewQuestions.map((q) => (
                <li key={q.id} className="rounded-md border px-3 py-2">
                  <div className="text-sm font-medium">{q.prompt}</div>
                  {Array.isArray((q as any).options) && (q as any).correct_index != null && (
                    <div className="mt-1 text-xs text-green-700">Правильный ответ: {(q as any).options[(q as any).correct_index]}</div>
                  )}
                </li>
              ))}
            </ol>
            <div className="mt-4 flex items-center justify-end">
              <button onClick={() => setReviewOpen(false)} className="rounded-md border px-3 py-2 text-xs hover:bg-foreground/10">Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
