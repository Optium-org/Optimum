"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

// Типы внешнего API
type DbQuiz = {
  id: string;
  title: string;
  category?: string | null;
  difficulty?: "easy" | "medium" | "hard" | string | null;
  question_count: number;
  description?: string | null;
  cover_url?: string | null;
};

type DbQuizDetail = {
  id: string;
  title: string;
  questions: Array<{
    id: string | number;
    prompt: string;
    options: string[];
    correct_index: number;
  }>;
};

export default function QuizDbPage() {
  const router = useRouter();
  const pathname = usePathname();

  // Пользователь
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userVerified, setUserVerified] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [uiError, setUiError] = useState<string | null>(null);

  // Данные каталога
  const [quizzes, setQuizzes] = useState<DbQuiz[]>([]);
  const [fetching, setFetching] = useState(false);

  // Фильтры
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [difficulty, setDifficulty] = useState<string>("all");

  // Предпросмотр/старт
  const [selected, setSelected] = useState<DbQuiz | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [questionDuration, setQuestionDuration] = useState("30");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      const user = data.user;
      setUserId(user?.id || null);
      const meta = user?.user_metadata || {} as any;
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

  // Загрузка каталога квизов из нашего API-прокси
  useEffect(() => {
    let mounted = true;
    (async () => {
      setFetching(true);
      try {
        const res = await fetch("/api/db/quizzes");
        if (!res.ok) throw new Error("fetch failed");
        const j = await res.json();
        if (!mounted) return;
        setQuizzes((j?.items || []) as DbQuiz[]);
      } catch (e) {
        notifyError("Не удалось загрузить список квизов", e);
      }
      setFetching(false);
    })();
    return () => { mounted = false; };
  }, []);

  // Уникальные категории из каталога
  const categories = useMemo(() => {
    const set = new Set<string>();
    quizzes.forEach((q) => { if (q.category) set.add(q.category); });
    return ["all", ...Array.from(set).sort((a,b)=>a.localeCompare(b))];
  }, [quizzes]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return quizzes.filter((q) => {
      const byCat = category === "all" || (q.category || "").toLowerCase() === category.toLowerCase();
      const byDiff = difficulty === "all" || (q.difficulty || "").toLowerCase() === difficulty.toLowerCase();
      const bySearch = !s || (q.title.toLowerCase().includes(s) || (q.description || "").toLowerCase().includes(s));
      return byCat && byDiff && bySearch;
    });
  }, [quizzes, category, difficulty, search]);

  async function createFromDbQuiz(q: DbQuiz) {
    if (!userId) return notifyError("Вы не авторизованы");
    setStartLoading(true);
    try {
      // 1) Создаём комнату
      const dur = Math.max(5, Math.min(600, parseInt(questionDuration || "30", 10) || 30));
      const code = genCode(6);
      const { data: roomRow, error: roomErr } = await supabase
        .from("quiz_rooms")
        .insert({ code, host_id: userId, question_duration_seconds: dur })
        .select("*")
        .single();
      if (roomErr) throw roomErr;

      // 2) Добавляем хоста как игрока
      await supabase
        .from("quiz_players")
        .insert({ room_id: roomRow.id, user_id: userId, display_name: displayName, avatar_url: avatarUrl })
        .then(() => {})
        .catch((e) => console.warn(e));

      // 3) Получаем детали квиза (вопросы) через API и вставляем в quiz_questions
      const resp = await fetch(`/api/db/quizzes/${q.id}`);
      if (!resp.ok) throw new Error("quiz detail fetch failed");
      const detail = await resp.json() as DbQuizDetail;
      const questions = (detail?.questions || []).slice(0, q.question_count);

      // Вставляем по одному (простая надёжная схема)
      for (let i = 0; i < questions.length; i++) {
        const it = questions[i];
        const { error: insErr } = await supabase
          .from("quiz_questions")
          .insert({
            room_id: roomRow.id,
            order_index: i,
            prompt: it.prompt,
            options: it.options,
            correct_index: it.correct_index,
          } as any);
        if (insErr) throw insErr;
      }

      // 4) Переход в комнату
      router.push(`/dashboard/quizzes/${roomRow.code}`);
    } catch (e) {
      notifyError("Не удалось запустить квиз", e);
    }
    setStartLoading(false);
  }

  function genCode(len = 6) {
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s;
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
            <a className={`${linkBase} ${pathname?.startsWith("/dashboard") ? linkHover : linkHover}`} href="/dashboard">
              <Image src="/dashboard/home.png" alt="Главная" width={16} height={16} className="opacity-80" />
              Главная
            </a>
            <a className={`${linkBase} ${pathname?.startsWith("/dashboard/quizzes") ? linkActive : linkHover}`} href="/dashboard/quizzes">
              <Image src="/dashboard/history.png" alt="Квизы" width={16} height={16} className="opacity-80" />
              Квизы
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
            <div className="text-sm text-foreground/80">Квизы из базы данных</div>
            <a href="/dashboard/quizzes" className="text-xs underline underline-offset-2 hover:opacity-80">Назад к выбору</a>
          </div>

          {/* Hero */}
          <div className="border-b bg-background/10">
            <div className="px-4 lg:px-8 py-6">
              <div className="mx-auto w-full max-w-4xl">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-md border bg-foreground/10 flex items-center justify-center text-lg">📚</div>
                  <div className="min-w-0">
                    <div className="text-base sm:text-lg font-semibold">Готовые квизы из внешнего API</div>
                    <div className="text-xs text-foreground/70 mt-1">Выберите набор вопросов, задайте длительность и сразу стартуйте комнату.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 lg:px-8 py-8">
            <div className="mx-auto w-full max-w-4xl space-y-6">
              {uiError && (
                <div className="rounded-md border border-red-500 bg-red-500/10 text-red-600 px-3 py-2 text-sm">{uiError}</div>
              )}

              {/* Фильтры каталога */}
              <div className="rounded-lg border bg-background p-5 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="text-xs flex flex-col gap-1">
                    <span className="text-foreground/60">Поиск</span>
                    <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Название или описание" className="rounded-md border bg-background px-3 py-2 text-sm" />
                  </label>
                  <label className="text-xs flex flex-col gap-1">
                    <span className="text-foreground/60">Категория</span>
                    <select value={category} onChange={(e)=>setCategory(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm">
                      {categories.map((c)=> (<option key={c} value={c}>{c === 'all' ? 'Все' : c}</option>))}
                    </select>
                  </label>
                  <label className="text-xs flex flex-col gap-1">
                    <span className="text-foreground/60">Сложность</span>
                    <select value={difficulty} onChange={(e)=>setDifficulty(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm">
                      <option value="all">Все</option>
                      <option value="easy">Лёгкая</option>
                      <option value="medium">Средняя</option>
                      <option value="hard">Сложная</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* Каталог */}
              <div className="rounded-lg border bg-background p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Каталог квизов</div>
                  <div className="text-[11px] text-foreground/60">{fetching ? "Загружаем…" : `${filtered.length} найдено`}</div>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filtered.map((q) => (
                    <button key={q.id} onClick={() => { setSelected(q); setPreviewOpen(true); }} className="group text-left rounded-lg border bg-background p-0 hover:bg-foreground/5 overflow-hidden">
                      {/* Обложка */}
                      {q.cover_url ? (
                        <div className="relative w-full h-36">
                          <Image src={q.cover_url} alt={q.title} fill sizes="(max-width: 640px) 100vw, 50vw" className="object-cover" />
                        </div>
                      ) : null}
                      <div className="p-4">
                        <div className="text-sm font-semibold truncate">{q.title}</div>
                        <div className="text-xs text-foreground/70 mt-1 truncate">{q.category || "Без категории"} • {q.difficulty || "—"} • {q.question_count} вопр.</div>
                        {q.description ? (
                          <div className="text-xs text-foreground/60 mt-2 line-clamp-2">{q.description}</div>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Предпросмотр / Старт */}
      {previewOpen && selected && (
        <div className="fixed inset-0 z-30 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPreviewOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-lg border bg-background p-5 shadow-lg">
            <div className="text-sm font-medium">{selected.title}</div>
            <div className="text-xs text-foreground/60 mt-1">{selected.category || "Без категории"} • {selected.difficulty || "—"} • {selected.question_count} вопросов</div>
            {selected.description ? (
              <div className="text-xs text-foreground/70 mt-3 whitespace-pre-wrap">{selected.description}</div>
            ) : null}

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs flex flex-col gap-1">
                <span className="text-foreground/60">Длительность (сек.)</span>
                <input type="number" min={5} max={600} inputMode="numeric" value={questionDuration} onChange={(e)=>setQuestionDuration(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="30" />
              </label>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setPreviewOpen(false)} className="rounded-md border px-3 py-2 text-xs hover:bg-foreground/10">Отмена</button>
              <button onClick={() => selected && createFromDbQuiz(selected)} disabled={startLoading || !userId} className="rounded-md border px-3 py-2 text-sm bg-foreground text-background hover:opacity-90 disabled:opacity-60">{startLoading ? "Запускаем…" : "Создать комнату"}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
