import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Momentum",
  description:
    "AI Powered TODO Service with AI Agents",
  keywords: [
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
    "Momentum app",
  ],
  authors: [{ name: "The Grishinium Team" }],
  creator: "Grishinium Team",
  publisher: "Grishinium Team",
  category: "Technology",
  classification: "TODO Application",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Momentum - AI Powered TODO App",
    description:
      "AI Powered, boost your productivity 100x",
    type: "website",
    url: "https://momentum.com",
    siteName: "Momentum",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Momentum - AI powered TODO App",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Momentum - AI Powered TODO App",
    description:
      "AI Powered, boost your productivity 100x",
    creator: "Grishinium_foundation",
    site: "@Momentum",
    images: ["/opengraph-image.png"],
  },
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          forcedTheme="dark"
          disableTransitionOnChange
        >
          {children}
          <Analytics />
          <SpeedInsights />
          <Toaster
            position="bottom-center"
            toastOptions={{
              style: {
                borderRadius: 0,
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
