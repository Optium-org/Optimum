import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const room_id = (body.room_id || '').toString();
    const topic = (body.topic || 'Общий').toString();
    const difficulty = (body.difficulty || 'easy').toString();
    const question_count = Math.max(1, Math.min(50, parseInt(body.question_count ?? '10', 10) || 10));
    const question_duration_seconds = Math.max(5, Math.min(600, parseInt(body.question_duration_seconds ?? '30', 10) || 30));

    if (!room_id) return NextResponse.json({ ok: false, error: 'room_id is required' }, { status: 400 });
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ ok: false, error: 'server is not configured' }, { status: 500 });
    }
    if (!OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: 'OPENAI_API_KEY is not set' }, { status: 500 });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Проверим, что комната существует
    const { data: room, error: roomErr } = await admin.from('quiz_rooms').select('id').eq('id', room_id).maybeSingle();
    if (roomErr) return NextResponse.json({ ok: false, error: roomErr.message }, { status: 500 });
    if (!room) return NextResponse.json({ ok: false, error: 'room not found' }, { status: 404 });

    // Подготовим промпт
    const sys = `Ты генерируешь викторины. Верни ТОЛЬКО валидный JSON без текста и пояснений. Схема: {"questions": [{"prompt": string, "options": string[4], "correct_index": 0..3}]}`;
    const user = `Сгенерируй ${question_count} вопросов по теме: "${topic}".
Сложность: ${difficulty}.
Формат: только JSON по схеме. Вариантов ответа всегда 4. Поле correct_index — номер правильного.`;

    // Вызов OpenAI (JSON результат)
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json({ ok: false, error: `openai_error: ${txt}` }, { status: 500 });
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content || '{}';
    let parsed: any;
    try { parsed = JSON.parse(content); } catch (e) { return NextResponse.json({ ok: false, error: 'invalid JSON from OpenAI' }, { status: 500 }); }
    const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];

    // Обрежем и нормализуем
    const items = questions.slice(0, question_count).map((q: any, i: number) => ({
      room_id,
      order_index: i,
      prompt: String(q?.prompt ?? '').slice(0, 2000),
      options: Array.isArray(q?.options) ? q.options.map((s: any) => String(s)).slice(0, 4) : [],
      correct_index: (typeof q?.correct_index === 'number' ? q.correct_index : 0),
    })).filter((q: any) => q.prompt && q.options.length === 4 && q.correct_index >= 0 && q.correct_index < 4);

    if (items.length === 0) {
      return NextResponse.json({ ok: false, error: 'no questions generated' }, { status: 400 });
    }

    // Сохраним вопросы (удалим старые и вставим новые пачкой)
    await admin.from('quiz_questions').delete().eq('room_id', room_id);
    const { error: insErr } = await admin.from('quiz_questions').insert(items as any[]);
    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });

    // Обновим длительность на уровне комнаты, если нужно
    await admin.from('quiz_rooms').update({ question_duration_seconds }).eq('id', room_id);

    return NextResponse.json({ ok: true, count: items.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'internal error' }, { status: 500 });
  }
}
