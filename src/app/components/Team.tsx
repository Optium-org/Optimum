"use client";

import Image from "next/image";

type Member = {
  name: string;
  role: string;
  photo: string; // public path under /public/assets/team
};

const members: Member[] = [
  { name: "Александр Гришин", role: "CEO & Founder, Fullstack dev, Designer", photo: "/team/aleksandr_grishinium.jpeg" },
  { name: "Анзор Гоов", role: "Product Designer", photo: "/assets/team/petrova.jpg" },
  { name: "Павел Гришин", role: "Lead Engineer", photo: "/assets/team/smirnov.jpg" },
];

export default function Team() {
  return (
    <section id="team" className="px-4 lg:px-8 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-semibold">Команда</h2>
          <p className="text-sm text-foreground/60">Люди, которые делают Momentum</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.map((m) => (
            <article key={m.name} className="rounded-none border bg-background/10 overflow-hidden">
              <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
                <Image src={m.photo} alt={m.name} fill className="object-cover" />
              </div>
              <div className="px-4 py-3">
                <div className="text-sm font-medium">{m.name}</div>
                <div className="text-xs text-foreground/60">{m.role}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
