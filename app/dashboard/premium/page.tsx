"use client";

export default function PremiumPage() {
  return (
    <main className="min-h-screen w-full">
      <div className="grid grid-cols-1 min-h-screen">
        <div className="sticky top-0 z-10 border-b px-4 lg:px-8 py-4 flex items-center justify-between bg-background/80 backdrop-blur">
          <div className="text-sm text-foreground/80">Премиум</div>
        </div>
        <section className="relative bg-background/80 px-4 lg:px-8 py-8">
          <div className="mx-auto w-full max-w-4xl space-y-4">
            <div className="rounded-lg border bg-background p-5 shadow-sm">
              <div className="text-sm font-medium mb-2">Подписка</div>
              <div className="text-xs text-foreground/60">Экстра возможности: больше игроков, расширенная генерация вопросов, приватные комнаты и т.д.</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
