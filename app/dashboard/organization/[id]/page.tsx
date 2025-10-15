"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useParams, useSearchParams } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

export default function OrganizationDetailPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const orgId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

  type Org = { id: string; name: string; owner_id: string; avatar_url?: string | null; description?: string | null };
  type Member = { org_id: string; user_id: string; role: string };
  type Invite = { id: string; org_id: string; email: string; role: string; status: string; token?: string | null };

  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  type Tab = 'overview' | 'members' | 'invites' | 'settings';
  const tabParam = (searchParams?.get('tab') as Tab) || 'overview';
  const [tab, setTab] = useState<Tab>(tabParam);
  const [memberQuery, setMemberQuery] = useState("");

  // human-readable users map
  type HRUser = { id: string; email: string | null; name: string | null };
  const [userMap, setUserMap] = useState<Record<string, HRUser>>({});
  const [loadingUsers, setLoadingUsers] = useState(false);

  // inline edit org
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);

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
      await loadAll();
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [orgId, router]);

  // sync tab to URL and from URL
  useEffect(() => {
    // on param change, update state
    if (tabParam && tabParam !== tab) setTab(tabParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  useEffect(() => {
    // push to URL when tab changes
    const sp = new URLSearchParams(Array.from(searchParams?.entries?.() || []));
    sp.set('tab', tab);
    const url = `${pathname}?${sp.toString()}`;
    router.replace(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function loadAll() {
    if (!orgId) return;
    const { data: orgData } = await supabase.from('orgs').select('id,name,owner_id,avatar_url,description').eq('id', orgId).maybeSingle();
    setOrg(orgData as any);
    const { data: memData } = await supabase.from('org_members').select('org_id,user_id,role').eq('org_id', orgId);
    const mem = (memData || []) as Member[];
    setMembers(mem);
    const { data: invData } = await supabase.from('org_invites').select('id,org_id,email,role,status,token').eq('org_id', orgId);
    setInvites((invData || []) as any);

    // fetch human-readable users
    const ids = Array.from(new Set(mem.map(m => m.user_id)));
    if (ids.length) {
      setLoadingUsers(true);
      try {
        const res = await fetch(`/api/users/by-ids?ids=${encodeURIComponent(ids.join(','))}`);
        const json = await res.json();
        if (json?.ok && Array.isArray(json.users)) {
          const map: Record<string, HRUser> = {};
          for (const u of json.users) map[u.id] = u;
          setUserMap(map);
        }
      } catch {}
      setLoadingUsers(false);
    }
    // prepare drafts
    if (orgData) {
      setNameDraft((orgData as any).name || "");
      setDescDraft((orgData as any).description || "");
    }
  }

  const myRole = useMemo(() => {
    if (!userId) return null;
    if (org?.owner_id === userId) return 'owner';
    const m = members.find(x => x.user_id === userId);
    return m?.role || null;
  }, [userId, org, members]);

  const canManage = myRole === 'owner' || myRole === 'admin';
  const membersCount = members.length;
  const invitesPending = invites.filter(i => i.status === 'pending').length;
  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m => m.user_id.toLowerCase().includes(q) || (m.role||'').toLowerCase().includes(q));
  }, [members, memberQuery]);

  function RoleBadge({ role }: { role: string }) {
    const cls = role === 'owner'
      ? 'border-emerald-600/50 text-emerald-600 bg-emerald-500/10'
      : role === 'admin'
        ? 'border-sky-600/50 text-sky-600 bg-sky-500/10'
        : 'border-foreground/40 text-foreground/70 bg-foreground/5';
    return <span className={`text-[10px] px-1.5 py-[2px] rounded-none border ${cls}`}>{role}</span>;
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      const token = crypto.randomUUID();
      const { error } = await supabase.from('org_invites').insert({ org_id: orgId, email: inviteEmail.trim(), role: inviteRole, status: 'pending', token });
      if (error) throw error;
      setInviteEmail("");
      await loadAll();
    } catch (e: any) {
      alert(e?.message || 'Не удалось отправить приглашение');
    } finally {
      setInviting(false);
    }
  }

  async function onRoleChange(targetUserId: string, role: string) {
    if (!canManage) return;
    try {
      await supabase.from('org_members').update({ role }).eq('org_id', orgId).eq('user_id', targetUserId);
      await loadAll();
    } catch (e: any) {
      alert(e?.message || 'Не удалось изменить роль');
    }
  }

  async function onLeave() {
    if (!userId) return;
    const ok = window.confirm('Выйти из организации?');
    if (!ok) return;
    try {
      await supabase.from('org_members').delete().eq('org_id', orgId).eq('user_id', userId);
      router.replace('/dashboard/organization');
    } catch (e: any) {
      alert(e?.message || 'Не удалось выйти');
    }
  }

  async function onUploadAvatar(file: File) {
    if (!orgId) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${orgId}.${ext}`;
      const { error: upErr } = await supabase.storage.from('org-avatars').upload(path, file, { upsert: true, contentType: file.type || 'image/png' });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('org-avatars').getPublicUrl(path);
      await supabase.from('orgs').update({ avatar_url: pub.publicUrl }).eq('id', orgId);
      await loadAll();
    } catch (e: any) {
      alert(e?.message || 'Не удалось загрузить аватар');
    } finally {
      setUploading(false);
    }
  }

  async function onDeleteOrg() {
    if (!orgId || !userId || myRole !== 'owner') return;
    const ok = window.confirm('Удалить организацию безвозвратно? Все данные (участники, инвайты) будут удалены.');
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/orgs/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, ownerId: userId })
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || 'Не удалось удалить организацию');
      router.replace('/dashboard/organization');
    } catch (e: any) {
      alert(e?.message || 'Ошибка удаления организации');
    } finally {
      setDeleting(false);
    }
  }

  async function saveOrgField(field: 'name' | 'description') {
    if (!canManage || !orgId) return;
    setSavingOrg(true);
    try {
      const patch: any = {};
      if (field === 'name') patch.name = nameDraft.trim() || org?.name || null;
      if (field === 'description') patch.description = descDraft || null;
      const { error } = await supabase.from('orgs').update(patch).eq('id', orgId);
      if (error) throw error;
      await loadAll();
      if (field === 'name') setEditingName(false);
      if (field === 'description') setEditingDesc(false);
    } catch (e: any) {
      alert(e?.message || 'Не удалось сохранить');
    } finally {
      setSavingOrg(false);
    }
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
          <div className="mt-auto pt-4 border-t">
            <button onClick={() => router.push('/dashboard/profile')} className="w-full flex items-center gap-3 px-3 py-2 rounded-none hover:bg-foreground/10 text-left">
              <div className="h-8 w-8 rounded-full border bg-foreground/10 overflow-hidden" aria-hidden>
                {userAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={userAvatarUrl} alt="avatar" className="h-full w-full object-cover" />
                ) : null}
              </div>
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
            <div className="flex items-center gap-3 min-w-0">
              <Image src={org?.avatar_url || "/dashboard/organization.png"} alt="Организация" width={24} height={24} className="rounded-sm border" />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{org?.name || 'Организация'}</div>
                <div className="text-[11px] text-foreground/60 truncate">Ваша роль: {myRole || '—'}</div>
              </div>
            </div>
            {myRole === 'owner' && (
              <button onClick={()=>router.push(`/dashboard/organization/${orgId}#settings`)} className="rounded-none border px-3 py-2 text-xs hover:bg-foreground/10">Настройки</button>
            )}
          </div>

          {/* Mini header (tabs) */}
          <div className="px-4 lg:px-8 border-b bg-background">
            <div className="mx-auto max-w-4xl overflow-x-auto">
              <div className="flex items-end gap-1">
                {(
                  [
                    { id: 'overview', label: 'Overview' },
                    { id: 'members', label: 'Members', count: membersCount },
                    { id: 'invites', label: 'Invites', count: invitesPending },
                    { id: 'settings', label: 'Settings' },
                  ] as Array<{id: Tab; label: string; count?: number}>
                ).map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`relative px-3 py-2 text-xs border-b-2 -mb-px ${tab===t.id ? 'border-foreground text-foreground' : 'border-transparent text-foreground/70 hover:text-foreground'}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span>{t.label}</span>
                      {typeof t.count === 'number' && (
                        <span className="text-[10px] rounded-none border bg-background/60 px-1.5 py-[2px]">{t.count}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Full-width organization hero (Overview) */}
          {tab === 'overview' && (
            <div className="w-full border-b bg-background/10">
              <div className="h-24 sm:h-32 bg-gradient-to-r from-foreground/15 via-foreground/35 to-foreground/15" />
              <div className="px-4 lg:px-8 py-4">
                <div className="flex items-start gap-4 sm:gap-6">
                  <div className="-mt-12 sm:-mt-16 h-20 w-20 sm:h-24 sm:w-24 rounded-sm border bg-background overflow-hidden flex-shrink-0">
                    <Image src={org?.avatar_url || "/dashboard/organization.png"} alt="Аватар" width={96} height={96} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {editingName ? (
                        <div className="flex items-center gap-2">
                          <input value={nameDraft} onChange={(e)=>setNameDraft(e.target.value)} className="rounded-none border bg-background px-2 py-1 text-sm" />
                          <button disabled={savingOrg || !nameDraft.trim()} onClick={()=>saveOrgField('name')} className="rounded-none border px-2 py-1 text-xs hover:bg-foreground/10">Сохранить</button>
                          <button disabled={savingOrg} onClick={()=>{ setEditingName(false); setNameDraft(org?.name || ''); }} className="rounded-none border px-2 py-1 text-xs hover:bg-foreground/10">Отмена</button>
                        </div>
                      ) : (
                        <div className="text-lg sm:text-xl font-semibold truncate">{org?.name || 'Организация'}</div>
                      )}
                      {myRole && (
                        <span className="text-[10px] px-1.5 py-[2px] rounded-none border bg-background/60 text-foreground/80">{myRole}</span>
                      )}
                      {canManage && !editingName && (
                        <button onClick={()=>setEditingName(true)} className="rounded-none border px-2 py-1 text-xs hover:bg-foreground/10">Редактировать</button>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-foreground/70 whitespace-pre-wrap">
                      {editingDesc ? (
                        <div className="flex items-start gap-2">
                          <textarea value={descDraft} onChange={(e)=>setDescDraft(e.target.value)} className="w-full rounded-none border bg-background px-2 py-1 text-xs min-h-[80px]" />
                          <div className="flex flex-col gap-2">
                            <button disabled={savingOrg} onClick={()=>saveOrgField('description')} className="rounded-none border px-2 py-1 text-xs hover:bg-foreground/10">Сохранить</button>
                            <button disabled={savingOrg} onClick={()=>{ setEditingDesc(false); setDescDraft(org?.description || ''); }} className="rounded-none border px-2 py-1 text-xs hover:bg-foreground/10">Отмена</button>
                          </div>
                        </div>
                      ) : (
                        <>{org?.description || 'Описание не задано'}</>
                      )}
                    </div>
                    {canManage && !editingDesc && (
                      <div className="mt-2">
                        <button onClick={()=>setEditingDesc(true)} className="rounded-none border px-2 py-1 text-xs hover:bg-foreground/10">Изменить описание</button>
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-3 text-[11px] text-foreground/70">
                      <span className="rounded-none border bg-background/60 px-2 py-1">Участников: {membersCount}</span>
                      <span className="rounded-none border bg-background/60 px-2 py-1">Инвайтов: {invitesPending} в ожидании</span>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex flex-col gap-2">
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) onUploadAvatar(f); }} />
                      <button onClick={()=>fileInputRef.current?.click()} disabled={uploading} className="rounded-none border px-3 py-2 text-xs hover:bg-foreground/10 whitespace-nowrap">
                        {uploading ? 'Загрузка…' : 'Загрузить аватар'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="px-4 lg:px-8 py-8">
            <div className="mx-auto max-w-4xl space-y-6">
              {/* Overview: дополнительный контент можно добавить ниже при необходимости */}

              {/* Members */}
              {tab === 'members' && (
              <div className="rounded-none border bg-background/10">
                <div className="px-5 py-4 border-b flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {/* Users icon (SVG) */}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="opacity-80"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <div className="text-sm font-medium">Участники</div>
                    <span className="ml-2 text-[11px] text-foreground/60">{filteredMembers.length}/{membersCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <input
                        value={memberQuery}
                        onChange={(e)=>setMemberQuery(e.target.value)}
                        placeholder="Поиск по участникам…"
                        className="rounded-none border bg-background px-3 py-1.5 text-xs min-w-[220px]"
                      />
                      <span className="pointer-events-none absolute right-2 top-1.5 opacity-60">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                      </span>
                    </div>
                    {myRole !== 'owner' && (
                      <button onClick={onLeave} className="rounded-none border px-2 py-1 text-xs hover:bg-foreground/10">Выйти</button>
                    )}
                    {canManage && (
                      <button onClick={()=>setTab('invites')} className="rounded-none border px-2 py-1 text-xs hover:bg-foreground/10 flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8"/><path d="M21 8v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><path d="M3 8l9 6 9-6"/></svg>
                        Пригласить
                      </button>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  {members.length === 0 ? (
                    <div className="text-xs text-foreground/60">Пока нет участников.</div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="text-xs text-foreground/60">Ничего не найдено по запросу «{memberQuery}».</div>
                  ) : (
                    <div className="space-y-2">
                      {filteredMembers.map((m) => (
                        <div key={m.user_id} className="flex items-center justify-between rounded-none border bg-background px-3 py-2">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Аватар-заглушка с инициалами */}
                            <div className="h-7 w-7 rounded-sm border bg-foreground/10 flex items-center justify-center text-[10px] text-foreground/70">
                              {m.user_id.slice(0,2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium truncate">{userMap[m.user_id]?.name || userMap[m.user_id]?.email || m.user_id}</div>
                              <div className="text-[10px] text-foreground/60 truncate">{userMap[m.user_id]?.email || m.user_id}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <RoleBadge role={m.role} />
                            {canManage && org?.owner_id !== m.user_id && (
                              <select className="text-xs rounded-none border bg-background px-2 py-1" value={m.role} onChange={(e)=>onRoleChange(m.user_id, e.target.value)}>
                                <option value="member">member</option>
                                <option value="admin">admin</option>
                              </select>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* Invites */}
              {tab === 'invites' && (
              <div className="rounded-none border bg-background/10">
                <div className="px-5 py-4 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm border bg-background/70 text-[10px]">✉️</span>
                    <div className="text-sm font-medium">Приглашения</div>
                    <span className="ml-2 text-[11px] text-foreground/60">ожидают: {invitesPending}</span>
                  </div>
                </div>
                <div className="p-4">
                  {!canManage ? (
                    <div className="text-xs text-foreground/60">Недостаточно прав для управления приглашениями.</div>
                  ) : (
                    <>
                      <form onSubmit={onInvite} className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs mb-3">
                        <input className="rounded-none border bg-background px-3 py-2" type="email" placeholder="email@example.com" value={inviteEmail} onChange={(e)=>setInviteEmail(e.target.value)} />
                        <select className="rounded-none border bg-background px-3 py-2" value={inviteRole} onChange={(e)=>setInviteRole(e.target.value)}>
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                        </select>
                        <button type="submit" disabled={inviting} className="rounded-none border px-3 py-2 hover:bg-foreground/10">{inviting ? 'Отправляем…' : 'Пригласить'}</button>
                      </form>
                      <div className="text-[11px] text-foreground/60">Ссылка для принятия: /dashboard/organization/invite/[token]</div>
                      <div className="mt-3 space-y-2">
                        {invites.length === 0 ? (
                          <div className="text-xs text-foreground/60">Нет активных приглашений.</div>
                        ) : invites.map((i) => (
                          <div key={i.id} className="flex items-center justify-between rounded-none border bg-background px-3 py-2 text-xs">
                            <div className="min-w-0">
                              <div className="truncate">
                                <span className="font-medium">{i.email}</span>
                                <span className="mx-2 text-foreground/50">•</span>
                                <span className="text-foreground/70">{i.role}</span>
                              </div>
                              <div className="text-[10px] text-foreground/60 mt-0.5">status: 
                                <span className={`ml-1 rounded-none border px-1 py-[1px] ${i.status==='pending'?'bg-yellow-500/10 text-yellow-600 border-yellow-600/50': i.status==='accepted'?'bg-emerald-500/10 text-emerald-600 border-emerald-600/50':'bg-foreground/10 text-foreground/70'}`}>{i.status}</span>
                              </div>
                            </div>
                            {i.token && (
                              <a className="rounded-none border px-2 py-1 hover:bg-foreground/10" href={`/dashboard/organization/invite/${i.token}`} target="_blank">Скопировать ссылку</a>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              )}

              {/* Settings (Опасная зона) */}
              {myRole === 'owner' && tab === 'settings' && (
                <div id="settings" className="rounded-none border bg-background/10">
                  <div className="px-5 py-4 border-b flex items-center gap-2 text-red-600">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-red-600/40">⚠️</span>
                    <div className="text-sm font-medium">Опасная зона</div>
                  </div>
                  <div className="p-4">
                    <div className="text-xs text-foreground/70 mb-3">Удаление организации безвозвратно. Все участники и приглашения будут удалены.</div>
                    <button onClick={onDeleteOrg} disabled={deleting} className="rounded-none border border-red-600 text-red-600 px-3 py-2 text-xs hover:bg-red-600/10">
                      {deleting ? 'Удаляем…' : 'Удалить организацию'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
