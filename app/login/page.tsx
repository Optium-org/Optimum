"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Добро пожаловать!");
      router.push("/dashboard");
    } catch (err: any) {
      toast.error(err?.message || "Не удалось выполнить вход");
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    try {
      setOauthLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined,
        },
      });
      if (error) throw error;
      // Дальше управление перейдёт в OAuth flow
    } catch (err: any) {
      toast.error(err?.message || "Не удалось запустить вход через Google");
    } finally {
      setOauthLoading(false);
    }
  }

  return (
    <AuthShell
      heading="Войдите в аккаунт"
      subHeading={
        <span>
          Нет аккаунта? <Link href="/signup" className="underline">Зарегистрируйтесь →</Link>
        </span>
      }
      rightImageSrc="/auth/main.png"
      quote={{
        text:
          "Я знаю, что ничего не знаю. Но после этой викторины - чуть-чуть больше",
        authorName: "Сократ, с надеждой",
        authorTitle: "Философ",
        authorAvatarSrc: "/avatars/socrat.webp",
      }}
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-1 gap-4">
          <Input
            type="email"
            placeholder="Email"
            className="rounded-none dark:bg-background/40"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Пароль"
            className="rounded-none dark:bg-background/40"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-foreground/70">
          <input type="checkbox" id="remember" className="accent-current" />
          <label htmlFor="remember">Запомнить меня</label>
        </div>

        <Button type="submit" className="w-full rounded-none" disabled={loading}>
          {loading ? "Входим…" : "Войти"}
        </Button>

        <div className="relative text-center text-xs text-foreground/60">
          <span className="px-2 bg-background/0">или</span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <Button type="button" variant="outline" className="rounded-none" onClick={onGoogle} disabled={oauthLoading}>
            {oauthLoading ? "Открываем Google…" : "Войти через Google"}
          </Button>
          <Button type="button" variant="outline" className="rounded-none">Войти по биометрии</Button>
        </div>
      </form>
    </AuthShell>
  );
}
