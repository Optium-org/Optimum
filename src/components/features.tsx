import {
  CheckCircle2,
  AlarmClock,
  Users,
  BarChart3,
} from "lucide-react";

const features = [
  {
    title: "Задачи и подзадачи",
    description:
      "Создавайте задачи, разбивайте их на подзадачи, отмечайте прогресс и держите фокус на главном.",
    icon: CheckCircle2,
  },
  {
    title: "Дедлайны и напоминания",
    description:
      "Ставьте сроки, получайте ненавязчивые напоминания и не упускайте важные дела.",
    icon: AlarmClock,
  },
  {
    title: "Совместная работа и комментарии",
    description:
      "Работайте с командой: делитесь списками, обсуждайте детали в комментариях и принимайте решения быстрее.",
    icon: Users,
  },
  {
    title: "Аналитика и стрики",
    description:
      "Видьте динамику: стрики, метрики по задачам и личная статистика продуктивности.",
    icon: BarChart3,
  },
];

export function Features() {
  return (
    <section className="relative w-full py-24 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />

      <div className="relative z-10 container mx-auto px-4">
        <div className="text-center mb-12 sm:mb-14">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-medium mb-3">
            Функции, которые ускоряют работу
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base max-w-2xl mx-auto">
            Всё необходимое для личной эффективности и командной синхронизации — без лишнего шума.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group relative rounded-none border bg-background/10 p-5 sm:p-6 hover:bg-background/20 transition-colors duration-200"
            >
              <div className="mb-4">
                <feature.icon className="w-7 h-7 text-primary/80" />
              </div>
              <h3 className="text-base sm:text-lg font-medium mb-2 text-foreground">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Нижний CTA про GitHub убран для более чистого лендинга */}
      </div>
    </section>
  );
}
