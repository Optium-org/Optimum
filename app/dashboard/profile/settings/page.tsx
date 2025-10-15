"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export default function ProfileSettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState<Date>(new Date());

  // preferences
  const [prefSound, setPrefSound] = useState<boolean>(true);
  const [prefConfetti, setPrefConfetti] = useState<boolean>(true);
  const [prefTgEnabled, setPrefTgEnabled] = useState<boolean>(false);
  const [prefTgChatId, setPrefTgChatId] = useState<string>("");
  const [prefTgBotUsername, setPrefTgBotUsername] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error) toast.error(error.message);
      if (!data.user) { router.replace("/login"); return; }
      const meta = data.user.user_metadata || {};
      const full = [meta.first_name, meta.last_name].filter(Boolean).join(" ") || meta.name || meta.full_name || null;
      setDisplayName(full);
      setFirstName(meta.first_name || "");
      setLastName(meta.last_name || "");
      setAvatarUrl(meta.avatar_url || meta.picture || null);
      setPrefSound(meta.pref_sound !== false); // по умолчанию true
      setPrefConfetti(meta.pref_confetti !== false); // по умолчанию true
      setPrefTgEnabled(!!meta.pref_tg_enabled);
      setPrefTgChatId(meta.pref_tg_chat_id || "");
      setPrefTgBotUsername(meta.pref_tg_bot_username || "");
      setEmail(data.user.email);
      setLoading(false);
    })();

    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => { mounted = false; clearInterval(t); };
  }, [router]);

  const timeLabel = useMemo(() => {
    try { return new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(now); }
    catch { return now.toLocaleString(); }
  }, [now]);

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          first_name: firstName,
          last_name: lastName,
          avatar_url: avatarUrl || undefined,
          pref_sound: prefSound,
          pref_confetti: prefConfetti,
          pref_tg_enabled: prefTgEnabled,
          pref_tg_chat_id: prefTgChatId || null,
          pref_tg_bot_username: prefTgBotUsername || null,
        },
      });
      if (error) throw error;
      // Сохраним объединённое имя и аватар в profiles
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (uid) {
        await supabase.from('profiles').upsert(
          { id: uid, display_name: [firstName, lastName].filter(Boolean).join(' ') || null, avatar_url: avatarUrl || null },
          { onConflict: 'id' }
        );
      }
      setDisplayName([firstName, lastName].filter(Boolean).join(" "));
      toast.success("Профиль обновлён");
    } catch (err: any) {
      toast.error(err?.message || "Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  }

  async function testSound() {
    try {
      const a = new Audio('/sounds/done.mp3');
      a.volume = 0.8;
      await a.play();
    } catch (e: any) {
      toast.message('Не удалось проиграть звук', { description: 'Проверьте, что файл /sounds/done.mp3 доступен' });
    }
  }

  async function testConfetti() {
    try {
      const confetti = (await import('canvas-confetti')).default;
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, scalar: 0.9, disableForReducedMotion: true });
    } catch {
      toast.message('Не удалось запустить конфетти', { description: 'Проверьте установку canvas-confetti' });
    }
  }

  async function sendTgTest() {
    if (!prefTgEnabled || !prefTgChatId) {
      toast.message('Telegram выключен или не задан Chat ID', { description: 'Включите уведомления и задайте chat_id' });
      return;
    }
    try {
      const r = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: prefTgChatId, text: '✅ Тестовое сообщение Momentum: уведомления подключены.' }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'telegram failed');
      toast.success('Тест отправлен в Telegram');
    } catch (e: any) {
      toast.error('Не удалось отправить в Telegram', { description: e?.message || 'Проверьте токен и chat_id' });
    }
  }

  async function onUploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { data: userData, error: uErr } = await supabase.auth.getUser();
      if (uErr) throw uErr;
      const userId = userData.user?.id;
      if (!userId) throw new Error("Нет пользователя");

      const ext = file.name.split(".").pop();
      const path = `${userId}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
      });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) throw new Error("Не удалось получить публичный URL");

      setAvatarUrl(publicUrl);
      const { error: updErr } = await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
      if (updErr) throw updErr;
      // также сохраним в profiles.avatar_url, чтобы чаты и профиль брали единый источник
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (uid) {
        await supabase.from('profiles').upsert(
          { id: uid, avatar_url: publicUrl },
          { onConflict: 'id' }
        );
      }
      toast.success("Аватар обновлён");
    } catch (err: any) {
      toast.error(err?.message || "Ошибка загрузки аватара. Убедитесь, что в Supabase создан bucket 'avatars' и он публичный.");
    } finally {
      e.target.value = "";
    }
  }

  async function handleLogout() {
    try { await supabase.auth.signOut(); router.replace('/'); }
    catch (e: any) { toast.error(e?.message || 'Не удалось выйти'); }
  }

  async function handleDeleteAccount() {
    const ok = window.confirm('Удалить аккаунт? Это действие необратимо. Будет отправлен запрос на удаление.');
    if (!ok) return;
    try {
      const { error } = await supabase.auth.updateUser({ data: { pref_delete_requested: true, pref_delete_requested_at: new Date().toISOString() } });
      if (error) throw error;
      toast.success('Запрос на удаление отправлен. Мы удалим аккаунт в ближайшее время.');
      await supabase.auth.signOut();
      router.replace('/');
    } catch (e: any) {
      toast.error(e?.message || 'Не удалось отправить запрос на удаление');
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
            <a className={`${linkBase} ${pathname === "/dashboard/subscription" ? linkActive : linkHover}`} href="/dashboard/subscription">
              <Image src="/dashboard/subscription.png" alt="Подписка" width={16} height={16} className="opacity-80" />
              Подписка
            </a>
            <a className={`${linkBase} ${pathname === "/dashboard/profile/settings" ? linkActive : linkHover}`} href="/dashboard/profile/settings">
              <Image src="/dashboard/subscription.png" alt="Настройки" width={16} height={16} className="opacity-80" />
              Настройки
            </a>
          </nav>
          <div className="mt-auto pt-4 border-t">
            <button onClick={() => router.push('/dashboard/profile')} className="w-full flex items-center gap-3 px-3 py-2 rounded-none hover:bg-foreground/10 text-left">
              <div className="h-8 w-8 rounded-full border bg-foreground/10 overflow-hidden" aria-hidden />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{displayName || 'Профиль'}</div>
                <div className="text-xs text-foreground/60 truncate">{email}</div>
              </div>
            </button>
          </div>
        </aside>

        {/* Content */}
        <section className="relative bg-background/80">
          {/* Top bar */}
          <div className="sticky top-0 z-10 border-b px-4 lg:px-8 py-4 flex items-center justify-between bg-background/80 backdrop-blur">
            <div className="text-sm text-foreground/80">Настройки профиля</div>
            <div className="text-xs sm:text-sm text-foreground/70">{timeLabel}</div>
          </div>

          <div className="px-4 lg:px-8 py-10 lg:py-16">
            <div className="mx-auto max-w-3xl">
              <div className="rounded-none border bg-background/10 p-6">
                <h1 className="text-xl sm:text-2xl font-semibold mb-4">Параметры аккаунта</h1>
                <form className="grid grid-cols-1 gap-4" onSubmit={onSaveProfile}>
                  <div className="flex items-center gap-4">
                    <div className="relative h-16 w-16 rounded-full border bg-foreground/10 overflow-hidden">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                      ) : null}
                      {/* overlay camera button */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full border bg-background flex items-center justify-center shadow-sm hover:bg-foreground/10"
                        title="Изменить аватар"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2z"/>
                          <circle cx="12" cy="13" r="4"/>
                        </svg>
                      </button>
                    </div>
                    <div className="text-xs">
                      <div className="mb-2 text-foreground/60">Аватар</div>
                      <div className="flex items-center gap-2">
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={onUploadAvatar} className="hidden" />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-none border px-3 py-2 hover:bg-foreground/10"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2z"/>
                            <circle cx="12" cy="13" r="4"/>
                          </svg>
                          Изменить аватар
                        </button>
                      </div>
                      <div className="mt-1 text-[11px] text-foreground/50">PNG/JPG, до 5 МБ. Кликните на кнопку или на иконку на аватаре.</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-foreground/60 mb-1">Имя</div>
                      <input className="w-full rounded-none border bg-background/10 px-3 py-2 outline-none" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Имя" />
                    </div>
                    <div>
                      <div className="text-xs text-foreground/60 mb-1">Фамилия</div>
                      <input className="w-full rounded-none border bg-background/10 px-3 py-2 outline-none" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Фамилия" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-foreground/60">Email</div>
                      <div className="text-sm">{email}</div>
                    </div>
                  </div>

                  {/* Preferences */}
                  <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-none border bg-background/10 p-3">
                      <div className="text-sm font-medium mb-2">Поведение</div>
                      <label className="flex items-center justify-between text-sm py-1"><span>Звук при завершении</span><input type="checkbox" checked={prefSound} onChange={(e)=>setPrefSound(e.target.checked)} /></label>
                      <label className="flex items-center justify-between text-sm py-1"><span>Конфетти при завершении</span><input type="checkbox" checked={prefConfetti} onChange={(e)=>setPrefConfetti(e.target.checked)} /></label>
                      <div className="flex gap-2 mt-2">
                        <button type="button" onClick={testSound} className="rounded-none border px-2 py-1 text-xs hover:bg-foreground/10">Тест звука</button>
                        <button type="button" onClick={testConfetti} className="rounded-none border px-2 py-1 text-xs hover:bg-foreground/10">Тест конфетти</button>
                      </div>
                    </div>

                    <div className="rounded-none border bg-background/10 p-3">
                      <div className="text-sm font-medium mb-2">Telegram уведомления</div>
                      <label className="flex items-center justify-between text-sm py-1"><span>Включить уведомления</span><input type="checkbox" checked={prefTgEnabled} onChange={(e)=>setPrefTgEnabled(e.target.checked)} /></label>
                      <label className="text-xs block mt-2"><span className="block mb-1 text-foreground/60">Имя бота</span><input className="w-full rounded-none border bg-background/10 px-3 py-2 text-sm" value={prefTgBotUsername} onChange={(e)=>setPrefTgBotUsername(e.target.value)} placeholder="username без @" /></label>
                      <label className="text-xs block mt-2"><span className="block mb-1 text-foreground/60">Chat ID</span><input className="w-full rounded-none border bg-background/10 px-3 py-2 text-sm" value={prefTgChatId} onChange={(e)=>setPrefTgChatId(e.target.value)} placeholder="123456789" /></label>
                      <div className="text-[11px] text-foreground/60 mt-2">Чтобы узнать chat_id, отправьте /start вашему боту и следуйте инструкции.</div>
                      <div className="flex gap-2 mt-2">
                        <button type="button" onClick={() => { if (!prefTgBotUsername) return; window.open(`https://t.me/${prefTgBotUsername}_bot`, '_blank'); }} className="rounded-none border px-2 py-1 text-xs hover:bg-foreground/10" disabled={!prefTgBotUsername}>Открыть бота</button>
                        <button type="button" onClick={sendTgTest} className="rounded-none border px-2 py-1 text-xs hover:bg-foreground/10" disabled={!prefTgEnabled || !prefTgChatId}>Отправить тест</button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2">
                    <button type="submit" disabled={saving} className="px-4 py-2 rounded-none border hover:bg-foreground/10">{saving ? "Сохраняем…" : "Сохранить"}</button>
                    <div className="mt-3 flex items-center gap-2">
                      <button type="button" onClick={handleLogout} className="rounded-none border px-3 py-2 text-xs hover:bg-foreground/10">Выйти</button>
                      <button type="button" onClick={handleDeleteAccount} className="rounded-none border px-3 py-2 text-xs hover:bg-red-500/10">Удалить аккаунт</button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
