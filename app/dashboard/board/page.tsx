"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

// Модель доски
type Board = { id: string; user_id: string; title: string; created_at: string };

export default function BoardsListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<Board[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  // modal state
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [nameModalMode, setNameModalMode] = useState<"create"|"rename">("create");
  const [nameModalValue, setNameModalValue] = useState("");
  const [nameModalTargetId, setNameModalTargetId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) { router.replace("/login"); return; }
      await loadBoards();
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  async function loadBoards() {
    setSchemaMissing(false); setError(null);
    const { data, error } = await supabase
      .from("boards")
      .select("id,user_id,title,created_at")
      .order("created_at", { ascending: false });
    if (error) {
      const msg = String(error.message || error);
      if (/relation .*boards.* does not exist|does not exist/i.test(msg)) setSchemaMissing(true);
      else setError(msg);
      setBoards([]);
      return;
    }
    setBoards((data || []) as Board[]);
  }

  function openCreateModal(defaultName = "Новая доска") {
    setNameModalMode("create");
    setNameModalTargetId(null);
    setNameModalValue(defaultName);
    setNameModalOpen(true);
  }
  function openRenameModal(id: string) {
    const current = boards.find(b => b.id === id);
    setNameModalMode("rename");
    setNameModalTargetId(id);
    setNameModalValue(current?.title || "");
    setNameModalOpen(true);
  }
  async function submitNameModal() {
    if (!nameModalValue.trim()) { setNameModalOpen(false); return; }
    if (nameModalMode === "create") {
      const { data, error } = await supabase.from("boards").insert({ title: nameModalValue.trim() }).select("*").single();
      if (error) { setError(error.message || String(error)); setNameModalOpen(false); return; }
      if (data) {
        setBoards(prev => [data as Board, ...prev]);
        setNameModalOpen(false);
        router.push(`/dashboard/board/${(data as Board).id}`);
      }
    } else if (nameModalMode === "rename" && nameModalTargetId) {
      const { data, error } = await supabase.from("boards").update({ title: nameModalValue.trim() }).eq("id", nameModalTargetId).select("*").single();
      if (error) { setError(error.message || String(error)); setNameModalOpen(false); return; }
      if (data) {
        setBoards(prev => prev.map(b => b.id === nameModalTargetId ? (data as Board) : b));
        setNameModalOpen(false);
      }
    }
  }

  async function removeBoard(id: string) {
    if (!confirm("Удалить доску?")) return;
    const { error } = await supabase.from("boards").delete().eq("id", id);
    if (error) { setError(error.message || String(error)); return; }
    setBoards(prev => prev.filter(b => b.id !== id));
  }

  async function duplicateBoard(id: string) {
    const src = boards.find(b => b.id === id);
    if (!src) return;
    const newTitle = `${src.title} (копия)`;
    const { data: newBoard, error: insErr } = await supabase.from("boards").insert({ title: newTitle }).select("*").single();
    if (insErr || !newBoard) { setError(insErr?.message || "Не удалось создать копию"); return; }
    // Пытаемся скопировать элементы, если есть таблица board_elements с колонкой board_id
    try {
      const { data: elems, error: selErr } = await supabase
        .from("board_elements")
        .select("type,x,y,w,h,text,color,stroke,to_x,to_y,priority,z")
        .eq("board_id", id);
      if (!selErr && elems && elems.length) {
        const payload = (elems as any[]).map(e => ({ ...e, board_id: (newBoard as any).id }));
        await supabase.from("board_elements").insert(payload);
      }
    } catch {}
    setBoards(prev => [newBoard as Board, ...prev]);
  }

  function renameBoard(id: string) { openRenameModal(id); }

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
            <a className={`${linkBase} ${pathname?.startsWith("/dashboard/board") ? linkActive : linkHover}`} href="/dashboard/board">
              <Image src="/dashboard/board.png" alt="Доска" width={16} height={16} className="opacity-80" />
              Доски
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
        </aside>

        {/* Content */}
        <section className="relative bg-background/80">
          <div className="mx-auto max-w-5xl px-4 py-8">
            {/* Баннер страницы досок */}
            <div className="mb-6 overflow-hidden rounded-xl border bg-background shadow-sm">
              <Image src="/board/board.png" alt="Boards banner" width={1600} height={500} className="w-full h-56 sm:h-72 md:h-80 lg:h-96 object-cover" priority />
            </div>
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-lg font-semibold">Доски</h1>
              <button onClick={()=>openCreateModal()} className="rounded-none border px-3 py-2 text-sm hover:bg-foreground/10">Новая доска</button>
            </div>

            {loading && <div className="text-sm text-foreground/60">Загрузка…</div>}
            {error && <div className="mb-4 text-xs text-red-600">Ошибка: {error}</div>}

            {!loading && boards.length === 0 && !schemaMissing && (
              <div className="text-sm text-foreground/60">Пока нет досок. Создайте первую.</div>
            )}

            {schemaMissing && (
              <div className="mt-4 rounded border p-4">
                <div className="mb-2 text-sm font-medium">Нужно создать таблицу boards</div>
                <pre className="text-xs whitespace-pre-wrap">{`create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  title text not null,
  created_at timestamptz not null default now()
);

alter table public.boards enable row level security;
create policy boards_owner_select on public.boards for select using (user_id = auth.uid());
create policy boards_owner_modify on public.boards for all using (user_id = auth.uid()) with check (user_id = auth.uid());
`}</pre>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Карточка создания */}
              <button onClick={()=>openCreateModal()} className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed bg-background/60 hover:bg-foreground/5 transition group">
                <div className="text-center">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border bg-background group-hover:bg-foreground/5">+
                  </div>
                  <div className="text-sm">Создать доску</div>
                </div>
              </button>

              {boards.map(b => (
                <div key={b.id} className="group relative overflow-hidden rounded-xl border bg-background shadow-sm hover:shadow-md transition-shadow">
                  <Link href={`/dashboard/board/${b.id}`} className="block">
                    {/* превью */}
                    <div className="relative h-28 sm:h-32 bg-foreground/5">
                      <Image src="/board/board.png" alt="preview" width={640} height={256} className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-90" />
                    </div>
                    {/* контент */}
                    <div className="p-3 pr-10">
                      <div className="text-sm font-medium truncate">{b.title}</div>
                      <div className="mt-1 text-xs text-foreground/60 truncate">{new Date(b.created_at).toLocaleDateString()}</div>
                    </div>
                  </Link>
                  {/* Кнопка меню */}
                  <div className="absolute right-2 top-2">
                    <button onClick={(e)=>{ e.stopPropagation(); setMenuOpenId(menuOpenId===b.id?null:b.id); }} className="rounded-md border bg-background/80 px-2 py-1 text-xs hover:bg-foreground/10">⋯</button>
                    {menuOpenId===b.id && (
                      <div className="absolute right-0 mt-1 w-40 rounded-md border bg-background shadow">
                        <button onClick={(e)=>{e.stopPropagation(); setMenuOpenId(null); renameBoard(b.id);}} className="block w-full px-3 py-2 text-left text-xs hover:bg-foreground/10">Переименовать</button>
                        <button onClick={(e)=>{e.stopPropagation(); setMenuOpenId(null); duplicateBoard(b.id);}} className="block w-full px-3 py-2 text-left text-xs hover:bg-foreground/10">Дублировать</button>
                        <button onClick={(e)=>{e.stopPropagation(); setMenuOpenId(null); removeBoard(b.id);}} className="block w-full px-3 py-2 text-left text-xs hover:bg-red-500/10 text-red-600">Удалить</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      {/* Name Modal */}
      {nameModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setNameModalOpen(false)} />
          <div role="dialog" aria-modal="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-sm rounded-md border bg-background p-4 shadow-xl">
            <div className="text-sm font-medium mb-2">{nameModalMode === 'create' ? 'Создать доску' : 'Переименовать доску'}</div>
            <input autoFocus className="w-full rounded border bg-background px-3 py-2 text-sm" value={nameModalValue} onChange={e=>setNameModalValue(e.target.value)} onKeyDown={(e)=>{ if (e.key==='Enter') submitNameModal(); if (e.key==='Escape') setNameModalOpen(false); }} />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button className="rounded-none border px-3 py-1.5 text-sm hover:bg-foreground/10" onClick={()=>setNameModalOpen(false)}>Отмена</button>
              <button className="rounded-none border px-3 py-1.5 text-sm hover:bg-foreground/10" onClick={submitNameModal}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
