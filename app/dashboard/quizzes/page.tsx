"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";

export default function QuizzesPage() {
  const router = useRouter();
  const pathname = usePathname();

  // Текущий пользователь
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userVerified, setUserVerified] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [uiError, setUiError] = useState<string | null>(null);
  const [uiSuccess, setUiSuccess] = useState<string | null>(null);

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
            <a className={`${linkBase} ${pathname === "/dashboard/quizzes" ? linkActive : linkHover}`} href="/dashboard/feed">
              <Image src="/dashboard/feed.png" alt="История" width={16} height={16} className="opacity-80" />
              Лента
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/quizzes" ? linkActive : linkHover}`} href="/dashboard/quizzes">
              <Image src="/dashboard/quizzes.png" alt="История" width={16} height={16} className="opacity-80" />
              Квизы
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
            <div className="text-sm text-foreground/80">Квизы</div>
          </div>

          {/* Hero */}
          <div className="border-b bg-background/10">
            <div className="px-4 lg:px-8 py-6">
              <div className="mx-auto w-full max-w-4xl">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-md border bg-foreground/10 flex items-center justify-center text-lg">🧠</div>
                  <div className="min-w-0">
                    <div className="text-base sm:text-lg font-semibold">Создавайте комнаты и соревнуйтесь с друзьями в реальном времени</div>
                    <div className="text-xs text-foreground/70 mt-1">Сгенерируем код комнаты, подготовим вопросы и запустим таймер. Присоединяйтесь по коду и отвечайте быстрее соперников.</div>
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

              {/* Карточки выбора источника квиза */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* AI сборка квиза */}
                <a href="/dashboard/quizzes/ai" className="group rounded-lg border bg-background p-5 shadow-sm hover:bg-foreground/5 transition">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-md border bg-foreground/10 flex items-center justify-center text-lg">🤖</div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold flex items-center gap-2">
                        AI сборка квиза
                        <span className="text-[10px] rounded-md border bg-background/60 px-1.5 py-[2px] text-foreground/70">Рекомендуется</span>
                      </div>
                      <div className="text-xs text-foreground/70 mt-1">Автоматически сгенерируем вопросы по теме и сложности. Настройки на следующей странице.</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <span className="inline-flex items-center gap-1 text-xs text-foreground/80 group-hover:underline">
                      Открыть настройки AI
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    </span>
                  </div>
                </a>

                {/* Квизы из базы данных */}
                <a href="/dashboard/quizzes/db" className="group rounded-lg border bg-background p-5 shadow-sm hover:bg-foreground/5 transition">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-md border bg-foreground/10 flex items-center justify-center text-lg">📚</div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Квизы из базы данных</div>
                      <div className="text-xs text-foreground/70 mt-1">Выбирайте готовые подборки вопросов из внешнего API или предварительно загруженной базы.</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <span className="inline-flex items-center gap-1 text-xs text-foreground/80 group-hover:underline">
                      Смотреть подборки
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    </span>
                  </div>
                </a>
              </div>

              {/* Подсказки */}
              <div className="rounded-lg border bg-background p-5 shadow-sm">
                <div className="text-sm font-medium mb-2">Подсказки</div>
                <ul className="text-xs text-foreground/70 list-disc pl-5 space-y-1">
                  <li>Создайте комнату и отправьте код друзьям.</li>
                  <li>Хост запускает вопросы, у игроков идёт таймер.</li>
                  <li>За правильные ответы начисляются баллы — в конце покажем таблицу лидеров.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
