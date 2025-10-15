"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

{{ ... }}

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [, forceTick] = useState(0);
+  const autoFinishRef = useRef(false);
+
+  const [questionsCount, setQuestionsCount] = useState<number | null>(null);

  const isHost = userId && room && userId === room.host_id;

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
+    await refreshQuestionsCount(roomRow.id);
    // подписки
    subscribe(roomRow.id);
  }

+  async function refreshQuestionsCount(roomId: string) {
+    const { count, error } = await supabase
+      .from('quiz_questions')
+      .select('id', { count: 'exact', head: true})
+      .eq('room_id', roomId);
+    if (!error) setQuestionsCount(count ?? null);
+  }
+
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

+  // Автозавершение вопроса по таймеру (только хост)
+  useEffect(() => {
+    if (!isHost) return;
+    if (!room?.question_started_at || !room?.question_duration_seconds) return;
+    if (remaining === 0 && !autoFinishRef.current) {
+      autoFinishRef.current = true;
+      finishQuestion().finally(() => {
+        autoFinishRef.current = false;
+      });
+    }
+  }, [remaining, isHost, room?.question_started_at, room?.question_duration_seconds]);
+
  async function finishQuestion() {
    if (!isHost || !room || !question) return;
    // Подсчёт очков: за правильный ответ +1
    const { data: answers, error: aErr } = await supabase
      .from("quiz_answers")
      .select("user_id, selected_index")
      .eq("room_id", room.id)
      .eq("question_id", question.id);
    if (aErr) return reportError("Не удалось получить ответы", aErr);
    if (question.correct_index == null) return reportError("У вопроса не задан правильный ответ");

    const correctUsers = (answers || []).filter(a => a.selected_index === question.correct_index).map(a => a.user_id);
    for (const uid of correctUsers) {
      // временный обход: читаем текущее значение и пишем +1
      const { data: cur, error: curErr } = await supabase
        .from("quiz_players")
        .select("score")
        .eq("room_id", room.id)
        .eq("user_id", uid)
        .single();
      if (curErr) { reportError("Не удалось получить очки игрока", curErr); continue; }
      const curScore = (cur?.score ?? 0) + 1;
      const { error: updErr } = await supabase
        .from("quiz_players")
        .update({ score: curScore })
        .eq("room_id", room.id)
        .eq("user_id", uid);
      if (updErr) { reportError("Не удалось обновить очки", updErr); }
    }

    reportSuccess("Вопрос завершён, очки начислены");

    // Автопереход к следующему вопросу или завершение игры
    try {
      const total = questionsCount ?? (await supabase.from('quiz_questions').select('id', { count: 'exact', head: true }).eq('room_id', room.id)).count || 0;
      const curIndex = room.current_question_index ?? 0;
      if (curIndex + 1 < total) {
        const { error: nErr } = await supabase
          .from('quiz_rooms')
          .update({ current_question_index: curIndex + 1, question_started_at: new Date().toISOString() })
          .eq('id', room.id);
        if (nErr) reportError('Не удалось переключить вопрос', nErr);
      } else {
        const { error: fErr } = await supabase
          .from('quiz_rooms')
          .update({ status: 'finished', question_started_at: null })
          .eq('id', room.id);
        if (fErr) reportError('Не удалось завершить игру', fErr);
      }
    } catch (e) {
      reportError('Ошибка при автопереходе', e);
    }
  }

+  // Если все игроки ответили — хост завершает вопрос автоматически
+  async function maybeAutoFinishAllAnswered(nextMap: Record<string, number>) {
+    if (!isHost || !room || !question) return;
+    const totalPlayers = players.length;
+    const answered = Object.keys(nextMap).length;
+    if (totalPlayers > 0 && answered >= totalPlayers && !autoFinishRef.current) {
+      autoFinishRef.current = true;
+      try { await finishQuestion(); } finally { autoFinishRef.current = false; }
+    }
+  }
+
  async function submitAnswer(idx: number) {
    if (!room || !question || !userId) return;
    if (remaining !== null && remaining <= 0) return; // дедлайн
    if (answersMap[userId] != null) return; // уже отвечал (локальная проверка)

    // Используем upsert с onConflict, чтобы молча игнорировать повторную отправку
    const { error } = await supabase
      .from("quiz_answers")
      .upsert(
        { room_id: room.id, question_id: question.id, user_id: userId, selected_index: idx },
        { onConflict: "room_id,question_id,user_id", ignoreDuplicates: true }
      );

    if (error) {
      // Если всё же прилетел конфликт (другая схема pkey), не считаем это фатальной ошибкой
      if ((error as any).code === "23505") {
        setAnswersMap((m) => ({ ...m, [userId]: idx }));
        // Если отвечает хост — сразу завершаем и переходим дальше
        if (isHost && !autoFinishRef.current) {
          autoFinishRef.current = true;
          try { await finishQuestion(); } finally { autoFinishRef.current = false; }
        }
        return;
      }
      return reportError("Не удалось отправить ответ", error);
    }

    // Обновим локально выбранный вариант
    setAnswersMap((m) => ({ ...m, [userId]: idx }));
+    // Если отвечает хост — сразу завершаем и двигаемся дальше
+    if (isHost && !autoFinishRef.current) {
+      autoFinishRef.current = true;
+      try { await finishQuestion(); } finally { autoFinishRef.current = false; }
+    }
  }

  function subscribe(roomId: string) {
    cleanup();
    const ch = supabase.channel(`quiz-room-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_rooms', filter: `id=eq.${roomId}` }, (payload) => {
        const newRow = (payload as any).new as Room;
        setRoom((prev) => ({ ...(prev || {} as any), ...newRow }));
        refreshQuestion(newRow);
        refreshQuestionsCount(newRow.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_players', filter: `room_id=eq.${roomId}` }, () => {
        refreshPlayers(roomId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_answers', filter: `room_id=eq.${roomId}` }, (payload) => {
        const a = (payload as any).new as { user_id: string; selected_index: number; question_id: string };
        if (a && question && a.question_id === question.id) {
-          setAnswersMap((m) => ({ ...m, [a.user_id]: a.selected_index }));
+          setAnswersMap((m) => {
+            const nextMap = { ...m, [a.user_id]: a.selected_index };
+            // Проверяем: если все ответили — хост завершает автоматически
+            maybeAutoFinishAllAnswered(nextMap);
+            return nextMap;
+          });
        }
      })
      .subscribe();
    channelRef.current = ch;
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

  const linkBase = "flex items-center gap-3 rounded-none px-3 py-2";
  const linkHover = "hover:bg-foreground/10";
  const linkActive = "bg-foreground/10 text-foreground";

  return (
    <main className="min-h-screen w-full">
      {/* Хост‑панель удалена — управление вынесено в BottomNav */}
      {{ ... }}
    </main>
  );
