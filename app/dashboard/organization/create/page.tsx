"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

export default function OrganizationCreatePage() {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

  // form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [checkingName, setCheckingName] = useState(false);
  const [nameTaken, setNameTaken] = useState<boolean | null>(null);

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
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [router]);

  useEffect(() => {
    const value = name.trim();
    if (!value) { setNameTaken(null); return; }
    let active = true;
    setCheckingName(true);
    const t = setTimeout(async () => {
      try {
        // регистронезависимая проверка точного совпадения имени
        const { data, error } = await supabase
          .from('orgs')
          .select('id', { count: 'exact', head: true })
          .ilike('name', value);
        if (!active) return;
        if (error) throw error;
        setNameTaken((data as any) !== null && (data as any).length === 0 ? false : (data as any) === null ? false : true);
      } catch {
        // в случае ошибок при проверке не блокируем, но и не утверждаем доступность
        setNameTaken(null);
      } finally {
        if (active) setCheckingName(false);
      }
    }, 400);
    return () => { active = false; clearTimeout(t); };
  }, [name, supabase]);

  const linkBase = "flex items-center gap-3 rounded-none px-3 py-2";
  const linkHover = "hover:bg-foreground/10";
  const linkActive = "bg-foreground/10 text-foreground";

  function onPickFile() {
    fileInputRef.current?.click();
  }
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setAvatarFile(f);
    if (f) setPreviewUrl(URL.createObjectURL(f)); else setPreviewUrl(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (!name.trim()) { setErrorMsg("Введите название организации"); return; }
    try {
      // финальная проверка занятости имени на сервере
      const { data, error } = await supabase
        .from('orgs')
        .select('id', { count: 'exact', head: true })
        .ilike('name', name.trim());
      if (error) throw error;
      const isTaken = (data as any) !== null && (data as any).length > 0;
      if (isTaken) { setErrorMsg('Название уже занято'); return; }
    } catch {
      // игнорируем сетевые сбои: продолжим, но сабмит всё равно защитит уник. индекс, если добавите его позже
    }
    setSubmitting(true); setErrorMsg(null);
    try {
      // 1) создаём организацию (без аватара)
      const { data: created, error } = await supabase.from('orgs').insert({ name: name.trim(), owner_id: userId, description: description.trim() || null }).select('id').single();
      if (error) throw error;
      const orgId = created!.id as string;

      // 2) если есть файл — загружаем в Storage и обновляем avatar_url
      if (avatarFile) {
        const ext = (avatarFile.name.split('.').pop() || 'png').toLowerCase();
        const path = `${orgId}.${ext}`;
        const { error: upErr } = await supabase.storage.from('org-avatars').upload(path, avatarFile, { upsert: true, contentType: avatarFile.type || 'image/png' });
        if (upErr) {
          const msg = String(upErr?.message || upErr);
          if (/bucket/i.test(msg) && /not\s*found/i.test(msg)) {
            throw new Error('Бакет org-avatars не найден. Создайте публичный бакет "org-avatars" в Supabase Storage и повторите.');
          }
          throw upErr;
        }
        const { data: pub } = supabase.storage.from('org-avatars').getPublicUrl(path);
        await supabase.from('orgs').update({ avatar_url: pub.publicUrl }).eq('id', orgId);
      }

      // 3) добавляем владельца в участники
      await supabase.from('org_members').insert({ org_id: orgId, user_id: userId, role: 'owner' });

      router.replace('/dashboard/organization');
    } catch (e: any) {
      setErrorMsg(e?.message || 'Не удалось создать организацию');
    } finally {
      setSubmitting(false);
    }
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
            <a className={`${linkBase} ${pathname?.startsWith("/dashboard/organization") ? linkActive : linkHover}`} href="/dashboard/organization">
              <Image src="/dashboard/subscription.png" alt="Организация" width={16} height={16} className="opacity-80" />
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
          <div className="px-4 lg:px-8 pt-6 pb-4 border-b bg-background/80">
            <div className="flex items-center gap-4">
              <Image src="/dashboard/subscription.png" alt="Организация" width={28} height={28} className="opacity-90" />
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold">Создать организацию</h1>
                <p className="text-xs sm:text-sm text-foreground/70 mt-1">Название обязательно. Аватар и описание можно добавить позже.</p>
              </div>
            </div>
          </div>

          <div className="mb-6 rounded-none border overflow-hidden bg-background/10">
                          <Image
                            src="/organization/banner.jpg"
                            alt="Подписка Momentum — больше возможностей"
                            width={1600}
                            height={600}
                            className="w-full h-auto object-cover"
                            priority
                          />
                          <div className="px-4 py-3 text-xs text-foreground/80 border-t">
                            Создайте организацию и получите возможность добавлять участников, создавать задачи и получать уведомления.
                          </div>
                        </div>

          <div className="px-4 lg:px-8 py-8 max-w-3xl">
            <form onSubmit={onSubmit} className="space-y-4">
              {errorMsg && (
                <div className="rounded-none border border-red-500/50 bg-red-500/5 px-3 py-2 text-xs text-red-600">{errorMsg}</div>
              )}

              <label className="text-xs block">
                <span className="block mb-1 text-foreground/60">Название организации</span>
                <input
                  className="w-full rounded-none border bg-background px-3 py-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Например, Acme Inc"
                  required
                />
                <div className="mt-1 text-[11px] min-h-[16px]">
                  {checkingName && <span className="text-foreground/60">Проверяем доступность…</span>}
                  {!checkingName && name.trim() && nameTaken === true && (
                    <span className="text-red-600">Название уже занято</span>
                  )}
                  {!checkingName && name.trim() && nameTaken === false && (
                    <span className="text-emerald-600">Название свободно</span>
                  )}
                </div>
              </label>

              <div className="text-xs">
                <span className="block mb-1 text-foreground/60">Аватар (файл, опционально)</span>
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-sm border bg-foreground/10 overflow-hidden flex items-center justify-center">
                    {previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewUrl} alt="preview" className="h-full w-full object-cover" />
                    ) : (
                      <Image src="/dashboard/subscription.png" alt="placeholder" width={28} height={28} className="opacity-70" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
                    <button type="button" onClick={onPickFile} className="rounded-none border px-3 py-2 text-xs hover:bg-foreground/10">Выбрать файл</button>
                    {previewUrl && (
                      <button type="button" onClick={()=>{ setAvatarFile(null); setPreviewUrl(null); }} className="rounded-none border px-3 py-2 text-xs hover:bg-foreground/10">Очистить</button>
                    )}
                  </div>
                </div>
              </div>

              <label className="text-xs block">
                <span className="block mb-1 text-foreground/60">Описание</span>
                <textarea
                  className="w-full rounded-none border bg-background px-3 py-2 min-h-[100px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Коротко опишите назначение организации"
                />
              </label>

              <div className="flex items-center gap-2">
                <button type="button" onClick={() => router.push('/dashboard/organization')} className="rounded-none border px-3 py-2 text-xs hover:bg-foreground/10">Отмена</button>
                <button type="submit" disabled={submitting || !name.trim() || nameTaken === true || checkingName} className="rounded-none border px-3 py-2 text-xs hover:bg-foreground/10">
                  {submitting ? 'Создаём…' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
