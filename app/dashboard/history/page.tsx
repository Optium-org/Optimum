"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Brush,
  ReferenceLine,
} from "recharts";

export default function HistoryPage() {
  const router = useRouter();
  const pathname = usePathname();

  type Priority = "low" | "medium" | "high";
  type Task = {
    id: string;
    user_id: string;
    title: string;
    done: boolean;
    due_date: string | null;
    due_at: string | null;
    priority: Priority | null;
    tags: string[] | null;
    created_at: string;
    updated_at?: string | null;
  };

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

  // filters
  type Status = "all" | "done" | "not_done";
  type Period = "all" | "7" | "30" | "custom";
  const [status, setStatus] = useState<Status>("all");
  const [period, setPeriod] = useState<Period>("30");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [tagFilter, setTagFilter] = useState<string>("");

  // pagination
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [chartData, setChartData] = useState<{ date: string; count: number }[]>([]);
  const [createdGrowth, setCreatedGrowth] = useState<{ date: string; created: number; cumulative: number }[]>([]);
  const [ratio, setRatio] = useState<{ done: number; notDone: number }>({ done: 0, notDone: 0 });
  const [events, setEvents] = useState<
    { type: 'created' | 'done' | 'priority_changed' | 'due_changed'; at: string; title: string; priority?: Priority | null; tags?: string[] | null; from?: any; to?: any }
  >([]);

  type GrowthMetric = 'cumulative' | 'created';
  const [growthMetric, setGrowthMetric] = useState<GrowthMetric>('cumulative');

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
      setUserId(data.user.id);
      const meta = data.user.user_metadata || {};
      const full = [meta.first_name, meta.last_name].filter(Boolean).join(" ") || meta.name || meta.full_name || null;
      setDisplayName(full);
      setUserAvatarUrl(meta.avatar_url || meta.picture || null);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [router]);

  // build filters
  const filterSQL = useMemo(() => {
    const parts: string[] = [];
    if (!userId) return parts;
    parts.push(`user_id=eq.${userId}`);
    if (status === "done") parts.push("done.is.true");
    if (status === "not_done") parts.push("done.is.false");

    const now = new Date();
    const from = (() => {
      if (period === "7") { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
      if (period === "30") { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
      if (period === "custom" && dateFrom) return new Date(`${dateFrom}T00:00:00`);
      return null;
    })();
    const to = (() => {
      if (period === "custom" && dateTo) return new Date(`${dateTo}T23:59:59`);
      return null;
    })();

    // используем created_at как опорную дату для истории
    if (from) parts.push(`created_at.gte.${from.toISOString()}`);
    if (to) parts.push(`created_at.lte.${to.toISOString()}`);

    return parts;
  }, [userId, status, period, dateFrom, dateTo]);

  async function load() {
    if (!userId) return;
    setBusy(true);

    // базовый запрос
    let q = supabase
      .from("tasks")
      .select("id,user_id,title,done,due_date,due_at,priority,tags,created_at,updated_at", { count: "exact" })
      .order("created_at", { ascending: false });

    // фильтры
    for (const f of filterSQL) {
      const [col, op, val] = f.split(".");
      if (op === "is") {
        if (val === "true") q = q.eq(col, true);
        if (val === "false") q = q.eq(col, false);
      } else if (op === "gte") {
        q = q.gte(col, f.split(`${col}.gte.`)[1]);
      } else if (op === "lte") {
        q = q.lte(col, f.split(`${col}.lte.`)[1]);
      } else if (op === "eq") {
        q = q.eq(col, f.split(`${col}.eq.`)[1]);
      }
    }

    const { data, count } = await q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    let list = (data || []) as Task[];
    // клиентские фильтры: поиск/приоритет/теги
    if (priorityFilter !== "all") list = list.filter((t) => (t.priority || null) === priorityFilter);
    if (tagFilter.trim()) {
      const tagNeedle = tagFilter.trim().toLowerCase();
      list = list.filter((t) => (t.tags || []).some((x) => (x || "").toLowerCase().includes(tagNeedle)));
    }
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      list = list.filter((t) => (t.title || "").toLowerCase().includes(needle) || (t.tags || []).some((x) => (x || "").toLowerCase().includes(needle)));
    }
    setTasks(list);
    setTotal(count || 0);
    setBusy(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, status, period, dateFrom, dateTo, page, priorityFilter, tagFilter, query]);

  // построение данных для диаграммы завершений
  useEffect(() => {
    (async () => {
      if (!userId) return;
      // определим диапазон дат
      const now = new Date();
      let from: Date | null = null;
      let to: Date | null = null;
      if (period === "7") { const d = new Date(now); d.setDate(d.getDate() - 7); from = d; }
      else if (period === "30") { const d = new Date(now); d.setDate(d.getDate() - 30); from = d; }
      else if (period === "custom") { if (dateFrom) from = new Date(`${dateFrom}T00:00:00`); if (dateTo) to = new Date(`${dateTo}T23:59:59`); }
      // запрос только выполненных задач
      let q = supabase.from('tasks')
        .select('id,updated_at,created_at,priority,tags,done')
        .eq('user_id', userId)
        .eq('done', true);
      if (from) q = q.gte('updated_at', from.toISOString());
      if (to) q = q.lte('updated_at', (to || now).toISOString());
      const { data } = await q.limit(2000); // ограничим для безопасности
      const rows = (data || []) as { id: string; updated_at?: string | null; created_at: string; priority?: Priority | null; tags?: string[] | null; }[];
      // клиентские фильтры для диаграммы
      let filtered = rows;
      if (priorityFilter !== 'all') filtered = filtered.filter(r => (r.priority || null) === priorityFilter);
      if (tagFilter.trim()) {
        const tagNeedle = tagFilter.trim().toLowerCase();
        filtered = filtered.filter(r => (r.tags || []).some(x => (x || '').toLowerCase().includes(tagNeedle)));
      }
      const map = new Map<string, number>();
      const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      filtered.forEach(r => {
        const d = r.updated_at ? new Date(r.updated_at) : new Date(r.created_at);
        const key = keyOf(d);
        map.set(key, (map.get(key) || 0) + 1);
      });
      // построим последовательность дней
      const days: { date: string; count: number }[] = [];
      let start: Date;
      if (from) start = new Date(from); else { const d = new Date(now); d.setDate(d.getDate() - 30); start = d; }
      const end = to ? new Date(to) : now;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
        days.push({ date: keyOf(d), count: map.get(keyOf(d)) || 0 });
      }
      setChartData(days);

      // График роста: создано по дням и накопление
      let qc = supabase.from('tasks')
        .select('id,created_at,priority,tags,done')
        .eq('user_id', userId);
      if (from) qc = qc.gte('created_at', from.toISOString());
      if (to) qc = qc.lte('created_at', (to || now).toISOString());
      const { data: createdList } = await qc.limit(5000);
      let crows = (createdList || []) as { id:string; created_at:string; priority?: Priority|null; tags?: string[]|null; done?: boolean }[];
      if (priorityFilter !== 'all') crows = crows.filter(r => (r.priority || null) === priorityFilter);
      if (tagFilter.trim()) {
        const n = tagFilter.trim().toLowerCase();
        crows = crows.filter(r => (r.tags || []).some(x => (x || '').toLowerCase().includes(n)));
      }
      const cmap = new Map<string, number>();
      for (const r of crows) {
        const key = keyOf(new Date(r.created_at));
        cmap.set(key, (cmap.get(key) || 0) + 1);
      }
      const growth: { date:string; created:number; cumulative:number }[] = [];
      let acc = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
        const key = keyOf(d);
        const c = cmap.get(key) || 0;
        acc += c;
        growth.push({ date: key, created: c, cumulative: acc });
      }
      setCreatedGrowth(growth);

      // Соотношение выполнено/невыполнено за период (по созданным в период задачам)
      const doneCnt = crows.filter(r => r.done === true).length;
      const notCnt = crows.filter(r => !r.done).length;
      setRatio({ done: doneCnt, notDone: notCnt });

      // Лента событий: создания и закрытия внутри периода
      const ev: { type:'created'|'done'|'priority_changed'|'due_changed'; at:string; title:string; priority?: Priority|null; tags?:string[]|null; from?: any; to?: any }[] = [];
      // для созданий используем выборку crows, но нужно имя — дозапросим заголовки по id
      if (crows.length) {
        const ids = crows.slice(0, 1000).map(x => x.id);
        const { data: createdFull } = await supabase.from('tasks')
          .select('id,title,created_at,priority,tags')
          .in('id', ids);
        (createdFull || []).forEach(r => ev.push({ type: 'created', at: r.created_at as any, title: (r as any).title || '', priority: (r as any).priority, tags: (r as any).tags }));
      }
      // закрытия — filtered rows уже done=true, достанем title по id
      if (filtered.length) {
        const dids = filtered.slice(0, 1000).map(x => (x as any).id);
        const { data: doneFull } = await supabase.from('tasks')
          .select('id,title,updated_at,priority,tags')
          .in('id', dids);
        (doneFull || []).forEach(r => ev.push({ type: 'done', at: (r as any).updated_at || (r as any).created_at, title: (r as any).title || '', priority: (r as any).priority, tags: (r as any).tags }));
      }
      // изменения: пытаемся прочитать task_logs (если таблицы нет — просто проигнорируем)
      try {
        const { data: logs, error: logErr } = await supabase
          .from('task_logs')
          .select('task_id,type,created_at,from,to,task_title')
          .order('created_at', { ascending: false })
          .limit(2000);
        if (!logErr && logs) {
          // применим фильтр периода
          const inRange = (ts: string) => {
            const d = new Date(ts);
            if (from && d < from) return false;
            if (to && d > (to || now)) return false;
            return true;
          };
          for (const row of logs as any[]) {
            if (!inRange(row.created_at)) continue;
            if (row.type === 'priority_changed') {
              ev.push({ type: 'priority_changed', at: row.created_at, title: row.task_title || '', from: row.from, to: row.to });
            } else if (row.type === 'due_changed') {
              ev.push({ type: 'due_changed', at: row.created_at, title: row.task_title || '', from: row.from, to: row.to });
            }
          }
        }
      } catch {}
      ev.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setEvents(ev.slice(0, 200));
    })();
  }, [userId, period, dateFrom, dateTo, priorityFilter, tagFilter]);

  const linkBase = "flex items-center gap-3 rounded-none px-3 py-2";
  const linkHover = "hover:bg-foreground/10";
  const linkActive = "bg-foreground/10 text-foreground";

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function fmtDateTime(due_at: string | null, due_date: string | null) {
    const date = due_at ? new Date(due_at) : due_date ? new Date(`${due_date}T09:00:00`) : null;
    return date ? date.toLocaleString("ru-RU") : "—";
  }

  function exportCSV() {
    const headers = ["id","title","done","due","priority","tags","created_at"];
    const rows = tasks.map((t) => [
      t.id,
      `"${(t.title || "").replace(/"/g, '""')}"`,
      t.done ? "1" : "0",
      fmtDateTime(t.due_at, t.due_date),
      t.priority || "",
      (t.tags || []).join("|"),
      new Date(t.created_at).toLocaleString("ru-RU"),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `history_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Кастомный тултип в стилистике приложения
  const CustomTooltip = ({ active, payload, label, title }: any) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="rounded-none border bg-background/90 text-foreground shadow-xl">
        <div className="px-3 py-2 border-b text-[11px] text-foreground/70">
          {title ? title : `Дата: ${label}`}
        </div>
        <div className="p-2 text-[12px] space-y-1 min-w-[140px]">
          {payload.map((p: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                <span className="text-foreground/80 truncate">{p.name}</span>
              </div>
              <span className="font-medium">{p.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center">
        <div className="text-sm text-foreground/70">Загрузка…</div>
      </main>
    );
  }

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
          {/* Top bar */}
          <div className="sticky top-0 z-10 border-b px-4 lg:px-8 py-4 flex items-center justify-between bg-background/80 backdrop-blur">
            <div className="text-sm text-foreground/80">История</div>
            <div className="flex items-center gap-3">
              <button onClick={exportCSV} className="text-xs rounded-none border px-2 py-1 hover:bg-foreground/10">Экспорт CSV</button>
            </div>
          </div>

          {/* Center content */}
          <div className="px-4 lg:px-8 py-10 lg:py-16">
            <div className="mx-auto max-w-5xl">
              {/* Filters */}
              <div className="rounded-none border bg-background/10 p-4 mb-6">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-foreground/60">Статус:</span>
                  <select className="rounded-none border bg-background px-2 py-1" value={status} onChange={(e)=>{ setPage(1); setStatus(e.target.value as Status); }}>
                    <option value="all">Все</option>
                    <option value="done">Выполненные</option>
                    <option value="not_done">Невыполненные</option>
                  </select>
                  <span className="ml-2 text-foreground/60">Период:</span>
                  <select className="rounded-none border bg-background px-2 py-1" value={period} onChange={(e)=>{ setPage(1); setPeriod(e.target.value as Period); }}>
                    <option value="all">Все время</option>
                    <option value="7">7 дней</option>
                    <option value="30">30 дней</option>
                    <option value="custom">Выбрать даты</option>
                  </select>
                  {period === "custom" && (
                    <>
                      <input type="date" className="rounded-none border bg-background px-2 py-1" value={dateFrom} onChange={(e)=>{ setPage(1); setDateFrom(e.target.value); }} />
                      <input type="date" className="rounded-none border bg-background px-2 py-1" value={dateTo} onChange={(e)=>{ setPage(1); setDateTo(e.target.value); }} />
                    </>
                  )}
                  <span className="ml-2 text-foreground/60">Приоритет:</span>
                  <select className="rounded-none border bg-background px-2 py-1" value={priorityFilter} onChange={(e)=>{ setPage(1); setPriorityFilter(e.target.value as any); }}>
                    <option value="all">Все</option>
                    <option value="low">Низкий</option>
                    <option value="medium">Средний</option>
                    <option value="high">Высокий</option>
                  </select>
                  <span className="ml-2 text-foreground/60">Тег:</span>
                  <input className="rounded-none border bg-background px-2 py-1" placeholder="#тег или часть" value={tagFilter} onChange={(e)=>{ setPage(1); setTagFilter(e.target.value); }} />
                  <input
                    className="ml-auto rounded-none border bg-background px-2 py-1"
                    placeholder="поиск по названию/тегам"
                    value={query}
                    onChange={(e)=>{ setPage(1); setQuery(e.target.value); }}
                  />
                </div>
              </div>

              {/* Growth: создано по дням (накопительный рост) — Recharts AreaChart (сглаженная линия) */}
              <div className="rounded-none border bg-background/10 p-4 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium">Рост задач (накопительно)</div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-foreground/60">Всего: {createdGrowth.at(-1)?.cumulative || 0}</div>
                    <div className="ml-2 flex items-center gap-1 text-[11px]">
                      <button onClick={()=>setGrowthMetric('cumulative')} className={`rounded-none border px-2 py-1 ${growthMetric==='cumulative'?'bg-foreground/10':''}`}>Σ Накопл.</button>
                      <button onClick={()=>setGrowthMetric('created')} className={`rounded-none border px-2 py-1 ${growthMetric==='created'?'bg-foreground/10':''}`}>За день</button>
                    </div>
                  </div>
                </div>
                {createdGrowth.length === 0 ? (
                  <div className="text-xs text-foreground/60">Нет данных</div>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={createdGrowth} margin={{ left: 8, right: 8, top: 4, bottom: 8 }}>
                        <defs>
                          <linearGradient id="colorA" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.35}/>
                            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.05}/>
                          </linearGradient>
                          <linearGradient id="colorB" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.05}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                        <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} hide={true} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} width={28} />
                        <RTooltip content={<CustomTooltip title={growthMetric==='cumulative' ? 'Накопительный рост' : 'Создано за день'} />} formatter={(v:any, n:any)=>[v, n==='cumulative'?'Σ':'За день']} />
                        {/* Основная метрика */}
                        {growthMetric === 'cumulative' ? (
                          <>
                            <Area type="monotone" dataKey="cumulative" stroke="#60a5fa" fill="url(#colorA)" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="created" stroke="#22d3ee" strokeWidth={1} dot={false} />
                          </>
                        ) : (
                          <>
                            <Area type="monotone" dataKey="created" stroke="#22d3ee" fill="url(#colorB)" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="cumulative" stroke="#60a5fa" strokeDasharray="4 4" strokeWidth={1} dot={false} />
                          </>
                        )}
                        <Brush dataKey="date" height={20} travellerWidth={8} stroke="#64748b" fill="#0f172a" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Ratio: выполнено / невыполнено — Recharts BarChart (stacked) */}
              <div className="rounded-none border bg-background/10 p-4 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium">Соотношение: выполнено / открыто</div>
                  <div className="text-xs text-foreground/60">{ratio.done} / {ratio.notDone}</div>
                </div>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[{ name: 'Задачи', done: ratio.done, open: ratio.notDone }]} layout="vertical" margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 12 }} width={56} />
                      <RTooltip content={<CustomTooltip title="Соотношение" />} />
                      <Legend />
                      <defs>
                        {/* мягкий брендовый градиент для выполненных (сине-голубой) */}
                        <linearGradient id="ratioDoneGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.85} />
                          <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.85} />
                        </linearGradient>
                        {/* мягкий фиолетовый для открытых, без агрессивного красного */}
                        <linearGradient id="ratioOpenGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.85} />
                          <stop offset="100%" stopColor="#818cf8" stopOpacity={0.85} />
                        </linearGradient>
                      </defs>
                      <Bar
                        isAnimationActive
                        animationDuration={600}
                        dataKey="done"
                        stackId="a"
                        name="Выполнено"
                        fill="url(#ratioDoneGrad)"
                        radius={[6,6,6,6]}
                        stroke="rgba(148,163,184,0.35)"
                        strokeWidth={1}
                      />
                      <Bar
                        isAnimationActive
                        animationDuration={600}
                        dataKey="open"
                        stackId="a"
                        name="Открыто"
                        fill="url(#ratioOpenGrad)"
                        radius={[6,6,6,6]}
                        stroke="rgba(148,163,184,0.35)"
                        strokeWidth={1}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart: завершения по дням — Recharts BarChart */}
              <div className="rounded-none border bg-background/10 p-4 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium">Завершения по дням</div>
                  <div className="text-xs text-foreground/60">{chartData.reduce((a,b)=>a+b.count,0)} завершений</div>
                </div>
                {chartData.length === 0 ? (
                  <div className="text-xs text-foreground/60">Нет данных для выбранного периода</div>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                        <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} hide={true} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} width={28} />
                        <RTooltip content={<CustomTooltip title="Завершения по дням" />} />
                        <Bar dataKey="count" name="Завершено" fill="rgba(99,102,241,0.9)" radius={[4,4,0,0]} />
                        <Brush dataKey="date" height={20} travellerWidth={8} stroke="#64748b" fill="#0f172a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* List */}
              <div className="rounded-none border bg-background/10">
                {busy ? (
                  <div className="px-4 py-6 text-sm text-foreground/60">Загрузка…</div>
                ) : tasks.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-foreground/60">Ничего не найдено</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-foreground/60">
                          <th className="text-left px-4 py-2">Название</th>
                          <th className="text-left px-4 py-2">Статус</th>
                          <th className="text-left px-4 py-2">Дедлайн</th>
                          <th className="text-left px-4 py-2">Приоритет</th>
                          <th className="text-left px-4 py-2">Теги</th>
                          <th className="text-left px-4 py-2">Создана</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.map((t) => (
                          <tr key={t.id} className="border-b hover:bg-foreground/5">
                            <td className="px-4 py-2 max-w-[360px] truncate">{t.title}</td>
                            <td className="px-4 py-2">
                              {t.done ? <span className="rounded-none border px-2 py-[2px] text-[10px]">Готово</span> : <span className="rounded-none border px-2 py-[2px] text-[10px]">Открыта</span>}
                            </td>
                            <td className="px-4 py-2">{fmtDateTime(t.due_at, t.due_date)}</td>
                            <td className="px-4 py-2">{t.priority || "—"}</td>
                            <td className="px-4 py-2">
                              {(t.tags || []).length ? (t.tags || []).map((x) => <span key={x} className="mr-1 rounded-none border px-1 py-[2px] text-[10px]">#{x}</span>) : "—"}
                            </td>
                            <td className="px-4 py-2">{new Date(t.created_at).toLocaleString("ru-RU")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-3 text-xs">
                  <div className="text-foreground/60">Стр. {page} из {totalPages} ({total} шт.)</div>
                  <div className="flex items-center gap-2">
                    <button disabled={page <= 1 || busy} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-none border px-2 py-1 hover:bg-foreground/10 disabled:opacity-50">Назад</button>
                    <button disabled={page >= totalPages || busy} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-none border px-2 py-1 hover:bg-foreground/10 disabled:opacity-50">Вперёд</button>
                  </div>
                </div>
              </div>

              {/* Event feed (создание/закрытие/изменения) */}
              <div className="rounded-none border bg-background/10 p-4 mt-6">
                <div className="text-sm font-medium mb-3">Лента событий</div>
                {events.length === 0 ? (
                  <div className="text-xs text-foreground/60">Нет событий за выбранный период</div>
                ) : (
                  <div className="space-y-2">
                    {events.map((ev, idx) => {
                      const color = ev.type==='done' ? 'bg-green-500' : ev.type==='created' ? 'bg-foreground/60' : ev.type==='priority_changed' ? 'bg-yellow-500' : 'bg-sky-500';
                      const label = ev.type==='done' ? 'Задача выполнена' : ev.type==='created' ? 'Задача создана' : ev.type==='priority_changed' ? 'Изменён приоритет' : 'Изменён дедлайн';
                      return (
                        <div key={idx} className="flex items-start gap-3 rounded-none border bg-background px-3 py-2">
                          <span className={`mt-[2px] inline-block h-2.5 w-2.5 rounded-full ${color}`} />
                          <div className="min-w-0">
                            <div className="text-sm truncate">{ev.title || 'Без названия'}</div>
                            <div className="text-[10px] text-foreground/60">
                              {new Date(ev.at).toLocaleString('ru-RU')} — {label}
                              {(ev.type==='priority_changed' || ev.type==='due_changed') && (ev.from!==undefined || ev.to!==undefined) ? (
                                <>
                                  {" "}({String(ev.from ?? '—')} → {String(ev.to ?? '—')})
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
