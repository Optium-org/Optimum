"use client";

import Image from "next/image";

export default function LobbyPage() {
  return (
    <main className="min-h-screen w-full">
      <div className="grid grid-cols-1 min-h-screen">
        <aside className="sticky top-0 h-screen overflow-y-auto bg-background/90 border-r p-4 lg:p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <Image src="/optimum_logo.png" alt="Optimum" width={80} height={80} />
          </div>

          <nav className="space-y-2 text-sm">
            <a className={`${linkBase} ${pathname === "/dashboard" ? linkActive : linkHover} text-foreground`} href="/dashboard">
              <Image src="/dashboard/home.png" alt="Главная" width={16} height={16} className="opacity-80" />
              Главная
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/quizzes" ? linkActive : linkHover}`} href="/dashboard/quizzes">
              <Image src="/dashboard/history.png" alt="История" width={16} height={16} className="opacity-80" />
              Квизы
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/lobby" ? linkActive : linkHover}`} href="/dashboard/lobby">
              <Image src="/dashboard/calendar.png" alt="Календарь" width={16} height={16} className="opacity-80" />
              Лобби
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/friends" ? linkActive : linkHover}`} href="/dashboard/friends">
              <Image src="/dashboard/board.png" alt="Календарь" width={16} height={16} className="opacity-80" />
              Друзья
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/chats" ? linkActive : linkHover}`} href="/dashboard/chats">
              <Image src="/dashboard/subscription.png" alt="Организация" width={16} height={16} className="opacity-80" />
              Чаты
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/subscription" ? linkActive : linkHover}`} href="/dashboard/subscription">
              <Image src="/dashboard/subscription.png" alt="Подписка" width={16} height={16} className="opacity-80" />
              Premium
            </a>
          </nav>

          {/* Блок профиля внизу */}
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
        <div className="sticky top-0 z-10 border-b px-4 lg:px-8 py-4 flex items-center justify-between bg-background/80 backdrop-blur">
          <div className="text-sm text-foreground/80">Лобби</div>
        </div>
        <section className="relative bg-background/80 px-4 lg:px-8 py-8">
          <div className="mx-auto w-full max-w-4xl space-y-4">
            <div className="rounded-lg border bg-background p-5 shadow-sm">
              <div className="text-sm font-medium mb-2">Активные комнаты</div>
              <div className="text-xs text-foreground/60">Скоро здесь появится список комнат в статусе ожидания. Выберите любую, чтобы присоединиться.</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
