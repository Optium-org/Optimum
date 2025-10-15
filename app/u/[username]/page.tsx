"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  verified: boolean | null;
};

export default function PublicProfilePage({ params }: { params: { username: string } }) {
  const router = useRouter();
  const usernameParam = (params?.username || "").toLowerCase();
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await supabase.auth.getUser();
      if (!cancelled) setMeId(me.data.user?.id || null);
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, verified")
        .ilike("username", usernameParam)
        .maybeSingle();
      if (!cancelled) setProfile((data || null) as any);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [usernameParam]);

  const isSelf = useMemo(() => meId && profile && meId === profile.id, [meId, profile]);

  async function startDirectChat() {
    if (!profile || !meId) { router.push("/dashboard/chats"); return; }
    setBusy(true);
    try {
      // найдём существующий 1-на-1 чат
      const { data: myChats } = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('user_id', meId);
      const ids = (myChats || []).map((r: any) => r.chat_id);
      if (ids.length) {
        const { data: existing } = await supabase
          .from('chat_members')
          .select('chat_id')
          .in('chat_id', ids)
          .eq('user_id', profile.id)
          .limit(1)
          .maybeSingle();
        if (existing?.chat_id) {
          try { localStorage.setItem('open_chat_id', existing.chat_id as string); } catch {}
          router.push('/dashboard/chats');
          return;
        }
      }
      // создадим новый чат
      const { data: chatIns, error: chatErr } = await supabase
        .from('chats')
        .insert({ name: profile.display_name || (profile.username ? `@${profile.username}` : 'Личный чат'), is_group: false })
        .select('id')
        .single();
      if (chatErr || !chatIns) { router.push('/dashboard/chats'); return; }
      const chatId = chatIns.id as string;
      await supabase.from('chat_members').insert([
        { chat_id: chatId, user_id: meId },
        { chat_id: chatId, user_id: profile.id },
      ] as any);
      try { localStorage.setItem('open_chat_id', chatId); } catch {}
      router.push('/dashboard/chats');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center">
        <div className="text-sm text-foreground/70">Загрузка…</div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center">
        <div className="text-sm text-foreground/70">Профиль не найден</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full">
      <section className="px-4 lg:px-8 py-10">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-lg border bg-background/10 overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-foreground/15 via-foreground/30 to-foreground/15" />
            <div className="p-4 flex items-start gap-4">
              <div className="-mt-12 h-20 w-20 rounded-full overflow-hidden border bg-background flex-shrink-0">
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt={profile.display_name || profile.username || 'avatar'} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-foreground/10" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-lg font-semibold truncate flex items-center gap-2">
                    <span>{profile.display_name || 'Пользователь'}</span>
                    {profile.verified ? (<Image src="/verification/check.png" alt="verified" width={16} height={16} className="opacity-90" />) : null}
                    {profile.username ? (
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(`@${profile.username}`); }}
                        className="text-xs font-mono text-foreground/60 hover:underline"
                        title="Скопировать @username"
                      >
                        @{profile.username}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 text-xs text-foreground/70">ID: {profile.id}</div>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    disabled={busy || isSelf}
                    onClick={startDirectChat}
                    className="rounded-md border px-3 py-2 text-xs hover:bg-foreground/10 disabled:opacity-60"
                    title={isSelf ? 'Это вы' : 'Начать личный чат'}
                  >
                    {isSelf ? 'Это вы' : (busy ? 'Создаём чат…' : 'Начать чат')}
                  </button>
                  <a href="/dashboard/chats" className="rounded-md border px-3 py-2 text-xs hover:bg-foreground/10">К чатам</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
