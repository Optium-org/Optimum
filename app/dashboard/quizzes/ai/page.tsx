"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";

export default function QuizAIPage() {
  const router = useRouter();
  const pathname = usePathname();

  // Текущий пользователь
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userVerified, setUserVerified] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [uiError, setUiError] = useState<string | null>(null);

  // Создание комнаты
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("easy");
  const [questionCount, setQuestionCount] = useState("");
  const [questionDuration, setQuestionDuration] = useState("30");
  const [createLoading, setCreateLoading] = useState(false);

  // Подключение к комнате
  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      const user = data.user;
      setUserId(user?.id || null);
      const meta = user?.user_metadata || {};
      const full = [meta.first_name, meta.last_name].filter(Boolean).join(" ") || meta.name || meta.full_name || null;
      setDisplayName(full);
      setAvatarUrl(meta.avatar_url || meta.picture || null);
      setUserVerified(Boolean(meta.verified));
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  function notifyError(msg: string, err?: unknown) {
    console.error(msg, err);
    setUiError(msg);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setUiError((cur) => (cur === msg ? null : cur)), 5000);
    }
  }

  function genCode(len = 6) {
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s;
  }

  async function createRoom() {
    if (!userId) return notifyError("Вы не авторизованы");
    const dur = parseInt(questionDuration || "30", 10) || 30;
    const count = Math.max(1, Math.min(50, parseInt(questionCount || "10", 10) || 10));
    const code = genCode(6);
    setCreateLoading(true);
    try {
      const { data: roomRow, error } = await supabase
        .from("quiz_rooms")
        .insert({ code, host_id: userId, question_duration_seconds: dur })
        .select("*")
        .single();
      if (error) throw error;

      // Добавляем хоста как игрока с отображаемым именем и аватаром
      await supabase
        .from("quiz_players")
        .insert({ room_id: roomRow.id, user_id: userId, display_name: displayName, avatar_url: avatarUrl })
        .then(() => {})
        .catch((e) => console.warn(e));

      // Генерация вопросов через backend API (ожидаем завершения)
      try {
        const res = await fetch("/api/quizzes/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_id: roomRow.id,
            topic: topic || "Общий",
            difficulty,
            question_count: count,
            question_duration_seconds: dur,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          console.warn("Generation failed:", j);
        }
      } catch (e) {
        console.warn("Generation request error", e);
      }

      // Переходим в комнату
      router.push(`/dashboard/quizzes/${roomRow.code}`);
    } catch (e) {
      notifyError("Не удалось создать комнату", e);
    }
    setCreateLoading(false);
  }

  async function joinRoomByCode() {
    if (!userId) return notifyError("Вы не авторизованы");
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoinLoading(true);
    try {
      const { data: roomRow, error } = await supabase
        .from("quiz_rooms")
        .select("*")
        .eq("code", code)
        .maybeSingle();
      if (error) throw error;
      if (!roomRow) throw new Error("Комната с таким кодом не найдена");

      await supabase
        .from("quiz_players")
        .insert({ room_id: roomRow.id, user_id: userId, display_name: displayName, avatar_url: avatarUrl })
        .then(() => {})
        .catch((e) => console.warn(e));

      router.push(`/dashboard/quizzes/${roomRow.code}`);
    } catch (e) {
      notifyError("Не удалось подключиться к комнате", e);
    }
    setJoinLoading(false);
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
            <Image src="/favicon.png" alt="Momentum" width={80} height={80} />
          </div>

          <nav className="space-y-2 text-sm">
            <a className={`${linkBase} ${pathname === "/dashboard" ? linkActive : linkHover}`} href="/dashboard">
              <Image src="/dashboard/home.png" alt="Главная" width={16} height={16} className="opacity-80" />
              Главная
            </a>
            <a className={`${linkBase} ${pathname?.startsWith("/dashboard/quizzes") ? linkActive : linkHover}`} href="/dashboard/quizzes">
              <Image src="/dashboard/history.png" alt="Квизы" width={16} height={16} className="opacity-80" />
              Квизы
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/leaderboard" ? linkActive : linkHover}`} href="/dashboard/leaderboard">
              <Image src="/dashboard/leaderboard.png" alt="Лидерборд" width={16} height={16} className="opacity-80" />
              Лидерборд
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/chats" ? linkActive : linkHover}`} href="/dashboard/chats">
              <Image src="/dashboard/subscription.png" alt="Чаты" width={16} height={16} className="opacity-80" />
              Чаты
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
              </div>
            </button>
          </div>
        </aside>

        {/* Content */}
        <section className="relative bg-background/80">
          {/* Top bar */}
          <div className="sticky top-0 z-10 border-b px-4 lg:px-8 py-4 flex items-center justify-between bg-background/80 backdrop-blur">
            <div className="text-sm text-foreground/80">AI квиз</div>
            <a href="/dashboard/quizzes" className="text-xs underline underline-offset-2 hover:opacity-80">Назад к выбору</a>
          </div>

          {/* Hero banner (full width of content column) */}
          <div className="border-b bg-background/10">
            <div className="relative w-full h-44 sm:h-56 lg:h-72">
              <Image
                src="/quiz/optimum_ai.png"
                alt="AI Quiz"
                fill
                priority
                sizes="100vw"
                className="object-cover object-center"
              />
            </div>
          </div>

          <div className="px-4 lg:px-8 py-8">
            <div className="mx-auto w-full max-w-4xl space-y-6">
              {uiError && (
                <div className="rounded-md border border-red-500 bg-red-500/10 text-red-600 px-3 py-2 text-sm">{uiError}</div>
              )}

              {/* Создать комнату */}
              <div className="rounded-lg border bg-background p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Создать комнату</div>
                  <div className="text-[11px] text-foreground/60">AI-сборка вопросов подключена</div>
                </div>
                <div className="text-xs text-foreground/70 mt-1 mb-4">Сгенерируем код комнаты и подготовим вопросы под выбранную тему и сложность.</div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <label className="text-xs flex flex-col gap-1">
                    <span className="text-foreground/60">Тема (опц.)</span>
                    <input value={topic} onChange={(e)=>setTopic(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Напр.: История, Фильмы" />
                  </label>
                  <label className="text-xs flex flex-col gap-1">
                    <span className="text-foreground/60">Сложность</span>
                    <select value={difficulty} onChange={(e)=>setDifficulty(e.target.value as any)} className="rounded-md border bg-background px-3 py-2 text-sm">
                      <option value="easy">Лёгкая</option>
                      <option value="medium">Средняя</option>
                      <option value="hard">Сложная</option>
                    </select>
                  </label>
                  <label className="text-xs flex flex-col gap-1">
                    <span className="text-foreground/60">Кол-во вопросов</span>
                    <input type="number" min={1} max={50} inputMode="numeric" value={questionCount} onChange={(e)=>setQuestionCount(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Напр.: 10" />
                  </label>
                  <label className="text-xs flex flex-col gap-1">
                    <span className="text-foreground/60">Длительность (сек.)</span>
                    <input type="number" min={5} max={300} inputMode="numeric" value={questionDuration} onChange={(e)=>setQuestionDuration(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Напр.: 30" />
                  </label>
                </div>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button onClick={()=>{ setTopic(''); setQuestionCount(''); setQuestionDuration('30'); setDifficulty('easy'); }} className="rounded-md border px-3 py-2 text-xs hover:bg-foreground/10">Сбросить</button>
                  <button onClick={createRoom} disabled={createLoading || loading || !userId} className="rounded-md border px-3 py-2 text-sm bg-foreground text-background hover:opacity-90 disabled:opacity-60">
                    {createLoading ? "Создаём…" : "Создать комнату"}
                  </button>
                </div>
              </div>

              {/* Подключиться по коду */}
              <div className="rounded-lg border bg-background p-5 shadow-sm">
                <div className="text-sm font-medium mb-2">Подключиться к комнате</div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                  <input value={joinCode} onChange={(e)=>setJoinCode(e.target.value)} className="rounded-md border bg-background px-3 py-3 text-sm tracking-widest uppercase" placeholder="ABC123" />
                  <button onClick={joinRoomByCode} disabled={joinLoading || loading || !userId || !joinCode.trim()} className="rounded-md border px-4 py-2.5 text-sm bg-foreground text-background hover:opacity-90 disabled:opacity-60 whitespace-nowrap">
                    {joinLoading ? "Подключаем…" : "Подключиться"}
                  </button>
                </div>
                <div className="text-[11px] text-foreground/60 mt-2">Попросите у друга код комнаты и введите его здесь.</div>
              </div>

            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
