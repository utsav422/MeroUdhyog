import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/lib/providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.meroudhyog.com";
const title = "Mero Udhyog — Factory management workspace";
const description =
  "Run your factory with clarity — products, orders, deliveries, khata and payments in one tidy workspace, with smart forecasts for what happens next.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s | Mero Udhyog",
  },
  description,
  applicationName: "Mero Udhyog",
  keywords: [
    "factory management software",
    "Nepali factory software",
    "order management",
    "delivery tracking",
    "khata",
    "inventory management",
    "business forecasting",
    "Mero Udhyog",
    "Factoryze Tech",
  ],
  authors: [{ name: "Factoryze Tech", url: "https://meroudhyog.com" }],
  creator: "Factoryze Tech",
  publisher: "Factoryze Tech",
  category: "business software",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Mero Udhyog",
    title,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Mero Udhyog — run your business on what happens next",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  appleWebApp: {
    capable: true,
    title: "Mero Udhyog",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#27675c",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
