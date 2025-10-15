"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import HeroBackground from "@/components/hero-background";

export default function SubscriptionPage() {
  const router = useRouter();
  const pathname = usePathname();

  type Plan = "free" | "pro" | "business";

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>("free");
  const [planUntil, setPlanUntil] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      const meta = data.user.user_metadata || {};
      const full = [meta.first_name, meta.last_name].filter(Boolean).join(" ") || meta.name || meta.full_name || null;
      setDisplayName(full);
      setUserAvatarUrl(meta.avatar_url || meta.picture || null);
      setPlan((meta.plan as Plan) || "free");
      setPlanUntil(meta.plan_until || null);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [router]);

  async function changePlan(next: Plan) {
    setBusy(true);
    const until = next === "free" ? null : new Date(Date.now() + 30*24*60*60*1000).toISOString();
    const { data, error } = await supabase.auth.updateUser({
      data: { plan: next, plan_until: until },
    });
    setBusy(false);
    if (!error && data.user) {
      const meta = data.user.user_metadata || {};
      setPlan((meta.plan as Plan) || next);
      setPlanUntil(meta.plan_until || until);
    }
  }

  const linkBase = "flex items-center gap-3 rounded-none px-3 py-2";
  const linkHover = "hover:bg-foreground/10";
  const linkActive = "bg-foreground/10 text-foreground";

  if (loading) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center">
        <div className="text-sm text-foreground/70">Загрузка…</div>
      </main>
    );
  }

  function PlanCard({ name, subtitle, price, features, value, cta, featured = false }: { name: string; subtitle?: string; price: string; features: string[]; value: Plan; cta: string; featured?: boolean }) {
    const isCurrent = plan === value;
    return (
      <div className={`group relative flex flex-col rounded-none border bg-background/10 p-6 min-h-[420px] transition-colors hover:bg-foreground/5 ${featured ? "ring-1 ring-foreground/20" : ""}`}>
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-foreground/20 via-foreground/60 to-foreground/20 opacity-70" />
        {featured && (
          <span className="absolute right-3 top-3 rounded-none border bg-background/80 px-2 py-[2px] text-[10px]">Рекомендуем</span>
        )}
        <div className="mb-4">
          <div className="text-sm font-semibold">{name}</div>
          {subtitle && <div className="text-xs text-foreground/60 mt-1">{subtitle}</div>}
        </div>
        <div className="mb-5">
          <div className="text-3xl font-bold leading-none">{price}</div>
          {value !== "free" && <div className="text-[11px] text-foreground/60 mt-1">в месяц</div>}
        </div>
        <ul className="text-xs text-foreground/80 space-y-2 mb-6">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-[2px] text-foreground/70"><path d="M20 6L9 17l-5-5"/></svg>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto">
          <button
            disabled={isCurrent || busy}
            onClick={() => changePlan(value)}
            className={`w-full rounded-none border px-3 py-2 text-xs ${isCurrent ? "opacity-60 cursor-default" : "hover:bg-foreground/10"}`}
          >
            {isCurrent ? "Текущий тариф" : cta}
          </button>
        </div>
      </div>
    );
  }

  const planText: Record<Plan, string> = {
    free: "Бесплатный",
    pro: "Pro",
    business: "Business",
  };

  return (
    <main className="min-h-screen w-full">
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] min-h-screen">
        {/* Sidebar */}
        <aside className="sticky top-0 h-screen overflow-y-auto bg-background/90 border-r p-4 lg:p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <Image src="/icons/Optimum_logo.png" alt="Optimum" width={80} height={80} />
          </div>

          <nav className="space-y-2 text-sm">
            <a className={`${linkBase} ${pathname === "/dashboard" ? linkActive : linkHover}`} href="/dashboard">
              <Image src="/dashboard/home.png" alt="Главная" width={16} height={16} className="opacity-80" />
              Главная
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/feed" ? linkActive : linkHover}`} href="/dashboard/feed">
              <Image src="/dashboard/feed.png" alt="Лента" width={16} height={16} className="opacity-80" />
              Лента
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/calendar" ? linkActive : linkHover}`} href="/dashboard/quizzes">
              <Image src="/dashboard/quizzes.png" alt="Квизы" width={16} height={16} className="opacity-80" />
              Квизы
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/board" ? linkActive : linkHover}`} href="/dashboard/friends">
              <Image src="/dashboard/friends.png" alt="Доска" width={16} height={16} className="opacity-80" />
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
          {/* Live background */}
          <HeroBackground className="pointer-events-none absolute inset-0 -z-10" />

          {/* Top bar */}
          <div className="sticky top-0 z-10 border-b px-4 lg:px-8 py-4 flex items-center justify-between bg-background/80 backdrop-blur">
            <div className="text-sm text-foreground/80">Подписка</div>
          </div>

          {/* Center content */}
          <div className="px-4 lg:px-8 py-10 lg:py-16">
            <div className="mx-auto max-w-4xl">
              

              {/* Баннер подписки */}
              <div className="mb-6 rounded-none border overflow-hidden bg-background/10">
                <Image
                  src="/subscription/banner.jpg"
                  alt="Подписка Momentum — больше возможностей"
                  width={1600}
                  height={600}
                  className="w-full h-auto object-cover"
                  priority
                />
                <div className="px-4 py-3 text-xs text-foreground/80 border-t">
                  Оформите подписку и получите расширенные фильтры, экспорт, историю и приоритетную поддержку.
                </div>
              </div>

              {/* Текущий статус */}
              <div className="rounded-none border bg-background/10 p-4 mb-6">
                <div className="text-sm">Текущий тариф: <span className="font-medium">{planText[plan]}</span></div>
                {planUntil && (
                  <div className="text-xs text-foreground/60 mt-1">Оплачено до: {new Date(planUntil).toLocaleString("ru-RU")}</div>
                )}
              </div>

              {/* Карточки тарифов */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <PlanCard
                  name="Free"
                  subtitle="Для старта и тестов"
                  price="0 ₽"
                  value="free"
                  cta="Остаться на Free"
                  features={[
                    "До 100 задач",
                    "Базовые уведомления",
                    "Стандартные фильтры",
                  ]}
                />
                <PlanCard
                  name="Pro"
                  subtitle="Для личной продуктивности"
                  price="399 ₽ / мес"
                  value="pro"
                  cta="Купить Pro"
                  featured
                  features={[
                    "Неограниченно задач",
                    "Расширенные фильтры и теги",
                    "Экспорт/импорт, история",
                  ]}
                />
                <PlanCard
                  name="Business"
                  subtitle="Для команд и бизнеса"
                  price="999 ₽ / мес"
                  value="business"
                  cta="Купить Business"
                  features={[
                    "Командная работа",
                    "Предиктивные напоминания",
                    "Приоритетная поддержка",
                  ]}
                />
              </div>

              {/* Предложение купить подписку */}
              <div className="mt-8 rounded-none border bg-foreground/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="text-sm">Хотите больше возможностей? Оформите подписку и откройте весь функционал Momentum.</div>
                <div className="flex items-center gap-2">
                  <button disabled={busy} onClick={() => changePlan("pro")} className="rounded-none border px-3 py-2 text-xs hover:bg-foreground/10">Купить Pro</button>
                  <button disabled={busy} onClick={() => changePlan("business")} className="rounded-none border px-3 py-2 text-xs hover:bg-foreground/10">Купить Business</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
