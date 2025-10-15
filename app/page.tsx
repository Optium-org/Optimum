import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { Pricing } from "@/components/pricing";
import Team from "./components/Team";
import {
  createWebsiteSchema,
  createSoftwareApplicationSchema,
} from "@/lib/seo";
import Script from "next/script";
import { WaitlistForm } from "@/components/waitlist-form";

export default function Home() {
  const websiteSchema = createWebsiteSchema();
  const softwareSchema = createSoftwareApplicationSchema();

  return (
    <main className="min-h-screen w-full overflow-x-hidden">
      <Script
        id="website-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        strategy="beforeInteractive"
      />
      <Script
        id="software-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
        strategy="beforeInteractive"
      />
       <Header /> 
       <Hero />
       <Features />
       <Pricing />
       <Footer />
    </main>
  );
}
