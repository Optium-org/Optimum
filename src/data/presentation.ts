import { Icons } from "@/components/icons";

interface SocialItem {
  id: number;
  label: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

export const PRESENTATION = {
  hero: {
    title: "Квизы вместе",
    description:
      "Добивайтесь целей вместе с ИИ-агентами в Momentum. Сделано в Макаровке - Элитой 45 школы",
  },
  urls: {
    github: "https://github.com/Tentel456/momentum",
    x: "https://t.me/fearted",
    discord: "https://t.me/fearted",
    buymecoffee: "https://t.me/fearted",
    website: "https://momentum.com",
  },
  footer: {
    description:
      "Momentum - TODO App with AI Agents, boost your productivity 100x! Сделано в Макаровке - Элитой 45 школы",
  },
} as const;

export const SOCIALITEMS: SocialItem[] = [
  {
    id: 1,
    label: "GitHub",
    href: PRESENTATION.urls.github,
    icon: Icons.github,
  },
  {
    id: 2,
    label: "X (Twitter)",
    href: PRESENTATION.urls.x,
    icon: Icons.x,
  },
  {
    id: 3,
    label: "Discord",
    href: PRESENTATION.urls.discord,
    icon: Icons.discord,
  },
];
