import { NextRequest, NextResponse } from "next/server";

// Тип списка (синхронизирован с фронтом)
// id формата: `${category}|${difficulty}|${amount}`

export async function GET(_req: NextRequest) {
  try {
    // Получим категории с the-trivia-api (V1 совместимый эндпоинт стабилен)
    const resp = await fetch("https://the-trivia-api.com/api/categories", { next: { revalidate: 3600 } });
    if (!resp.ok) {
      return NextResponse.json({ ok: false, error: "failed to fetch categories" }, { status: 502 });
    }
    const cats = await resp.json();
    // cats: { [category: string]: string[] }
    const categoryKeys = Object.keys(cats || {});

    // Сформируем виртуальные подборки: по 3 сложности на каждую из первых ~10 категорий
    const difficulties = ["easy", "medium", "hard"] as const;
    const items: any[] = [];
    const amount = 10; // дефолтное количество вопросов в подборке

    for (const cat of categoryKeys.slice(0, 10)) {
      for (const diff of difficulties) {
        items.push({
          id: `${cat}|${diff}|${amount}`,
          title: `${cat} (${diff})`,
          category: cat,
          difficulty: diff,
          question_count: amount,
          description: `Подборка вопросов по категории ${cat} со сложностью ${diff}.`,
          cover_url: null,
        });
      }
    }

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "internal" }, { status: 500 });
  }
}
