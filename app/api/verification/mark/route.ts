import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOT_VERIFICATION_SECRET = process.env.BOT_VERIFICATION_SECRET;

if (!SUPABASE_URL) {
  // В дев/CI отдадим явную ошибку конфигурации
  console.warn('ENV: SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL не задан');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('ENV: SUPABASE_SERVICE_ROLE_KEY не задан — эндпоинт не сможет обновлять auth.users');
}

export async function POST(req: NextRequest) {
  try {
    const headerSecret = req.headers.get('x-bot-secret');
    if (!BOT_VERIFICATION_SECRET || headerSecret !== BOT_VERIFICATION_SECRET) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const email = (body?.email || '').toString().trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ ok: false, error: 'email is required' }, { status: 400 });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ ok: false, error: 'server is not configured' }, { status: 500 });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1) Найдём пользователя по email. Service-role позволяет читать auth.users через PostgREST
    const { data: userRow, error: findErr } = await admin
      .from('auth.users')
      .select('id, email, user_metadata')
      .eq('email', email)
      .maybeSingle();

    if (findErr) {
      return NextResponse.json({ ok: false, error: findErr.message }, { status: 500 });
    }
    if (!userRow) {
      return NextResponse.json({ ok: false, error: 'user not found' }, { status: 404 });
    }

    const userId: string = userRow.id;
    const currentMeta = (userRow as any).user_metadata || {};

    // 2) Обновим флаг verified в auth (мердж метаданных)
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: { ...currentMeta, verified: true },
    });
    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }

    // 3) Синхронно отметим все существующие посты этого пользователя как author_verified=true
    const { error: postsErr } = await admin
      .from('posts')
      .update({ author_verified: true } as any)
      .eq('user_id', userId);
    if (postsErr) {
      // Не критично для API — логируем и продолжаем
      console.warn('Failed to update posts author_verified:', postsErr.message);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'internal error' }, { status: 500 });
  }
}
