import { PRESENTATION, SOCIALITEMS } from "@/data/presentation";
import { BuyMeACoffeeBadge } from "./buymecoffe-badge";
import { Button } from "./ui/button";

export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-3xl space-y-8 py-8 px-4 sm:space-y-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="flex flex-col gap-6 sm:h-full sm:w-80 sm:justify-center sm:gap-8">
          <img src="/icons/favicon-dark.png" alt="Momentum logo" className="h-5 w-5 sm:h-9 sm:w-9" />
            <p className="text-neutral-600 text-sm">
              {PRESENTATION.footer.description}
            </p>

            <div className="flex items-center gap-4 sm:gap-6">
              {SOCIALITEMS.map((item) => (
                <a
                  className="size-4 rounded-full opacity-80 duration-150 hover:opacity-100 sm:size-4"
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  key={item.label}
                >
                  <item.icon className="fill-primary" />
                  <span className="sr-only">{item.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t">
          <p className="py-4 text-center text-neutral-600 text-sm sm:text-left">
            2025 Momentum. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
