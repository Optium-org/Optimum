import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // Подсказка в консоли, чтобы настроить окружение
  // Не бросаем исключение здесь, чтобы сборка не падала
  // Но дальнейшие вызовы клиента вернут ошибку аутентификации
  console.warn(
    "[Supabase] Переменные окружения не заданы: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}

export const supabase = createClient(url || "", anon || "");
