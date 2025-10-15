"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export default function SignupPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { first_name: firstName, last_name: lastName },
          emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/account` : undefined,
        },
      });
      if (error) throw error;

      if (data?.user && !data?.session) {
        toast.success("Проверьте почту для подтверждения аккаунта");
      } else {
        toast.success("Аккаунт создан!");
        router.push("/dashboard");
      }
    } catch (err: any) {
      toast.error(err?.message || "Не удалось создать аккаунт");
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
    } catch (err: any) {
      toast.error(err?.message || "Не удалось запустить регистрацию через Google");
    } finally {
      setOauthLoading(false);
    }
  }

  return (
    <AuthShell
      heading="Создадим аккаунт"
      subHeading={
        <span>
          Уже есть аккаунт? <Link href="/login" className="underline">Войти →</Link>
        </span>
      }
      rightImageSrc="/auth-signup.png"
      quote={{
        text:
          "Я знаю, что ничего не знаю. Но после этой викторины - чуть-чуть больше",
        authorName: "Сократ",
        authorTitle: "Философ",
        authorAvatarSrc: "/avatars/socrat.webp",
      }}
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            type="text"
            placeholder="Имя"
            className="rounded-none dark:bg-background/40"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <Input
            type="text"
            placeholder="Фамилия"
            className="rounded-none dark:bg-background/40"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>
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

        <div className="flex items-start gap-2 text-xs text-foreground/70">
          <input type="checkbox" id="terms" className="mt-1 accent-current" required />
          <label htmlFor="terms">
            Регистрируясь, вы соглашаетесь с нашими {" "}
            <a href="#" className="underline">условиями использования</a> и {" "}
            <a href="#" className="underline">политикой конфиденциальности</a>.
          </label>
        </div>

        <Button type="submit" className="w-full rounded-none" disabled={loading}>
          {loading ? "Создаём…" : "Продолжить"}
        </Button>

        <div className="relative text-center text-xs text-foreground/60">
          <span className="px-2 bg-background/0">или</span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <Button type="button" variant="outline" className="rounded-none" onClick={onGoogle} disabled={oauthLoading}>
            {oauthLoading ? "Открываем Google…" : "Зарегистрироваться через Google"}
          </Button>
          <Button type="button" variant="outline" className="rounded-none">Зарегистрироваться по биометрии</Button>
        </div>
      </form>
    </AuthShell>
  );
}
