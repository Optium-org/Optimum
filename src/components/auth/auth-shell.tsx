import Image from "next/image";

interface QuoteProps {
  text: string;
  authorName: string;
  authorTitle: string;
  authorAvatarSrc?: string; // опционально, пользователь добавит сам
}

interface AuthShellProps {
  heading: string;
  subHeading?: React.ReactNode;
  children: React.ReactNode; // сюда придёт форма
  rightImageSrc?: string; // большая картинка справа (пользователь добавит в public)
  quote?: QuoteProps;
}

export function AuthShell({
  heading,
  subHeading,
  children,
  rightImageSrc = "/auth-side.png", // плейсхолдер, можно заменить
  quote,
}: AuthShellProps) {
  return (
    <main className="min-h-screen w-full">
      <div className="w-full h-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 min-h-screen">
          {/* Левая колонка: форма (во всю высоту) */}
          <section className="flex min-h-screen lg:min-h-full items-center p-6 sm:p-10 bg-background/10">
            <div className="w-full max-w-xl mx-auto">
              <div className="mb-6">
                <Image src="/favicon.png" alt="Momentum" width={144} height={144} />
              </div>
              <div className="mb-6 sm:mb-8">
                <h1 className="text-xl sm:text-2xl font-semibold">{heading}</h1>
                {subHeading && (
                  <div className="mt-2 text-sm text-foreground/70">{subHeading}</div>
                )}
              </div>
              <div className="space-y-4">{children}</div>
            </div>
          </section>

          {/* Правая колонка: изображение + цитата */}
          <aside className="flex flex-col rounded-none border-l bg-background/10 overflow-hidden">
            <div className="relative flex-1 min-h-64 w-full">
              {/* Картинка справа (пользователь подменит файл) */}
              <Image
                src="/auth/main.png"
                alt="Preview"
                fill
                className="object-cover"
                priority
              />
            </div>
            {quote && (
              <div className="p-5 sm:p-6 border-t bg-background/60 backdrop-blur">
                <p className="text-sm text-foreground/80 italic">“{quote.text}”</p>
                <div className="mt-4 flex items-center gap-3">
                  {quote.authorAvatarSrc ? (
                    <Image
                      src={quote.authorAvatarSrc}
                      alt={quote.authorName}
                      width={36}
                      height={36}
                      className="rounded-full border"
                    />
                  ) : (
                    <div className="size-9 rounded-full border bg-background/40" aria-hidden />
                  )}
                  <div className="text-sm">
                    <div className="font-medium">{quote.authorName}</div>
                    <div className="text-foreground/60">{quote.authorTitle}</div>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
