import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // id имеет формат: category|difficulty|amount
    const raw = params.id || "";
    const [category, difficulty, amountStr] = raw.split("|");
    const amount = Math.max(1, Math.min(50, parseInt(amountStr || "10", 10) || 10));

    // 0) Попробуем отдать из кэша (если доступен service-role)
    let cached: any = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
        const { data } = await admin
          .from("cached_quizzes")
          .select("data, created_at, ttl_seconds")
          .eq("key", raw)
          .eq("provider", "the-trivia-api:v2")
          .maybeSingle();
        if (data) {
          const { data: payload, created_at, ttl_seconds } = data as any;
          const created = created_at ? new Date(created_at).getTime() : 0;
          const ttl = (ttl_seconds ?? 86400) * 1000; // по умолчанию 24ч
          if (created && Date.now() - created < ttl) {
            cached = payload;
          }
        }
      } catch (e) {
        // кэш опционален
        console.warn("cached_quizzes read failed", (e as any)?.message || e);
      }
    }

    if (cached && Array.isArray(cached?.questions)) {
      return NextResponse.json({ id: raw, title: `${category} (${difficulty})`, questions: cached.questions });
    }

    // 1) грузим из The Trivia API v2
    const qs = new URLSearchParams();
    qs.set("limit", String(amount));
    if (category) qs.set("categories", category);
    if (difficulty) qs.set("difficulties", difficulty);

    const url = `https://the-trivia-api.com/v2/questions?${qs.toString()}`;
    const resp = await fetch(url, { next: { revalidate: 0 } });
    if (!resp.ok) {
      return NextResponse.json({ ok: false, error: "failed to fetch questions" }, { status: 502 });
    }
    const data = await resp.json();

    // 2) Нормализация к нашей схеме
    const questions = (Array.isArray(data) ? data : []).map((q: any) => {
      const prompt: string = q?.question?.text ?? "";
      const correct: string = q?.correctAnswer ?? "";
      const incorrect: string[] = Array.isArray(q?.incorrectAnswers) ? q.incorrectAnswers : [];
      const mixed = shuffle([correct, ...incorrect]);
      const correct_index = mixed.findIndex((x) => x === correct);
      return { prompt, options: mixed, correct_index };
    });

    // 3) Запишем в кэш (best-effort)
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
        await admin
          .from("cached_quizzes")
          .upsert({
            key: raw,
            provider: "the-trivia-api:v2",
            data: { questions },
            ttl_seconds: 86400,
          } as any, { onConflict: "key,provider" } as any);
      } catch (e) {
        console.warn("cached_quizzes write failed", (e as any)?.message || e);
      }
    }

    return NextResponse.json({ id: raw, title: `${category} (${difficulty})`, questions });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "internal" }, { status: 500 });
  }
}
