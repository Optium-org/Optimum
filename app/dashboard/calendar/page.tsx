"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

function ruMonthYear(d: Date) {
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(d);
}

function getMonthMatrix(base: Date) {
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // понедельник=0
  const start = new Date(year, month, 1 - startOffset);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function fmtDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type MiniTask = { id: string; title: string; priority: "low"|"medium"|"high"|null; done: boolean; due_at: string | null };

export default function CalendarPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(() => new Date().getFullYear());

  const matrix = useMemo(() => getMonthMatrix(currentMonth), [currentMonth]);
  const monthLabel = useMemo(() => ruMonthYear(currentMonth), [currentMonth]);
  const monthNames = [
    "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
    "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
  ];
  const today = new Date();

  const [tasksByDate, setTasksByDate] = useState<Record<string, MiniTask[]>>({});
  const [detailsKey, setDetailsKey] = useState<string | null>(null);
  type ViewMode = "month" | "week" | "day";
  const [view, setView] = useState<ViewMode>("month");
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [qaTitle, setQaTitle] = useState("");
  const [qaTime, setQaTime] = useState(""); // HH:MM
  const [qaPriority, setQaPriority] = useState<"low"|"medium"|"high"|"">("");
  const [qaTags, setQaTags] = useState(""); // comma separated
  const [qaBusy, setQaBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all'|'active'|'done'>('all');
  const [editOpen, setEditOpen] = useState(false);
  const [etId, setEtId] = useState<string | null>(null);
  const [etTitle, setEtTitle] = useState("");
  const [etTime, setEtTime] = useState(""); // HH:MM
  const [etPriority, setEtPriority] = useState<"low"|"medium"|"high"|"">("");
  const [etTags, setEtTags] = useState("");
  const [etBusy, setEtBusy] = useState(false);

  const doneSfxRef = useRef<HTMLAudioElement | null>(null);
  const sfxPlayedRef = useRef(false);

  const [prefTgEnabled, setPrefTgEnabled] = useState<boolean>(false);
  const [prefTgChatId, setPrefTgChatId] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    // Инициализация звука завершения задачи
    try {
      doneSfxRef.current = typeof Audio !== 'undefined' ? new Audio('/sounds/done.mp3') : null;
      if (doneSfxRef.current) {
        doneSfxRef.current.volume = 0.8;
        // Предзагрузка для надёжности
        try { doneSfxRef.current.preload = 'auto'; doneSfxRef.current.load(); } catch {}
      }
    } catch {}
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
      setPrefTgEnabled(!!meta.pref_tg_enabled);
      setPrefTgChatId(meta.pref_tg_chat_id || "");
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) router.replace("/login");
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!userId) return;
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 1);
    const startDate = fmtDate(start);
    const endDate = fmtDate(end);

    (async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,priority,due_date,due_at,done")
        .eq("user_id", userId)
        .or(
          `and(due_at.gte.${start.toISOString()},due_at.lt.${end.toISOString()}),and(due_date.gte.${startDate},due_date.lt.${endDate})`
        );
      if (error || !data) {
        setTasksByDate({});
        return;
      }
      const map: Record<string, MiniTask[]> = {};
      for (const t of data as any[]) {
        const iso = t.due_at ? new Date(t.due_at) : t.due_date ? new Date(`${t.due_date}T00:00:00`) : null;
        if (!iso) continue;
        const key = fmtDate(iso);
        if (!map[key]) map[key] = [];
        map[key].push({ id: t.id, title: t.title, priority: t.priority, done: !!t.done, due_at: t.due_at });
      }
      // для стабильности отображения: сортируем по приоритету и названию
      Object.keys(map).forEach((k) => {
        map[k].sort((a, b) => {
          const prioOrder = { high: 0, medium: 1, low: 2, null: 3 } as any;
          const pa = prioOrder[(a.priority as any) ?? 'null'];
          const pb = prioOrder[(b.priority as any) ?? 'null'];
          if (pa !== pb) return pa - pb;
          return a.title.localeCompare(b.title, 'ru');
        });
      });
      setTasksByDate(map);
    })();
  }, [userId, currentMonth]);

  function timeLabel(iso: string | null) {
    if (!iso) return null;
    const d = new Date(iso);
    const HH = String(d.getHours()).padStart(2, '0');
    const MM = String(d.getMinutes()).padStart(2, '0');
    return `${HH}:${MM}`;
  }

  async function moveTaskToDate(taskId: string, sourceDueAt: string | null, targetDate: Date) {
    // сохраняем время из sourceDueAt, если было; иначе 09:00
    const tHH = sourceDueAt ? String(new Date(sourceDueAt).getHours()).padStart(2, '0') : '09';
    const tMM = sourceDueAt ? String(new Date(sourceDueAt).getMinutes()).padStart(2, '0') : '00';
    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const newIso = `${yyyy}-${mm}-${dd}T${tHH}:${tMM}:00`;
    const newKey = `${yyyy}-${mm}-${dd}`;
    const { error } = await supabase.from('tasks').update({ due_at: newIso, due_date: `${yyyy}-${mm}-${dd}` }).eq('id', taskId);
    if (!error) {
      // Перемещаем в локальном состоянии
      setTasksByDate((prev) => {
        const copy: Record<string, MiniTask[]> = {}; Object.keys(prev).forEach(k => copy[k] = [...prev[k]]);
        // найти старый ключ по наличию задачи
        let oldKey: string | null = null; let cached: MiniTask | null = null;
        for (const k of Object.keys(copy)) {
          const idx = copy[k].findIndex((t) => t.id === taskId);
          if (idx !== -1) { cached = copy[k][idx]; copy[k].splice(idx, 1); oldKey = k; break; }
        }
        const next: MiniTask = cached ? { ...cached, due_at: newIso } : { id: taskId, title: "", priority: null, done: false, due_at: newIso };
        if (!copy[newKey]) copy[newKey] = [];
        copy[newKey].push(next);
        return copy;
      });
    }
  }

  async function tryPlayDoneSfx(): Promise<boolean> {
    const playFrom = async (el: HTMLAudioElement) => {
      try { el.currentTime = 0; await el.play(); return true; } catch { return false; }
    };
    // 1) пробуем через подготовленный ref
    if (doneSfxRef.current) {
      const ok = await playFrom(doneSfxRef.current);
      if (ok) { sfxPlayedRef.current = true; return true; }
    }
    // 2) fallback: создать временный Audio и проиграть
    try {
      const a = new Audio('/sounds/done.mp3');
      a.volume = 0.8;
      await a.play();
      sfxPlayedRef.current = true;
      return true;
    } catch (e) {
      console.warn('SFX fallback error', e);
      sfxPlayedRef.current = false;
      return false;
    }
  }

  async function fireConfetti() {
    try {
      const confetti = (await import('canvas-confetti')).default;
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        scalar: 0.9,
        disableForReducedMotion: true,
      });
    } catch (e) {
      // опционально можно залогировать
    }
  }

  function handleToggleDoneClick(dateKey: string, task: MiniTask) {
    const nextDone = !task.done;
    // Пытаемся проиграть звук сразу по клику (пока сохраняется пользовательский жест)
    if (nextDone) tryPlayDoneSfx();
    toggleDoneQuick(dateKey, task);
  }

  async function toggleDoneQuick(dateKey: string, task: MiniTask) {
    const nextDone = !task.done;
    const { error } = await supabase.from('tasks').update({ done: nextDone }).eq('id', task.id);
    if (!error) {
      setTasksByDate((prev) => {
        const copy = { ...prev };
        const arr = (copy[dateKey] || []).map((t) => t.id === task.id ? { ...t, done: nextDone } : t);
        copy[dateKey] = arr;
        return copy;
      });
      // Проигрываем звук и показываем конфетти только при установке статуса в выполнено
      if (nextDone) {
        if (!sfxPlayedRef.current && doneSfxRef.current) {
          try { doneSfxRef.current.currentTime = 0; await doneSfxRef.current.play(); } catch {}
        }
        sfxPlayedRef.current = false;
        fireConfetti();
        // telegram: уведомление о завершении
        const dueStr = task.due_at ? new Date(task.due_at).toLocaleString('ru-RU') : new Date(`${dateKey}T09:00:00`).toLocaleString('ru-RU');
        const pr = task.priority ? `\nПриоритет: ${task.priority}` : '';
        sendTg(`✅ Задача выполнена:\n<b>${task.title}</b>\nСрок: ${dueStr}${pr}`);
      }
    }
  }

  async function quickAddSubmit() {
    if (!userId) return;
    const base = selected || today;
    const yyyy = base.getFullYear();
    const mm = String(base.getMonth() + 1).padStart(2, '0');
    const dd = String(base.getDate()).padStart(2, '0');
    const dateKey = `${yyyy}-${mm}-${dd}`;
    const hasTime = qaTime.trim().length >= 4;
    const [h, m] = hasTime ? qaTime.split(":") : ["09", "00"];
    const due_at = hasTime ? `${dateKey}T${h}:${m}:00` : null;
    const due_date = dateKey;
    const priority = qaPriority || null;
    const tags = qaTags.split(",").map(s => s.trim()).filter(Boolean);
    if (!qaTitle.trim()) return;
    setQaBusy(true);
    const { data, error } = await supabase.from('tasks').insert({
      user_id: userId,
      title: qaTitle.trim(),
      done: false,
      due_date,
      due_at,
      priority,
      tags: tags.length ? tags : null,
    }).select('id').single();
    setQaBusy(false);
    if (!error && data) {
      // обновим локально календарь
      setTasksByDate((prev) => {
        const copy = { ...prev };
        const arr = copy[dateKey] ? [...copy[dateKey]] : [];
        arr.push({ id: data.id, title: qaTitle.trim(), priority: priority as any, done: false, due_at });
        // простая сортировка как при загрузке: по приоритету, потом по названию
        const prio = { high: 0, medium: 1, low: 2, null: 3 } as any;
        arr.sort((a, b) => {
          const pa = prio[(a.priority as any) ?? 'null'];
          const pb = prio[(b.priority as any) ?? 'null'];
          if (pa !== pb) return pa - pb;
          return a.title.localeCompare(b.title, 'ru');
        });
        copy[dateKey] = arr;
        return copy;
      });
      setQuickOpen(false);
      setQaTitle(""); setQaTime(""); setQaPriority(""); setQaTags("");
      // telegram: уведомление о создании
      const dueStr = due_at ? new Date(due_at).toLocaleString('ru-RU') : new Date(`${dateKey}T09:00:00`).toLocaleString('ru-RU');
      const pr = qaPriority ? `\nПриоритет: ${qaPriority}` : '';
      const tg = tags.length ? `\nТеги: ${tags.map(t=>`#${t}`).join(' ')}` : '';
      sendTg(`🆕 Создана задача:\n<b>${qaTitle.trim()}</b>\nСрок: ${dueStr}${pr}${tg}`);
    }
  }

  async function sendTg(text: string) {
    try {
      if (!prefTgEnabled || !prefTgChatId) return;
      await fetch('/api/telegram/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: prefTgChatId, text }) });
    } catch {}
  }

  function openEdit(dateKey: string, task: MiniTask) {
    setEtId(task.id);
    setEtTitle(task.title);
    // предзаполним время из due_at если есть
    if (task.due_at) {
      try { const d = new Date(task.due_at); setEtTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`);} catch { setEtTime(""); }
    } else setEtTime("");
    setEtPriority((task.priority as any) || "");
    setEtTags(""); // не всегда есть в MiniTask — позволим вводить заново
    setEditOpen(true);
  }

  async function submitEdit() {
    if (!etId) return;
    setEtBusy(true);
    const base = selected || today;
    const yyyy = base.getFullYear();
    const mm = String(base.getMonth() + 1).padStart(2, '0');
    const dd = String(base.getDate()).padStart(2, '0');
    const dateKey = `${yyyy}-${mm}-${dd}`;
    const hasTime = etTime.trim().length >= 4;
    const [h, m] = hasTime ? etTime.split(":") : ["09", "00"];
    const due_at = hasTime ? `${dateKey}T${h}:${m}:00` : null;
    const tags = etTags.split(',').map(s=>s.trim()).filter(Boolean);
    const upd: any = { title: etTitle.trim() };
    upd.priority = etPriority || null;
    upd.due_at = due_at;
    if (tags.length) upd.tags = tags; else upd.tags = null;
    const { error } = await supabase.from('tasks').update(upd).eq('id', etId);
    setEtBusy(false);
    if (!error) {
      setTasksByDate(prev => {
        const copy = { ...prev };
        const arr = (copy[dateKey] || []).map(t => t.id === etId ? { ...t, title: etTitle.trim(), priority: (etPriority as any)||null, due_at } : t);
        // пересортируем как в quickAdd
        const prio = { high: 0, medium: 1, low: 2, null: 3 } as any;
        arr.sort((a, b) => {
          const pa = prio[(a.priority as any) ?? 'null'];
          const pb = prio[(b.priority as any) ?? 'null'];
          if (pa !== pb) return pa - pb;
          return a.title.localeCompare(b.title, 'ru');
        });
        copy[dateKey] = arr;
        return copy;
      });
      setEditOpen(false);
    }
  }

  async function deleteTask(dateKey: string, task: MiniTask) {
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (!error) {
      setTasksByDate(prev => {
        const copy = { ...prev };
        copy[dateKey] = (copy[dateKey] || []).filter(t => t.id !== task.id);
        return copy;
      });
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center">
        <div className="text-sm text-foreground/70">Загрузка…</div>
      </main>
    );
  }

  const linkBase = "flex items-center gap-3 rounded-none px-3 py-2";
  const linkHover = "hover:bg-foreground/10";
  const linkActive = "bg-foreground/10 text-foreground";

  function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function prevMonth() {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }
  function nextMonth() {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }

  function openPicker() {
    setPickerYear(currentMonth.getFullYear());
    setPickerOpen((v) => !v);
  }
  function applyMonth(mIndex: number) {
    setCurrentMonth(new Date(pickerYear, mIndex, 1));
    setPickerOpen(false);
  }
  function yearDown() {
    setPickerYear((y) => y - 1);
  }
  function yearUp() {
    setPickerYear((y) => y + 1);
  }

  const weekdayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

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
              <Image src="/dashboard/board.png" alt="Календарь" width={16} height={16} className="opacity-80" />
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

          {/* Профиль снизу */}
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
            <div className="text-sm text-foreground/80">Календарь</div>
            <div className="relative flex items-center gap-2">
              <button onClick={() => setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1))} className="px-3 py-1 rounded-none border hover:bg-foreground/10 text-sm">Сегодня</button>
              <button
                onClick={prevMonth}
                className="inline-flex h-8 w-8 items-center justify-center rounded-none border hover:bg-foreground/10"
                aria-label="Предыдущий месяц"
                title="Предыдущий месяц"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button onClick={openPicker} className="text-sm font-medium min-w-40 text-center capitalize px-2 py-1 rounded-none border hover:bg-foreground/10">
                {monthLabel}
              </button>
              <button
                onClick={nextMonth}
                className="inline-flex h-8 w-8 items-center justify-center rounded-none border hover:bg-foreground/10"
                aria-label="Следующий месяц"
                title="Следующий месяц"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>

              {pickerOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 rounded-none border bg-background shadow-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={yearDown} className="px-2 py-1 rounded-none border hover:bg-foreground/10 text-xs">−</button>
                    <input
                      type="number"
                      value={pickerYear}
                      onChange={(e) => setPickerYear(parseInt(e.target.value || `${new Date().getFullYear()}`, 10))}
                      className="w-24 text-center rounded-none border bg-background/10 px-2 py-1 text-sm outline-none"
                    />
                    <button onClick={yearUp} className="px-2 py-1 rounded-none border hover:bg-foreground/10 text-xs">+</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {monthNames.map((name, idx) => (
                      <button
                        key={name}
                        onClick={() => applyMonth(idx)}
                        className="px-2 py-2 text-sm rounded-none border hover:bg-foreground/10"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="ml-4 flex items-center gap-1 text-xs">
                <button onClick={() => setView('month')} className={`rounded-none border px-2 py-1 ${view==='month' ? 'bg-foreground/10' : 'hover:bg-foreground/10'}`}>Месяц</button>
                <button onClick={() => setView('week')} className={`rounded-none border px-2 py-1 ${view==='week' ? 'bg-foreground/10' : 'hover:bg-foreground/10'}`}>Неделя</button>
                <button onClick={() => setView('day')} className={`rounded-none border px-2 py-1 ${view==='day' ? 'bg-foreground/10' : 'hover:bg-foreground/10'}`}>День</button>
              </div>
            </div>
          </div>

          {/* Calendar grid + sidebar */}
          <div className="px-4 lg:px-8 py-8">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-8">
              {/* Calendar */}
              <div className="rounded-none border bg-background/10 p-4">
                {/* Weekday header */}
                <div className="grid grid-cols-7 text-xs text-foreground/60 mb-2 select-none">
                  {weekdayLabels.map((w, idx) => (
                    <div key={w} className={`px-2 py-2 text-center ${idx>=5 ? 'text-foreground/80' : ''}`}>{w}</div>
                  ))}
                </div>
                {/* Days */}
                {view === 'month' && (
                  <div className="grid grid-cols-7 gap-2">
                    {matrix.map((d, i) => {
                      const inMonth = d.getMonth() === currentMonth.getMonth();
                      const isToday = isSameDay(d, today);
                      const isSelected = selected && isSameDay(d, selected);
                      const key = fmtDate(d);
                      const list = tasksByDate[key] || [];
                      const titleTip = list.length ? list.map((t) => `• ${t.title}`).join("\n") : undefined;
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <button
                          key={i}
                          onClick={() => { setSelected(new Date(d)); }}
                          className={[
                            "h-28 w-full text-left overflow-hidden transition-colors",
                            "rounded-md border px-2 py-1.5",
                            inMonth ? (isWeekend ? "bg-background/80" : "bg-background") : "bg-background/40 text-foreground/50",
                            isToday ? "border-foreground/60" : "border-foreground/10",
                            isSelected ? "bg-foreground/10" : "hover:bg-foreground/5",
                            dragOverKey === key ? "ring-1 ring-foreground/40 bg-foreground/5" : ""
                          ].join(" ")}
                          title={titleTip}
                          onDragOver={(e) => { e.preventDefault(); if (dragOverKey !== key) setDragOverKey(key); }}
                          onDragEnter={(e) => { e.preventDefault(); setDragOverKey(key); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const id = e.dataTransfer.getData('text/task-id');
                            const srcDueAt = e.dataTransfer.getData('text/task-due_at') || null;
                            if (id) moveTaskToDate(id, srcDueAt, d);
                            setDragOverKey(null);
                          }}
                          onDragLeave={() => { if (dragOverKey === key) setDragOverKey(null); }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <span
                                className={[
                                  "inline-flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold border",
                                  isToday
                                    ? "bg-foreground text-background border-foreground"
                                    : inMonth
                                      ? (isWeekend ? "bg-foreground/10 text-foreground border-foreground/20" : "bg-foreground/10 text-foreground border-foreground/20")
                                      : "bg-foreground/10 text-foreground/60 border-foreground/10"
                                ].join(" ")}
                                aria-label={`${d.toLocaleDateString('ru-RU')}`}
                              >
                                {d.getDate()}
                              </span>
                              {!inMonth && <span className="text-[10px] text-foreground/50">{d.toLocaleString('ru-RU', { month: 'short' })}</span>}
                            </div>
                            {isToday && <span className="text-[10px] px-1 border rounded-full">Сегодня</span>}
                          </div>
                          {/* список задач (до 2 строк) */}
                          {list.length > 0 && (
                            <div className="mt-1 space-y-1" onClick={(e) => { e.stopPropagation(); setDetailsKey(key); }}>
                              {list.slice(0,2).map((t) => {
                                const color = t.priority === 'high' ? 'bg-red-500' : t.priority === 'medium' ? 'bg-yellow-500' : t.priority === 'low' ? 'bg-green-500' : 'bg-foreground/40';
                                return (
                                  <div
                                    key={t.id}
                                    className="group flex items-center gap-1 cursor-grab"
                                    draggable
                                    onDragStart={(e)=>{ e.dataTransfer.setData('text/task-id', t.id); e.dataTransfer.setData('text/task-due_at', t.due_at || ''); }}
                                  >
                                    <span className={`mt-[3px] inline-block h-2 w-2 rounded-full ${color} ${t.done ? 'opacity-50' : ''}`} />
                                    {t.due_at && (<span className="text-[10px] px-1 border rounded-md text-foreground/70">{timeLabel(t.due_at)}</span>)}
                                    <span className={`block text-[11px] leading-4 truncate ${t.done ? 'line-through text-foreground/60' : 'group-hover:text-foreground'}`}>{t.title}</span>
                                  </div>
                                );
                              })}
                              {list.length > 2 && (<div className="text-[10px] text-foreground/70">+{list.length - 2} ещё</div>)}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {view === 'week' && (() => {
                  const base = selected || new Date(currentMonth);
                  const start = new Date(base);
                  const dow = (start.getDay() + 6) % 7; // Mon=0
                  start.setDate(start.getDate() - dow);
                  const days: Date[] = Array.from({ length: 7 }, (_, idx) => { const t = new Date(start); t.setDate(start.getDate() + idx); return t; });
                  return (
                    <div className="grid grid-cols-7 gap-2">
                      {days.map((d, i) => {
                        const isToday = isSameDay(d, today);
                        const key = fmtDate(d);
                        const list = tasksByDate[key] || [];
                        return (
                          <div key={i} className={["h-36 rounded-md border px-2 py-1.5 overflow-hidden transition-colors", dragOverKey===key?"ring-1 ring-foreground/40 bg-foreground/5":"hover:bg-foreground/5"].join(" ")} onDragOver={(e)=>{e.preventDefault(); setDragOverKey(key);}} onDrop={(e)=>{const id=e.dataTransfer.getData('text/task-id'); const src=e.dataTransfer.getData('text/task-due_at')||null; if(id) moveTaskToDate(id, src, d); setDragOverKey(null);}} onDragLeave={()=>{ if(dragOverKey===key) setDragOverKey(null);}}>
                            <div className="text-xs font-medium flex items-center justify-between">
                              <span
                                className={[
                                  "inline-flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold border",
                                  isToday
                                    ? "bg-foreground text-background border-foreground"
                                    : "bg-foreground/10 text-foreground border-foreground/20"
                                ].join(" ")}
                                aria-label={`${d.toLocaleDateString('ru-RU')}`}
                              >
                                {d.getDate()}
                              </span>
                              {isToday && <span className="text-[10px] px-1 border rounded-full">Сегодня</span>}
                            </div>
                            <div className="mt-1 space-y-1">
                              {list.slice(0,5).map((t) => {
                                const color = t.priority === 'high' ? 'bg-red-500' : t.priority === 'medium' ? 'bg-yellow-500' : t.priority === 'low' ? 'bg-green-500' : 'bg-foreground/50';
                                return (
                                  <div
                                    key={t.id}
                                    className="group flex items-center gap-1 cursor-grab"
                                    draggable
                                    onDragStart={(e)=>{e.dataTransfer.setData('text/task-id', t.id); e.dataTransfer.setData('text/task-due_at', t.due_at || '');}}
                                  >
                                    <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
                                    {t.due_at && (<span className="text-[10px] px-1 border rounded-md text-foreground/70">{timeLabel(t.due_at)}</span>)}
                                    <span className={`block text-[11px] leading-4 truncate ${t.done ? 'line-through text-foreground/60' : 'group-hover:text-foreground'}`}>{t.title}</span>
                                  </div>
                                );
                              })}
                              {list.length > 5 && (<div className="text-[10px] text-foreground/70">+{list.length - 5} ещё</div>)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {view === 'day' && (() => {
                  const d = selected || today;
                  const key = fmtDate(d);
                  const list = tasksByDate[key] || [];
                  return (
                    <div className="rounded-none border bg-background p-3">
                      <div className="text-sm font-medium mb-2">{d.toLocaleDateString('ru-RU')}</div>
                      {list.length === 0 ? (
                        <div className="text-xs text-foreground/60">Нет задач</div>
                      ) : (
                        <div className="space-y-2">
                          {list.map((t) => {
                            const color = t.priority === 'high' ? 'bg-red-500' : t.priority === 'medium' ? 'bg-yellow-500' : t.priority === 'low' ? 'bg-green-500' : 'bg-foreground/50';
                            return (
                              <div key={t.id} className="flex items-center justify-between gap-2 rounded-none border bg-background/10 px-3 py-2" draggable onDragStart={(e)=>{e.dataTransfer.setData('text/task-id', t.id); e.dataTransfer.setData('text/task-due_at', t.due_at || '');}}>
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${color} ${t.done ? 'opacity-50' : ''}`} />
                                  {t.due_at && (<span className="text-[10px] px-1 border rounded-none text-foreground/70">{timeLabel(t.due_at)}</span>)}
                                  <span className={`truncate text-sm ${t.done ? 'line-through text-foreground/60' : ''}`}>{t.title}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button onClick={() => handleToggleDoneClick(key, t)} className="inline-flex h-7 w-7 items-center justify-center rounded-none border hover:bg-foreground/10" aria-label="Переключить выполнено">
                                    {t.done ? (
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                    ) : (
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                    )}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Events sidebar */}
              <aside className="rounded-none border bg-background/10 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">События</div>
                    <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value as any)} className="text-xs rounded-none border bg-background px-2 py-1">
                      <option value="all">Все</option>
                      <option value="active">Активные</option>
                      <option value="done">Выполненные</option>
                    </select>
                  </div>
                  <button
                    onClick={() => setQuickOpen(true)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-none border hover:bg-foreground/10"
                    aria-label="Быстро добавить задачу"
                    title="Быстро добавить задачу"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                  </button>
                </div>
                <div className="text-xs text-foreground/70 mb-3">Дата: {(selected || today).toLocaleDateString("ru-RU")}</div>
                {(() => {
                  const key = fmtDate(selected || today);
                  let list = (tasksByDate[key] || []);
                  if (statusFilter === 'active') list = list.filter(t => !t.done);
                  if (statusFilter === 'done') list = list.filter(t => t.done);
                  if (list.length === 0) {
                    return (
                      <div className="text-xs text-foreground/60">Нет задач под выбранные фильтры</div>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      {list.map((t) => {
                        const color = t.priority === 'high' ? 'bg-red-500' : t.priority === 'medium' ? 'bg-yellow-500' : t.priority === 'low' ? 'bg-green-500' : 'bg-foreground/50';
                        return (
                          <div key={t.id} className="flex items-center justify-between gap-3 rounded-none border bg-background/10 px-3 py-2" draggable onDragStart={(e)=>{e.dataTransfer.setData('text/task-id', t.id); e.dataTransfer.setData('text/task-due_at', t.due_at || '');}}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
                              {t.due_at && (<span className="text-[10px] px-1 border rounded-none text-foreground/70">{timeLabel(t.due_at)}</span>)}
                              <span className={`truncate text-sm ${t.done ? 'line-through text-foreground/60' : ''}`}>{t.title}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEdit(key, t)} className="inline-flex h-7 w-7 items-center justify-center rounded-none border hover:bg-foreground/10" aria-label="Редактировать" title="Редактировать">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                              </button>
                              <button onClick={() => handleToggleDoneClick(key, t)} className="inline-flex h-7 w-7 items-center justify-center rounded-none border hover:bg-foreground/10" aria-label="Переключить выполнено" title="Переключить выполнено">
                                {t.done ? (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                ) : (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                )}
                              </button>
                              <button onClick={() => deleteTask(key, t)} className="inline-flex h-7 w-7 items-center justify-center rounded-none border hover:bg-foreground/10" aria-label="Удалить" title="Удалить">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </aside>
            </div>
          </div>

          {/* Bottom input bar */}
          <div className="sticky bottom-0 px-4 lg:px-8 pb-6">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-center gap-3 rounded-xl border bg-foreground/10 px-4 py-3">
                <input
                  className="flex-1 bg-transparent outline-none text-xs sm:text-sm placeholder:text-foreground/60"
                  placeholder="Быстро добавить событие… (скоро)"
                />
                <button className="inline-flex h-8 w-8 items-center justify-center rounded-none border hover:bg-foreground/10" aria-label="Добавить событие">
                  <span className="block h-3 w-3 bg-background" style={{ clipPath: "polygon(0 100%, 100% 50%, 0 0)" }} />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
      {/* Popover со списком задач дня */}
      {detailsKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDetailsKey(null)} />
          <div className="relative w-full max-w-md rounded-none border bg-background p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">Задачи на {detailsKey}</div>
              <button onClick={() => setDetailsKey(null)} className="rounded-none border px-2 py-1 text-xs hover:bg-foreground/10">Закрыть</button>
            </div>
            <div className="space-y-2">
              {(tasksByDate[detailsKey] || []).map((t) => {
                const color = t.priority === 'high' ? 'bg-red-500' : t.priority === 'medium' ? 'bg-yellow-500' : t.priority === 'low' ? 'bg-green-500' : 'bg-foreground/50';
                return (
                  <div key={t.id} className="flex items-center justify-between gap-3 rounded-none border bg-background/10 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${color} ${t.done ? 'opacity-50' : ''}`} />
                      {t.due_at && (<span className="text-[10px] px-1 border rounded-none text-foreground/70">{timeLabel(t.due_at)}</span>)}
                      <span className={`truncate text-sm ${t.done ? 'line-through text-foreground/60' : ''}`}>{t.title}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleToggleDoneClick(detailsKey, t)} className="inline-flex h-7 w-7 items-center justify-center rounded-none border hover:bg-foreground/10" aria-label="Переключить выполнено">
                        {t.done ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {/* Модалка быстрого добавления задачи */}
      {quickOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !qaBusy && setQuickOpen(false)} />
          <div className="relative w-full max-w-md rounded-none border bg-background p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">Новая задача — {(selected || today).toLocaleDateString('ru-RU')}</div>
              <button disabled={qaBusy} onClick={() => setQuickOpen(false)} className="rounded-none border px-2 py-1 text-xs hover:bg-foreground/10">Закрыть</button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <label className="text-xs">
                <span className="block mb-1 text-foreground/60">Название</span>
                <input value={qaTitle} onChange={(e)=>setQaTitle(e.target.value)} className="w-full rounded-none border bg-background px-3 py-2 text-sm" placeholder="Что нужно сделать?" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs">
                  <span className="block mb-1 text-foreground/60">Время (опц.)</span>
                  <input type="time" value={qaTime} onChange={(e)=>setQaTime(e.target.value)} className="w-full rounded-none border bg-background px-3 py-2 text-sm" />
                </label>
                <label className="text-xs">
                  <span className="block mb-1 text-foreground/60">Приоритет</span>
                  <select value={qaPriority} onChange={(e)=>setQaPriority(e.target.value as any)} className="w-full rounded-none border bg-background px-3 py-2 text-sm">
                    <option value="">Не задан</option>
                    <option value="low">Низкий</option>
                    <option value="medium">Средний</option>
                    <option value="high">Высокий</option>
                  </select>
                </label>
              </div>
              <label className="text-xs">
                <span className="block mb-1 text-foreground/60">Теги (через запятую)</span>
                <input value={qaTags} onChange={(e)=>setQaTags(e.target.value)} className="w-full rounded-none border bg-background px-3 py-2 text-sm" placeholder="например: работа, срочно" />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button disabled={qaBusy} onClick={()=>{ setQuickOpen(false); }} className="rounded-none border px-3 py-2 text-xs hover:bg-foreground/10">Отмена</button>
              <button disabled={qaBusy || !qaTitle.trim()} onClick={quickAddSubmit} className="rounded-none border px-3 py-2 text-xs hover:bg-foreground/10">{qaBusy? 'Сохраняем…' : 'Добавить'}</button>
            </div>
          </div>
        </div>
      )}
      {/* Модалка редактирования задачи */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !etBusy && setEditOpen(false)} />
          <div className="relative w-full max-w-md rounded-none border bg-background p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">Редактирование задачи — {(selected || today).toLocaleDateString('ru-RU')}</div>
              <button disabled={etBusy} onClick={() => setEditOpen(false)} className="rounded-none border px-2 py-1 text-xs hover:bg-foreground/10">Закрыть</button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <label className="text-xs">
                <span className="block mb-1 text-foreground/60">Название</span>
                <input value={etTitle} onChange={(e)=>setEtTitle(e.target.value)} className="w-full rounded-none border bg-background px-3 py-2 text-sm" placeholder="Название задачи" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs">
                  <span className="block mb-1 text-foreground/60">Время (опц.)</span>
                  <input type="time" value={etTime} onChange={(e)=>setEtTime(e.target.value)} className="w-full rounded-none border bg-background px-3 py-2 text-sm" />
                </label>
                <label className="text-xs">
                  <span className="block mb-1 text-foreground/60">Приоритет</span>
                  <select value={etPriority} onChange={(e)=>setEtPriority(e.target.value as any)} className="w-full rounded-none border bg-background px-3 py-2 text-sm">
                    <option value="">Не задан</option>
                    <option value="low">Низкий</option>
                    <option value="medium">Средний</option>
                    <option value="high">Высокий</option>
                  </select>
                </label>
              </div>
              <label className="text-xs">
                <span className="block mb-1 text-foreground/60">Теги (через запятую)</span>
                <input value={etTags} onChange={(e)=>setEtTags(e.target.value)} className="w-full rounded-none border bg-background px-3 py-2 text-sm" placeholder="например: работа, срочно" />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button disabled={etBusy} onClick={()=>{ setEditOpen(false); }} className="rounded-none border px-3 py-2 text-xs hover:bg-foreground/10">Отмена</button>
              <button disabled={etBusy || !etTitle.trim()} onClick={submitEdit} className="rounded-none border px-3 py-2 text-xs hover:bg-foreground/10">{etBusy? 'Сохраняем…' : 'Сохранить'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
