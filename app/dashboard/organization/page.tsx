"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

/**
 * Предполагаемая схема БД (Supabase):
 *
 * orgs: { id: uuid (pk), name: text, owner_id: uuid, created_at timestamptz default now() }
 * org_members: { org_id uuid, user_id uuid, role text, created_at timestamptz, UNIQUE(org_id,user_id) }
 * org_invites: { id uuid (pk), org_id uuid, email text, role text, token text, status text, created_at timestamptz }
 *
 * RLS-примеры:
 * - orgs: пользователь видит организации, где он owner или участник (через security definer view или политики по подзапросу в org_members)
 * - org_members: пользователь видит записи, где user_id = auth.uid()
 * - org_invites: видимость владельцу/мейнтейнерам организации
 */

export default function OrganizationPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

  // данные
  type Org = { id: string; name: string; owner_id: string; avatar_url?: string | null; description?: string | null };
  type Member = { org_id: string; user_id: string; role: string };
  type Invite = { id: string; org_id: string; email: string; role: string; status: string };

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [membersByOrg, setMembersByOrg] = useState<Record<string, Member[]>>({});
  const [invitesByOrg, setInvitesByOrg] = useState<Record<string, Invite[]>>({});

  // ошибки схемы
  const [schemaMissing, setSchemaMissing] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!data.user) { router.replace("/login"); return; }
      setEmail(data.user.email ?? null);
      setUserId(data.user.id);
      const meta = data.user.user_metadata || {};
      const full = [meta.first_name, meta.last_name].filter(Boolean).join(" ") || meta.name || meta.full_name || null;
      setDisplayName(full);
      setUserAvatarUrl(meta.avatar_url || meta.picture || null);
      try {
        await loadData(data.user.id);
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [router]);

  async function loadData(uid: string) {
    setSchemaMissing(null);
    // 1) получим организации, где пользователь участник или владелец
    try {
      const { data: mem, error: mErr } = await supabase
        .from("org_members")
        .select("org_id, user_id, role")
        .eq("user_id", uid);
      if (mErr) throw mErr;
      const orgIds = Array.from(new Set((mem || []).map((m) => m.org_id)));
      const { data: owned, error: oErr } = await supabase
        .from("orgs")
        .select("id, name, owner_id, avatar_url, description")
        .or([`owner_id.eq.${uid}`, orgIds.length ? `id.in.(${orgIds.join(',')})` : "id.eq.null"].join(","));
      if (oErr) throw oErr;
      setOrgs((owned || []) as Org[]);
      setMembersByOrg(groupBy((mem || []) as Member[], (x) => x.org_id));

      // инвайты по всем оргам пользователя (если он owner — увидит свои инвайты)
      if ((owned || []).length) {
        const ids = (owned || []).map((o) => o.id);
        const { data: inv, error: iErr } = await supabase
          .from("org_invites")
          .select("id, org_id, email, role, status")
          .in("org_id", ids);
        if (!iErr) setInvitesByOrg(groupBy((inv || []) as Invite[], (x) => x.org_id));
      }
    } catch (e: any) {
      // если таблицы не существуют — покажем инструкцию
      if (String(e?.message || e).toLowerCase().includes("relation") || String(e?.message || e).toLowerCase().includes("does not exist")) {
        setSchemaMissing("Похоже, что таблицы организаций ещё не созданы.");
      }
    }
  }

  function groupBy<T>(arr: T[], key: (x: T) => string) {
    return arr.reduce((acc: Record<string, T[]>, item) => {
      const k = key(item);
      if (!acc[k]) acc[k] = [];
      acc[k].push(item);
      return acc;
    }, {});
  }

  const schemaHelp = useMemo(() => (
    <div className="rounded-none border bg-background/10 p-4 text-sm">
      <div className="font-medium mb-2">Схема БД для организаций (Supabase)</div>
      <pre className="text-xs whitespace-pre-wrap">
{`-- orgs
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- org_members
create table if not exists public.org_members (
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique(org_id, user_id)
);

-- org_invites
create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  email text not null,
  role text not null default 'member',
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- Пример RLS (упростить под ваши потребности)
-- org_members: пользователь видит только свои записи
alter table public.org_members enable row level security;
create policy org_members_self on public.org_members
  for select using (user_id = auth.uid());

-- orgs: видимость через membership или владение (можно оформить иначе)
alter table public.orgs enable row level security;
create policy orgs_owner_only on public.orgs for select using (
  owner_id = auth.uid()
);

-- org_invites: показывать владельцу (можно расширить для админов)
alter table public.org_invites enable row level security;
create policy org_invites_owner on public.org_invites for select using (
  exists(select 1 from public.orgs o where o.id = org_invites.org_id and o.owner_id = auth.uid())
);
`}
      </pre>
    </div>
  ), []);

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
            <a className={`${linkBase} ${pathname === "/dashboard" ? linkActive : linkHover} text-foreground`} href="/dashboard">
              <Image src="/dashboard/home.png" alt="Главная" width={16} height={16} className="opacity-80" />
              Главная
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/history" ? linkActive : linkHover}`} href="/dashboard/history">
              <Image src="/dashboard/history.png" alt="История" width={16} height={16} className="opacity-80" />
              История
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/calendar" ? linkActive : linkHover}`} href="/dashboard/calendar">
              <Image src="/dashboard/calendar.png" alt="Календарь" width={16} height={16} className="opacity-80" />
              Календарь
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/board" ? linkActive : linkHover}`} href="/dashboard/board">
              <Image src="/dashboard/board.png" alt="Доска" width={16} height={16} className="opacity-80" />
              Доска
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/organization" ? linkActive : linkHover}`} href="/dashboard/organization">
              <Image src="/dashboard/organization.png" alt="Организация" width={16} height={16} className="opacity-80" />
              Организация
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/subscription" ? linkActive : linkHover}`} href="/dashboard/subscription">
              <Image src="/dashboard/subscription.png" alt="Подписка" width={16} height={16} className="opacity-80" />
              Подписка
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

        {/* Content */}
        <section className="relative bg-background/80">
          {/* Hero */}
          <div className="px-4 lg:px-8 pt-6 pb-4 border-b bg-background/80">
            <div className="flex items-center gap-4">
              <div className="text-sm text-foreground/80">Организации</div>
            </div>
          </div>

          <div className="px-4 lg:px-8 py-10 lg:py-16">
            <div className="mx-auto max-w-4xl">
              <div className="mb-4 rounded-none border overflow-hidden bg-background/10">
                <Image
                  src="/organization/banner.png"
                  alt="Организации Momentum — работайте вместе"
                  width={1600}
                  height={600}
                  className="w-full h-auto object-cover"
                  priority
                />
                <div className="px-4 py-3 text-xs text-foreground/80 border-t">
                  Создайте организацию и получите возможность добавлять участников, создавать задачи и получать уведомления.
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 lg:px-8 pt-4 pb-8 space-y-5">
            {/* CTA */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-foreground/70">Управляйте вашими рабочими пространствами.</div>
              <a href="/dashboard/organization/create" className="inline-flex items-center gap-2 rounded-none border px-3 py-2 text-xs hover:bg-foreground/10">
                <Image src="/dashboard/home.png" alt="Создать" width={16} height={16} className="opacity-80" />
                Создать организацию
              </a>
            </div>

            {/* Список организаций */}
            <div className="rounded-none border bg-background p-5">
              <div className="flex items-center gap-3 mb-1">
                <Image src="/dashboard/calendar.png" alt="Список" width={24} height={24} className="opacity-80" />
                <div className="text-sm font-medium">Мои организации</div>
              </div>
              <div className="text-xs text-foreground/60 mb-3">Список ваших организаций и ваша роль в каждой.</div>
              {schemaMissing && (
                <div className="mb-4 text-xs text-foreground/80">
                  {schemaMissing}
                  <div className="mt-2">Создайте таблицы согласно инструкции ниже и обновите страницу.</div>
                </div>
              )}
              {loading ? (
                <div className="text-sm">Загрузка…</div>
              ) : orgs.length === 0 ? (
                <div className="text-sm text-foreground/70">Вы не состоите ни в одной организации.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {orgs.map((o) => {
                    const myRole = (membersByOrg[o.id] && membersByOrg[o.id][0]?.role) || (o.owner_id === userId ? 'owner' : 'member');
                    return (
                      <a key={o.id} href={`/dashboard/organization/${o.id}`} className="group block rounded-none border bg-background p-4 hover:bg-foreground/5 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-sm border bg-foreground/10 flex items-center justify-center overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {o.avatar_url ? (
                              <img src={o.avatar_url} alt={o.name} className="h-full w-full object-cover" />
                            ) : (
                              <Image src="/dashboard/organization.png" alt="Орг" width={20} height={20} className="opacity-80" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium truncate">{o.name}</div>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-none border bg-background/60 text-foreground/80">{myRole}</span>
                            </div>
                            {o.description && (
                              <div className="text-[11px] text-foreground/60 mt-0.5 line-clamp-2">{o.description}</div>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[11px] text-foreground/60">
                          <span className="opacity-80">Открыть</span>
                          <span className="opacity-60 group-hover:opacity-80">→</span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
