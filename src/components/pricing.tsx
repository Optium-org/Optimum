import Link from "next/link";
import { Button } from "./ui/button";

export function Pricing() {
  return (
    <section id="pricing" className="w-full py-16 sm:py-24 border-t">
      <div className="mx-auto w-full max-w-4xl px-4">
        <div className="text-center mb-10 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl font-semibold">Тарифы</h2>
          <p className="text-sm text-foreground/70 mt-2">
            Выберите план и начинайте ускорять задачи уже сегодня
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {/* Free */}
          <div className="flex flex-col rounded-none border bg-background/10 p-5 sm:p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Free</h3>
              <p className="text-sm text-foreground/60 mt-1">Для личных задач</p>
            </div>
            <div className="mb-4">
              <span className="text-2xl font-semibold">$0</span>
              <span className="text-sm text-foreground/60"> / месяц</span>
            </div>
            <ul className="text-sm text-foreground/80 space-y-2 mb-6 list-disc list-inside">
              <li>Неограниченные задачи</li>
              <li>Категории и приоритеты</li>
              <li>Дедлайны и локальные напоминания</li>
              <li>Экспорт/импорт</li>
            </ul>
            <Link href="#signup" className="mt-auto">
              <Button className="w-full rounded-none">Выбрать</Button>
            </Link>
          </div>

          {/* Pro (highlighted) */}
          <div className="relative flex flex-col rounded-none border bg-background/10 p-5 sm:p-6 border-primary/60 shadow-[0_0_0_1px_theme(colors.primary/0.4)]">
            {/* Бейдж */}
            <div className="absolute -top-3 right-3 select-none">
              <span className="px-2 py-1 text-[10px] tracking-wide uppercase rounded-none border bg-background/70">
                Популярный
              </span>
            </div>

            <div className="mb-4">
              <h3 className="text-lg font-semibold">Pro</h3>
              <p className="text-sm text-foreground/60 mt-1">Для продвинутых пользователей</p>
            </div>
            <div className="mb-4">
              <span className="text-2xl font-semibold">$7</span>
              <span className="text-sm text-foreground/60"> / месяц</span>
            </div>
            <ul className="text-sm text-foreground/80 space-y-2 mb-6 list-disc list-inside">
              <li>Совместные списки и комментарии</li>
              <li>Drag & Drop порядок</li>
              <li>Аналитика и стрики</li>
              <li>Голосовой ввод</li>
            </ul>
            <Link href="#signup" className="mt-auto">
              <Button className="w-full rounded-none border-primary bg-primary/90 hover:bg-primary text-primary-foreground">
                Купить подписку
              </Button>
            </Link>
          </div>

          {/* Team */}
          <div className="flex flex-col rounded-none border bg-background/10 p-5 sm:p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Team</h3>
              <p className="text-sm text-foreground/60 mt-1">Для команд и проектов</p>
            </div>
            <div className="mb-4">
              <span className="text-2xl font-semibold">$14</span>
              <span className="text-sm text-foreground/60"> / месяц за пользователя</span>
            </div>
            <ul className="text-sm text-foreground/80 space-y-2 mb-6 list-disc list-inside">
              <li>Роли и права доступа</li>
              <li>Интеграции (Slack/Telegram/Calendar)</li>
              <li>Челленджи и лидерборды</li>
              <li>Реалтайм и история изменений</li>
            </ul>
            <Link href="#signup" className="mt-auto">
              <Button className="w-full rounded-none">Купить подписку</Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
