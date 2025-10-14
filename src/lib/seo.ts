import { Metadata } from "next";

export const siteConfig = {
  name: "Momentum APP",
  shortName: "Momentum",
  description:
    "Built on WebKit, designed for macOS. Ora delivers a clean, native experience that's simple, powerful, and free of bloat.",
  url: "https://momentum.com",
  ogImage: "/opengraph-image.png",
  creator: "Grishinium Foundation",
  keywords: [
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
   "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
    "Momentum APP",
  ],
};

// Simple structured data for single-page site
export function createWebsiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
  };
}

export function createSoftwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    applicationCategory: "AI",
    operatingSystem: "macOS 14.0+",
    description: siteConfig.description,
    url: siteConfig.url,
    downloadUrl: "https://github.com/Tentel456/momentum",
    softwareVersion: "0.1.8",
    license: "https://opensource.org/licenses/MIT",
    isAccessibleForFree: true,
    author: {
      "@type": "Organization",
      name: "Grishinium Foundation",
      url: "https://github.com/grishinium-blockchain",
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    softwareRequirements: "macOS 14.0 or later, Xcode 15 or later",
    codeRepository: "https://github.com/Tentel456/momentum",
    programmingLanguage: ["Swift", "SwiftUI"],
    featureList: [
      "AI Powered TODO App",
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "5",
      ratingCount: "1",
    },
  };
}
