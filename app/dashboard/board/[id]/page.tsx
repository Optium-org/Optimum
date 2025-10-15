"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// Типы
 type Priority = "low" | "medium" | "high";
 type ElementType = "note" | "rect" | "ellipse" | "arrow" | "text";
 type Tool = "select" | ElementType;

 type BoardElement = {
  id: string;
  board_id: string;
  user_id: string;
  type: ElementType;
  x: number; y: number;
  w: number | null; h: number | null;
  text: string | null; color: string | null; stroke: string | null;
  to_x: number | null; to_y: number | null;
  priority: Priority | null; z: number; created_at: string; updated_at: string | null;
 };

export default function BoardCanvasPage({ params }: { params: { id: string } }) {
  const boardId = params.id;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<BoardElement[]>([]);
  const [uiError, setUiError] = useState<string | null>(null);
  const [boardTitle, setBoardTitle] = useState<string>("Untitled");
  const [savingTitle, setSavingTitle] = useState(false);

  // инструменты/цвета
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<string>("#fde68a");
  const [stroke, setStroke] = useState<string>("#94a3b8");

  // пан/зум
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const offsetStartRef = useRef({ x: 0, y: 0 });

  // выделение/перемещение
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const dragIdRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const itemStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // текст: двойной клик -> редактирование
  const [editingId, setEditingId] = useState<string | null>(null);
  const [focusRequestId, setFocusRequestId] = useState<string | null>(null);

  // рамка мультивыделения
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);

  const GRID = 40;
  const [snapEnabled, setSnapEnabled] = useState(true);
  // rulers & user guides
  const [vGuides, setVGuides] = useState<number[]>([]); // world x
  const [hGuides, setHGuides] = useState<number[]>([]); // world y
  const RULER = 20;

  // UI panels
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Undo/Redo stacks
  const undoStack = useRef<BoardElement[][]>([]);
  const redoStack = useRef<BoardElement[][]>([]);
  function pushHistory() {
    undoStack.current.push(JSON.parse(JSON.stringify(items)));
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = { current: [] } as any; // reset
  }
  function undo() {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(items);
    setItems(prev);
  }
  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(items);
    setItems(next);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) { router.replace("/login"); return; }
      setUserId(data.user.id);
      // загрузим название доски
      await loadBoardTitle();
      // загрузим направляющие (если есть колонки)
      await loadGuides();
      await loadElements(data.user.id);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [router, boardId]);

  async function loadBoardTitle() {
    const { data, error } = await supabase.from("boards").select("title").eq("id", boardId).single();
    if (!error && data) setBoardTitle((data as any).title || "Untitled");
  }

  async function loadGuides() {
    try {
      const { data, error } = await supabase.from("boards").select("guides_v,guides_h").eq("id", boardId).single();
      if (!error && data) {
        if ((data as any).guides_v) setVGuides((data as any).guides_v as number[]);
        if ((data as any).guides_h) setHGuides((data as any).guides_h as number[]);
      }
    } catch {}
  }
  async function saveGuides(v = vGuides, h = hGuides) {
    try {
      await supabase.from("boards").update({ guides_v: v, guides_h: h } as any).eq("id", boardId);
    } catch {}
  }
  useEffect(()=>{ const t = setTimeout(()=>saveGuides(), 400); return ()=>clearTimeout(t); }, [vGuides, hGuides]);

  async function loadElements(uid: string) {
    const { data, error } = await supabase
      .from("board_elements")
      .select("id,board_id,user_id,type,x,y,w,h,text,color,stroke,to_x,to_y,priority,z,created_at,updated_at")
      .eq("user_id", uid)
      .eq("board_id", boardId)
      .order("z", { ascending: true });
    if (error) { setUiError(error.message || String(error)); setItems([]); return; }
    const arr = (data || []) as BoardElement[];
    setItems(arr);
    // если пусто — автоматически включаем инструмент создания первого элемента
    if (arr.length === 0) {
      setTool("note");
    }
  }

  function ScreenToWorld(sx: number, sy: number) { return { x: (sx - offset.x) / scale, y: (sy - offset.y) / scale }; }
  function WorldToScreen(x: number, y: number) { return { sx: x * scale + offset.x, sy: y * scale + offset.y }; }

  async function updateElement(id: string, patch: Partial<BoardElement>) {
    pushHistory();
    const { data, error } = await supabase.from("board_elements").update(patch).eq("id", id).select("*").single();
    if (!error && data) setItems(prev => prev.map(i => i.id === id ? (data as BoardElement) : i));
  }
  async function removeElement(id: string) {
    pushHistory();
    const { error } = await supabase.from("board_elements").delete().eq("id", id);
    if (!error) setItems(prev => prev.filter(i => i.id !== id));
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault(); e.stopPropagation();
    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.05 : 0.95;
    const prev = scale; const next = Math.min(4, Math.max(0.2, prev * factor));
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
    const worldX = (mx - offset.x) / prev; const worldY = (my - offset.y) / prev;
    setScale(next); setOffset({ x: mx - worldX * next, y: my - worldY * next });
  }

  function onMouseDownCanvas(e: React.MouseEvent) {
    const isMiddle = e.button === 1 || e.buttons === 4;
    if (isMiddle) { isPanningRef.current = true; panStartRef.current = { x: e.clientX, y: e.clientY }; offsetStartRef.current = { ...offset }; return; }

    const target = e.target as HTMLElement;
    const onElement = !!target.closest('[data-element="1"]');
    const onHandle = !!target.closest('[data-handle="1"]');
    const isEmptyCanvasClick = !onElement && !onHandle;

    const world = ScreenToWorld(e.clientX, e.clientY);
    if (tool !== "select" && isEmptyCanvasClick) {
      pushHistory();
      void createElement(tool as ElementType, { x: world.x, y: world.y });
      setTool("select");
      return;
    }
    if (isEmptyCanvasClick) {
      setSelectedId(null);
      marqueeStartRef.current = world;
      setMarquee({ x: world.x, y: world.y, w: 0, h: 0 });
    }
  }
  function onMouseMoveCanvas(e: React.MouseEvent) {
    // перетаскивание направляющих
    if (dragGuide) {
      const world = ScreenToWorld(e.clientX, e.clientY);
      if (dragGuide.type === 'v') setVGuides(prev => prev.map((x, i) => i === dragGuide.index ? world.x : x));
      if (dragGuide.type === 'h') setHGuides(prev => prev.map((y, i) => i === dragGuide.index ? world.y : y));
      return;
    }
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x; const dy = e.clientY - panStartRef.current.y;
      setOffset({ x: offsetStartRef.current.x + dx, y: offsetStartRef.current.y + dy });
      return;
    }
    if (marqueeStartRef.current) {
      const cur = ScreenToWorld(e.clientX, e.clientY);
      const st = marqueeStartRef.current;
      const x = Math.min(st.x, cur.x); const y = Math.min(st.y, cur.y);
      const w = Math.abs(cur.x - st.x); const h = Math.abs(cur.y - st.y);
      setMarquee({ x, y, w, h });
    }
  }
  function onMouseUpCanvas() { isPanningRef.current = false; if (dragGuide) { setDragGuide(null); saveGuides(); } }

  function onItemMouseDown(e: React.MouseEvent, it: BoardElement) {
    e.stopPropagation();
    if (e.detail === 2 && it.type === 'text') { setEditingId(it.id); setFocusRequestId(it.id); return; }
    setSelectedId(it.id);
    setSelectedIds((prev) => { const next = new Set(prev); next.clear(); next.add(it.id); return next; });
    marqueeStartRef.current = null; setMarquee(null);
    dragIdRef.current = it.id; dragStartRef.current = ScreenToWorld(e.clientX, e.clientY); itemStartRef.current = { x: it.x, y: it.y };
  }
  async function onMouseMoveRoot(e: React.MouseEvent) {
    if (!dragIdRef.current) return;
    const cur = ScreenToWorld(e.clientX, e.clientY);
    const dx = cur.x - dragStartRef.current.x; const dy = cur.y - dragStartRef.current.y;
    const id = dragIdRef.current; 
    let nx = itemStartRef.current.x + dx; let ny = itemStartRef.current.y + dy;
    // snapping to grid and guides
    if (snapEnabled) {
      const tolPx = 6;
      const sx = nx * scale + offset.x; const sy = ny * scale + offset.y;
      const candidatesX = [ ...vGuides ].map(gx => ({ gx, d: Math.abs(gx*scale + offset.x - sx) }));
      const candidatesY = [ ...hGuides ].map(gy => ({ gy, d: Math.abs(gy*scale + offset.y - sy) }));
      // к позициям других элементов (границы и центры)
      items.filter(i=>i.id!==id).forEach(i=>{
        const xs = [i.x, i.x + (i.w||0)/2, i.x + (i.w||0)];
        const ys = [i.y, i.y + (i.h||0)/2, i.y + (i.h||0)];
        xs.forEach(gx=>candidatesX.push({ gx, d: Math.abs(gx*scale + offset.x - sx) }));
        ys.forEach(gy=>candidatesY.push({ gy, d: Math.abs(gy*scale + offset.y - sy) }));
      });
      candidatesX.sort((a,b)=>a.d-b.d); candidatesY.sort((a,b)=>a.d-b.d);
      if (candidatesX[0] && candidatesX[0].d <= tolPx) nx = candidatesX[0].gx;
      if (candidatesY[0] && candidatesY[0].d <= tolPx) ny = candidatesY[0].gy;
      // grid snap soft
      const gx = Math.round(nx/GRID)*GRID; const gy = Math.round(ny/GRID)*GRID;
      const gxs = gx*scale + offset.x; const gys = gy*scale + offset.y;
      if (Math.abs(gxs - sx) <= tolPx) nx = gx; if (Math.abs(gys - sy) <= tolPx) ny = gy;
    }
    setItems(prev => prev.map(i => i.id === id ? { ...i, x: nx, y: ny } as BoardElement : i));
  }
  async function onMouseUpRoot() {
    if (!dragIdRef.current) {
      // завершение рамки выделения
      if (marquee) {
        const ids = new Set<string>();
        items.forEach(it => {
          const w = it.w ?? (it.type === 'text' ? 120 : 160); const h = it.h ?? (it.type === 'text' ? 24 : 100);
          if (it.x >= marquee.x && it.y >= marquee.y && (it.x + w) <= (marquee.x + marquee.w) && (it.y + h) <= (marquee.y + marquee.h)) ids.add(it.id);
        });
        setSelectedIds(ids); setSelectedId(ids.size === 1 ? Array.from(ids)[0] : null); setMarquee(null); marqueeStartRef.current = null;
      }
      return;
    }
    const id = dragIdRef.current; dragIdRef.current = null;
    const it = items.find(x => x.id === id);
    if (it) { pushHistory(); await updateElement(id, { x: it.x, y: it.y }); }
  }

  // hotkeys: collapse sidebars, undo/redo
  useEffect(()=>{
    function onKey(e: KeyboardEvent){
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase()==='b') { e.preventDefault(); setLeftCollapsed(v=>!v); }
      if (mod && e.key.toLowerCase()==='i') { e.preventDefault(); setRightCollapsed(v=>!v); }
      if (mod && e.key.toLowerCase()==='z' && !e.shiftKey){ e.preventDefault(); undo(); }
      if (mod && (e.key.toLowerCase()==='z' && e.shiftKey)) { e.preventDefault(); redo(); }
      if (e.key.toLowerCase()==='g') { setSnapEnabled(v=>!v); }
      // выравнивание: Shift+W/A/S/D/X/C
      if (e.shiftKey && !mod && e.key.toLowerCase()==='a') { e.preventDefault(); alignSelected('left'); }
      if (e.shiftKey && !mod && e.key.toLowerCase()==='s') { e.preventDefault(); alignSelected('center'); }
      if (e.shiftKey && !mod && e.key.toLowerCase()==='d') { e.preventDefault(); alignSelected('right'); }
      if (e.shiftKey && !mod && e.key.toLowerCase()==='w') { e.preventDefault(); alignSelected('top'); }
      if (e.shiftKey && !mod && e.key.toLowerCase()==='x') { e.preventDefault(); alignSelected('middle'); }
      if (e.shiftKey && !mod && e.key.toLowerCase()==='c') { e.preventDefault(); alignSelected('bottom'); }
    }
    window.addEventListener('keydown', onKey);
    return ()=>window.removeEventListener('keydown', onKey);
  }, [items]);

  // Layers helpers
  function changeZ(id: string, dir: 1|-1){
    const idx = items.findIndex(i=>i.id===id); if (idx<0) return;
    const arr = [...items];
    const newZ = (arr[idx].z||0) + dir;
    arr[idx] = { ...arr[idx], z: newZ } as BoardElement;
    arr.sort((a,b)=> (a.z||0) - (b.z||0));
    setItems(arr);
    supabase.from('board_elements').update({ z: newZ }).eq('id', id);
  }
  // Видимость/блокировка: используем priority как флаг (hidden/locked)
  function toggleVis(id: string){ const it = items.find(x=>x.id===id); if(!it) return; const nv = it.priority==='hidden'? null : 'hidden'; updateElement(id, { priority: nv } as any); setItems(prev=>prev.map(i=>i.id===id?{...i, priority:nv} as BoardElement:i)); }
  function toggleLock(id: string){ const it = items.find(x=>x.id===id); if(!it) return; const nv = it.priority==='locked'? null : 'locked'; updateElement(id, { priority: nv } as any); setItems(prev=>prev.map(i=>i.id===id?{...i, priority:nv} as BoardElement:i)); }

  // align tools for selection (left/top/center)
  function alignSelected(mode: 'left'|'center'|'right'|'top'|'middle'|'bottom'){
    const sel = items.filter(i=>selectedIds.has(i.id)); if (sel.length<2) return;
    const minX = Math.min(...sel.map(i=>i.x)); const maxX = Math.max(...sel.map(i=>i.x + (i.w||0)));
    const minY = Math.min(...sel.map(i=>i.y)); const maxY = Math.max(...sel.map(i=>i.y + (i.h||0)));
    const updates: {id:string; patch: Partial<BoardElement>}[] = [];
    sel.forEach(i=>{
      let x=i.x, y=i.y, w=i.w||0, h=i.h||0;
      if (mode==='left') x=minX; if (mode==='right') x = maxX - w; if (mode==='center') x = (minX+maxX - w)/2;
      if (mode==='top') y=minY; if (mode==='bottom') y = maxY - h; if (mode==='middle') y = (minY+maxY - h)/2;
      updates.push({ id:i.id, patch:{ x, y } });
    });
    pushHistory();
    setItems(prev=>prev.map(i=>{ const u=updates.find(u=>u.id===i.id); return u?{...i,...u.patch} as BoardElement:i; }));
    updates.forEach(u=>supabase.from('board_elements').update(u.patch).eq('id', u.id));
  }

  // quick export PNG renderer
  async function exportPNG(){
    const padding = 40; const canvas = document.createElement('canvas');
    const minX = Math.min(...items.map(i=>i.x)); const minY = Math.min(...items.map(i=>i.y));
    const maxX = Math.max(...items.map(i=>i.x + (i.w||0) + ((i.type==='arrow')? (i.to_x||i.x)-i.x:0)));
    const maxY = Math.max(...items.map(i=>i.y + (i.h||0) + ((i.type==='arrow')? (i.to_y||i.y)-i.y:0)));
    const width = Math.max(1, Math.ceil(maxX - minX + padding*2));
    const height = Math.max(1, Math.ceil(maxY - minY + padding*2));
    canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,width,height);
    items.forEach(i=>{
      const x = i.x - minX + padding; const y = i.y - minY + padding;
      if (i.type==='rect' || i.type==='note'){
        const w=i.w||220, h=i.h||140; ctx.fillStyle = i.color||'#e5e7eb'; ctx.strokeStyle = i.stroke||'#94a3b8'; ctx.lineWidth=1; const r=6; ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (i.type==='note' && i.text){ ctx.fillStyle = '#111827'; ctx.font = '14px sans-serif'; ctx.textBaseline='top'; ctx.fillText(i.text, x+8, y+8, w-16); }
      } else if (i.type==='ellipse'){
        const w=i.w||200, h=i.h||140; ctx.fillStyle=i.color||'#e5e7eb'; ctx.strokeStyle=i.stroke||'#94a3b8'; ctx.beginPath(); ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
      } else if (i.type==='text'){
        ctx.fillStyle = '#111827'; ctx.font = '14px sans-serif'; ctx.textBaseline='top'; ctx.fillText(i.text||'Текст', x, y);
      } else if (i.type==='arrow'){
        ctx.strokeStyle=i.stroke||'#111827'; ctx.lineWidth=2; const tox=(i.to_x||i.x)-i.x + x; const toy=(i.to_y||i.y)-i.y + y; ctx.beginPath(); ctx.moveTo(x+10,y+10); ctx.lineTo(tox+10,toy+10); ctx.stroke();
      }
    });
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a'); a.href=url; a.download= (boardTitle||'board')+'.png'; a.click();
  }

  if (loading) return <main className="min-h-screen w-full flex items-center justify-center"><div className="text-sm text-foreground/70">Загрузка…</div></main>;

  return (
    <main className="min-h-screen w-full" onMouseMove={onMouseMoveRoot} onMouseUp={onMouseUpRoot}>
      {/* Верхний статус‑бар */}
      <div className="fixed left-0 right-0 top-0 z-20 flex items-center justify-between border-b bg-background/90 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <a href="/dashboard/board" className="inline-flex items-center gap-2 rounded-full border bg-background/90 px-2 py-1 hover:bg-foreground/10">
            <Image src="/icons/favicon-dark.png" alt="Momentum" width={14} height={14} />
            <span>Momentum</span>
          </a>
          {/* Название доски с инлайн‑редактированием */}
          <input
            className="ml-3 bg-transparent outline-none px-2 py-1 rounded border"
            value={boardTitle}
            onChange={(e)=>setBoardTitle(e.target.value)}
            onBlur={async ()=>{
              setSavingTitle(true);
              const { error } = await supabase.from("boards").update({ title: boardTitle.trim() || "Untitled" }).eq("id", boardId);
              setSavingTitle(false);
              if (error) setUiError(error.message || String(error));
            }}
            onKeyDown={(e)=>{ if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
          />
          {savingTitle && <span className="text-foreground/60">Сохранение…</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-foreground/60">{Math.round(scale*100)}%</div>
          <button className="rounded border px-2 py-1 hover:bg-foreground/10" onClick={()=>{ setScale(1); setOffset({x:0,y:0}); }}>Сброс вида</button>
          <button className="rounded border px-2 py-1 hover:bg-foreground/10">Share</button>
        </div>
      </div>

      {/* Левый сайдбар: Pages/Layers */}
      <aside className={`fixed left-0 top-8 bottom-0 ${leftCollapsed? 'w-8':'w-64'} border-r bg-background/95 hidden md:flex md:flex-col z-10 transition-[width]`}>
        <div className="p-2 border-b text-xs flex items-center justify-between">
          <span>{leftCollapsed? '' : 'Pages'}</span>
          <button className="rounded border px-1 py-0.5 text-[10px] hover:bg-foreground/10">+</button>
        </div>
        {!leftCollapsed && (
        <div className="p-2 text-xs space-y-1">
          <button className="w-full text-left rounded px-2 py-1 hover:bg-foreground/10">Page 1</button>
        </div>
        )}
        <div className="p-2 border-y text-xs flex items-center justify-between">
          <span>{leftCollapsed? '' : 'Layers'}</span>
          <button onClick={()=>setLeftCollapsed(v=>!v)} className="rounded border px-1 py-0.5 text-[10px] hover:bg-foreground/10">{leftCollapsed? '»':'«'}</button>
        </div>
        {!leftCollapsed && (
          <div className="flex-1 overflow-auto text-xs">
            {items.map(it => (
              <div key={it.id} draggable onDragStart={()=>setDragLayerId(it.id)} onDragOver={(e)=>e.preventDefault()} onDrop={()=>{ if (!dragLayerId || dragLayerId===it.id) return; const a = items.findIndex(x=>x.id===dragLayerId); const b = items.findIndex(x=>x.id===it.id); if (a<0||b<0) return; const copy=[...items]; const [m]=copy.splice(a,1); copy.splice(b,0,m); // пересчитать z
              copy.forEach((el, idx)=>{ el.z = idx; }); setItems(copy); copy.forEach(el=>supabase.from('board_elements').update({ z: el.z }).eq('id', el.id)); setDragLayerId(null); }} className={`flex items-center gap-1 px-2 py-1 ${selectedIds.has(it.id)?'bg-foreground/10':''}`}>
                <span className="w-4 text-center">{it.type==='rect'?'▭': it.type==='ellipse'?'◯': it.type==='note'?'🗒️': it.type==='text'?'T':'➜'}</span>
                <button onClick={(e)=>{ if (e.shiftKey) { setSelectedIds(prev=>{ const n=new Set(prev); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; }); } else { setSelectedId(it.id); setSelectedIds(new Set([it.id])); } }} className="flex-1 text-left truncate hover:underline">{it.text || it.type}</button>
                <button title="Показать/скрыть" onClick={()=>toggleVis(it.id)} className="rounded border px-1 text-[10px] hover:bg-foreground/10">👁</button>
                <button title="Заблокировать" onClick={()=>toggleLock(it.id)} className="rounded border px-1 text-[10px] hover:bg-foreground/10">🔒</button>
                <button title="Вверх" onClick={()=>changeZ(it.id, +1)} className="rounded border px-1 text-[10px] hover:bg-foreground/10">▲</button>
                <button title="Вниз" onClick={()=>changeZ(it.id, -1)} className="rounded border px-1 text-[10px] hover:bg-foreground/10">▼</button>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Правый инспектор */}
      <aside className={`fixed right-0 top-8 bottom-0 ${rightCollapsed?'w-8':'w-72'} border-l bg-background/95 hidden md:flex md:flex-col z-10 transition-[width]`}>
        <div className="p-2 border-b text-xs flex items-center gap-2">
          {!rightCollapsed && <>
            <button className="rounded border px-2 py-1 text-xs hover:bg-foreground/10">Design</button>
            <button className="rounded border px-2 py-1 text-xs hover:bg-foreground/10 opacity-60">Prototype</button>
          </>}
          <button onClick={()=>setRightCollapsed(v=>!v)} className="ml-auto rounded border px-1 py-0.5 text-[10px] hover:bg-foreground/10">{rightCollapsed?'«':'»'}</button>
        </div>
        {!rightCollapsed && (
        <div className="p-3 space-y-3 text-xs overflow-auto">
          {selectedId ? (()=>{ const it = items.find(x=>x.id===selectedId)!; return (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">X<input type="number" className="w-full rounded border bg-background px-2 py-1" value={Math.round(it.x)} onChange={(e)=>updateElement(it.id,{ x: parseFloat(e.target.value) })} /></label>
                <label className="block">Y<input type="number" className="w-full rounded border bg-background px-2 py-1" value={Math.round(it.y)} onChange={(e)=>updateElement(it.id,{ y: parseFloat(e.target.value) })} /></label>
                <label className="block">W<input type="number" className="w-full rounded border bg-background px-2 py-1" value={Math.round(it.w||0)} onChange={(e)=>updateElement(it.id,{ w: Math.max(10, parseFloat(e.target.value)||0) })} /></label>
                <label className="block">H<input type="number" className="w-full rounded border bg-background px-2 py-1" value={Math.round(it.h||0)} onChange={(e)=>updateElement(it.id,{ h: Math.max(10, parseFloat(e.target.value)||0) })} /></label>
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-2">Fill <input type="color" value={it.color||'#e5e7eb'} onChange={(e)=>updateElement(it.id,{ color: e.target.value })} /></label>
                <label className="inline-flex items-center gap-2">Stroke <input type="color" value={it.stroke||'#94a3b8'} onChange={(e)=>updateElement(it.id,{ stroke: e.target.value })} /></label>
              </div>
              {/* Typography / Radius / Opacity */}
              <div className="grid grid-cols-3 gap-2">
                <label className="block col-span-1">Font<input type="number" className="w-full rounded border bg-background px-2 py-1" value={parseInt((it as any).font_size||'14')} onChange={(e)=>updateElement(it.id,{ ...(it as any), font_size: parseInt(e.target.value)||14 } as any)} /></label>
                <label className="block col-span-1">Line<input type="number" step="0.1" className="w-full rounded border bg-background px-2 py-1" value={parseFloat(((it as any).line_height??1.3).toString())} onChange={(e)=>updateElement(it.id,{ ...(it as any), line_height: parseFloat(e.target.value)||1.3 } as any)} /></label>
                <label className="block col-span-1">Border<input type="number" className="w-full rounded border bg-background px-2 py-1" value={parseInt((it as any).border_width||'1')} onChange={(e)=>updateElement(it.id,{ ...(it as any), border_width: parseInt(e.target.value)||1 } as any)} /></label>
                <label className="block col-span-1">Radius<input type="number" className="w-full rounded border bg-background px-2 py-1" value={parseInt((it as any).radius||'6')} onChange={(e)=>updateElement(it.id,{ ...(it as any), radius: parseInt(e.target.value)||0 } as any)} /></label>
                <label className="block col-span-1">Opacity<input type="number" min={0} max={100} className="w-full rounded border bg-background px-2 py-1" value={parseInt(((it as any).opacity??100).toString())} onChange={(e)=>updateElement(it.id,{ ...(it as any), opacity: Math.min(100, Math.max(0, parseInt(e.target.value)||100)) } as any)} /></label>
              </div>
              {/* Shadow */}
              <div className="grid grid-cols-5 gap-2">
                <label className="block col-span-1">Blur<input type="number" className="w-full rounded border bg-background px-2 py-1" value={parseInt((it as any).shadow_blur||'10')} onChange={(e)=>updateElement(it.id,{ ...(it as any), shadow_blur: parseInt(e.target.value)||0 } as any)} /></label>
                <label className="block col-span-1">Off X<input type="number" className="w-full rounded border bg-background px-2 py-1" value={parseInt((it as any).shadow_offset_x||'0')} onChange={(e)=>updateElement(it.id,{ ...(it as any), shadow_offset_x: parseInt(e.target.value)||0 } as any)} /></label>
                <label className="block col-span-1">Off Y<input type="number" className="w-full rounded border bg-background px-2 py-1" value={parseInt((it as any).shadow_offset_y||'0')} onChange={(e)=>updateElement(it.id,{ ...(it as any), shadow_offset_y: parseInt(e.target.value)||0 } as any)} /></label>
                <label className="block col-span-1">Spread<input type="number" className="w-full rounded border bg-background px-2 py-1" value={parseInt((it as any).shadow_spread||'0')} onChange={(e)=>updateElement(it.id,{ ...(it as any), shadow_spread: parseInt(e.target.value)||0 } as any)} /></label>
                <label className="block col-span-1">Color<input type="color" className="w-full rounded border bg-background px-2 py-1" value={(it as any).shadow_color||'#000000'} onChange={(e)=>updateElement(it.id,{ ...(it as any), shadow_color: e.target.value } as any)} /></label>
              </div>
              {(it.type==='text' || it.type==='note') && (
                <div className="space-y-2">
                  <div>Text</div>
                  <textarea className="w-full rounded border bg-background p-2" value={it.text||''}
                    onChange={(e)=>setItems(prev=>prev.map(x=>x.id===it.id?{...x,text:e.target.value}as BoardElement:x))}
                    onBlur={(e)=>updateElement(it.id,{ text: e.target.value })}
                  />
                </div>
              )}
            </>
          ); })() : (
            <div className="text-foreground/60">Выберите элемент</div>
          )}
        </div>
        )}
      </aside>

      {/* Канва */}
      <section className="relative bg-background pt-10">
        <div
          className={`relative w-full h-[calc(100vh-80px)] overflow-hidden ${leftCollapsed? 'md:pl-8':'md:pl-64'} ${rightCollapsed? 'md:pr-8':'md:pr-72'} ${tool!=="select"?"cursor-crosshair":""}`}
          onMouseDown={onMouseDownCanvas}
          onMouseMove={onMouseMoveCanvas}
          onMouseUp={onMouseUpCanvas}
          onWheel={onWheel}
          style={{ touchAction: 'none' }}
        >
          {/* Rulers */}
          <div className="absolute left-0 top-0" style={{ width:'100%', height:RULER }} onClick={(e)=>{ const yw = (e.nativeEvent.offsetY) / scale; setHGuides(g=>[...g, yw]); }} />
          <div className="absolute left-0 top-0" style={{ width:RULER, height:'100%' }} onClick={(e)=>{ const xw = (e.nativeEvent.offsetX) / scale; setVGuides(g=>[...g, xw]); }} />
          <div className="absolute inset-0" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: "0 0" }}>
            {/* сетка */}
            <div className="absolute inset-0 pointer-events-none" style={{ backgroundSize: `${GRID}px ${GRID}px`, backgroundImage: "linear-gradient(to right, rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.15) 1px, transparent 1px)" }} />
            {/* user guides */}
            {vGuides.map((x,i)=> (
              <div key={`vg-${i}`} onMouseDown={(e)=>{ e.stopPropagation(); setDragGuide({ type:'v', index:i }); }} onDoubleClick={(e)=>{ e.stopPropagation(); setVGuides(prev=>prev.filter((_,j)=>j!==i)); saveGuides(vGuides.filter((_,j)=>j!==i), hGuides); }}
                   style={{ position:'absolute', left:x, top:0, bottom:0, width:1, background:'rgba(99,102,241,0.8)', cursor:'ew-resize' }} />
            ))}
            {hGuides.map((y,i)=> (
              <div key={`hg-${i}`} onMouseDown={(e)=>{ e.stopPropagation(); setDragGuide({ type:'h', index:i }); }} onDoubleClick={(e)=>{ e.stopPropagation(); setHGuides(prev=>prev.filter((_,j)=>j!==i)); saveGuides(vGuides, hGuides.filter((_,j)=>j!==i)); }}
                   style={{ position:'absolute', top:y, left:0, right:0, height:1, background:'rgba(99,102,241,0.8)', cursor:'ns-resize' }} />
            ))}
 
            {/* элементы */}
            {items.map((it) => (
              // скрытые элементы не отрисовываем
              (it.priority==='hidden'? null : (
              <div key={it.id} data-element="1" style={{ position: "absolute", left: it.x, top: it.y, opacity: (it as any).opacity!=null? ((it as any).opacity as number)/100 : 1 }} onMouseDown={(e)=>{ if (it.priority==='locked') return; onItemMouseDown(e, it); }}>
                {it.type === "note" && (
                  <div className={`rounded-md border text-xs shadow-sm ${selectedId===it.id?"ring-1 ring-foreground/50":""}`} style={{ width: it.w || 180, height: it.h || 120, background: it.color || color, borderColor: it.stroke || stroke, borderWidth: ((it as any).border_width||1), borderRadius: ((it as any).radius||6), boxShadow: (it as any).shadow_color ? `${(it as any).shadow_offset_x||0}px ${(it as any).shadow_offset_y||0}px ${(it as any).shadow_blur||10}px ${(it as any).shadow_spread||0}px ${(it as any).shadow_color}` : undefined }}>
                    <textarea className="w-full h-full bg-transparent p-2 resize-none outline-none" value={it.text || ""} onChange={(e)=>setItems(prev=>prev.map(x=>x.id===it.id?{...x,text:e.target.value}as BoardElement:x))} onBlur={(e)=>updateElement(it.id,{ text: e.target.value })} />
                  </div>
                )}
                {it.type === "rect" && (
                  <div className={`rounded-md border ${selectedId===it.id?"ring-1 ring-foreground/50":""}`} style={{ width: it.w || 220, height: it.h || 140, background: it.color || "#e5e7eb", borderColor: it.stroke || stroke, borderWidth: ((it as any).border_width||1), borderRadius: ((it as any).radius||6), boxShadow: (it as any).shadow_color ? `${(it as any).shadow_offset_x||0}px ${(it as any).shadow_offset_y||0}px ${(it as any).shadow_blur||10}px ${(it as any).shadow_spread||0}px ${(it as any).shadow_color}` : undefined }} />
                )}
                {it.type === "ellipse" && (
                  <div className={`border ${selectedId===it.id?"ring-1 ring-foreground/50":""}`} style={{ width: it.w || 200, height: it.h || 140, background: it.color || "#e5e7eb", borderColor: it.stroke || stroke, borderRadius: "50%", borderWidth: ((it as any).border_width||1), boxShadow: (it as any).shadow_color ? `${(it as any).shadow_offset_x||0}px ${(it as any).shadow_offset_y||0}px ${(it as any).shadow_blur||10}px ${(it as any).shadow_spread||0}px ${(it as any).shadow_color}` : undefined }} />
                )}
                {it.type === "text" && (
                  editingId === it.id ? (
                    <input className={`bg-transparent outline-none px-1 ${selectedId===it.id?"ring-1 ring-foreground/50":""}`} style={{ minWidth: 80, fontSize: ((it as any).font_size||14), lineHeight: ((it as any).line_height||1.3) }} value={it.text || ""} onChange={(e)=>setItems(prev=>prev.map(x=>x.id===it.id?{...x,text:e.target.value}as BoardElement:x))} onBlur={(e)=>{ updateElement(it.id,{ text: e.target.value }); setEditingId(null); }} ref={(el)=>{ if (el && focusRequestId === it.id) { requestAnimationFrame(()=>{ el.focus(); el.select(); setFocusRequestId(null); }); } }} />
                  ) : (
                    <div className="px-1 select-none cursor-move" style={{ fontSize: ((it as any).font_size||14), lineHeight: ((it as any).line_height||1.3) }} onDoubleClick={(ev)=>{ ev.stopPropagation(); setEditingId(it.id); setFocusRequestId(it.id); }} title="Двойной клик для редактирования">{it.text || "Текст"}</div>
                  )
                )}
                {it.type === "arrow" && (
                  <svg width={(it.to_x||it.x) - it.x + 40} height={(it.to_y||it.y) - it.y + 40}>
                    <defs><marker id={`arrow-${it.id}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill={it.stroke || stroke} /></marker></defs>
                    <line x1={10} y1={10} x2={(it.to_x||it.x) - it.x + 10} y2={(it.to_y||it.y) - it.y + 10} stroke={it.stroke || stroke} strokeWidth={2} markerEnd={`url(#arrow-${it.id})`} />
                  </svg>
                )}
              </div>
              ))
            ))}
 
            {/* рамка мультивыделения */}
            {marquee && (<div className="absolute border border-blue-400/70 bg-blue-400/10" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />)}
          </div>
        </div>

        {/* Нижняя панель инструментов */}
        <div className="fixed left-1/2 -translate-x-1/2 bottom-3 z-20 border px-2.5 py-2 bg-background/95 rounded-full shadow-lg">
          <div className="flex items-center gap-2">
            <button onClick={()=>setTool("note")} className={`inline-flex items-center gap-2 rounded-none border px-3 py-2 text-xs ${tool==='note'?"bg-foreground/10":"hover:bg-foreground/10"}`}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h13l5 5v13H3z"/><path d="M16 3v6h6"/></svg><span className="hidden sm:inline">Стикер</span></button>
            <button onClick={()=>setTool("rect")} className={`inline-flex items-center gap-2 rounded-none border px-3 py-2 text-xs ${tool==='rect'?"bg-foreground/10":"hover:bg-foreground/10"}`}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="14" rx="2"/></svg><span className="hidden sm:inline">Прямоуг.</span></button>
            <button onClick={()=>setTool("ellipse")} className={`inline-flex items-center gap-2 rounded-none border px-3 py-2 text-xs ${tool==='ellipse'?"bg-foreground/10":"hover:bg-foreground/10"}`}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="12" rx="9" ry="6"/></svg><span className="hidden sm:inline">Эллипс</span></button>
            <button onClick={()=>setTool("arrow")} className={`inline-flex items-center gap-2 rounded-none border px-3 py-2 text-xs ${tool==='arrow'?"bg-foreground/10":"hover:bg-foreground/10"}`}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h12"/><path d="M13 5l7 7-7 7"/></svg><span className="hidden sm:inline">Стрелка</span></button>
            <button onClick={()=>setTool("text")} className={`inline-flex items-center gap-2 rounded-none border px-3 py-2 text-xs ${tool==='text'?"bg-foreground/10":"hover:bg-foreground/10"}`}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6V4h16в2"/><path d="M12 20V6"/></svg><span className="hidden sm:inline">Текст</span></button>
            <div className="ml-2 flex items-center gap-1 text-xs">
              <button className="rounded-none border px-2 py-1 hover:bg-foreground/10" onClick={() => setScale(s => Math.max(0.2, s*0.9))}>−</button>
              <div className="min-w-[56px] text-center">{Math.round(scale*100)}%</div>
              <button className="rounded-none border px-2 py-1 hover:bg-foreground/10" onClick={() => setScale(s => Math.min(4, s*1.1))}>+</button>
              <button className="rounded-none border px-2 py-1 hover:bg-foreground/10" onClick={() => { setScale(1); setOffset({x:0,y:0}); }}>Сброс</button>
              <button className={`rounded-none border px-2 py-1 ${snapEnabled?'bg-foreground/10':''}`} onClick={()=>setSnapEnabled(v=>!v)}>Snap</button>
              <div className="hidden sm:flex items-center gap-1 ml-2">
                <button className="rounded-none border px-2 py-1 hover:bg-foreground/10" title="Выровнять по левому" onClick={()=>alignSelected('left')}>⟸</button>
                <button className="rounded-none border px-2 py-1 hover:bg-foreground/10" title="По центру по X" onClick={()=>alignSelected('center')}>╳</button>
                <button className="rounded-none border px-2 py-1 hover:bg-foreground/10" title="По правому" onClick={()=>alignSelected('right')}>⟹</button>
                <button className="rounded-none border px-2 py-1 hover:bg-foreground/10" title="По верхнему" onClick={()=>alignSelected('top')}>⟰</button>
                <button className="rounded-none border px-2 py-1 hover:bg-foreground/10" title="По центру по Y" onClick={()=>alignSelected('middle')}>╳</button>
                <button className="rounded-none border px-2 py-1 hover:bg-foreground/10" title="По нижнему" onClick={()=>alignSelected('bottom')}>⟱</button>
              </div>
              <button className="rounded-none border px-2 py-1 hover:bg-foreground/10" onClick={exportPNG}>Export PNG</button>
            </div>
          </div>
        </div>

        {/* Ошибки */}
        {uiError && (
          <div className="fixed right-3 bottom-3 z-30 max-w-sm rounded border bg-red-500/10 text-red-600 text-xs px-3 py-2 shadow" onClick={()=>setUiError(null)}>
            Ошибка: {uiError}
          </div>
        )}
      </section>
    </main>
  );
}
