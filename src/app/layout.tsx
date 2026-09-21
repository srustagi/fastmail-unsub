import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
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
  metadataBase: new URL("https://unsub.fyi"),
  title: "Unsubscribe — Fastmail cleanup",
  description: "A private, Inbox-only Fastmail unsubscribe dashboard.",
  applicationName: "Unsubscribe",
  openGraph: {
    type: "website",
    siteName: "Unsubscribe",
    title: "Unsubscribe — Fastmail cleanup",
    description: "A private, Inbox-only Fastmail unsubscribe dashboard.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Unsubscribe — Fastmail cleanup",
    description: "A private, Inbox-only Fastmail unsubscribe dashboard.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f7f1" },
    { media: "(prefers-color-scheme: dark)", color: "#11131a" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
