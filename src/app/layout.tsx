import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Fraunces, Manrope } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";
import PWAInstall from "@/components/PWAInstall";
import ViewportSync from "@/components/ViewportSync";
import CookieConsent from "@/components/CookieConsent";
import { AuthProvider } from "@/hooks/useAuth";
import { getSiteUrl } from "@/lib/site";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const siteUrl = getSiteUrl();
const title = "AI·Thoughts — Say how AI makes you feel";
const description =
  "Express how AI makes you feel — love it, fear it, or both. Voice your perspective in voice, video, or words, and connect with people who feel it too.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "AiTo",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AiTo",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "AiTo",
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2f0eb",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Every page renders per request: the CSP nonce (src/proxy.ts) is fresh
  // for each response, and Next stamps it on its scripts only while
  // rendering (SECURITY_AUDIT.md L3).
  await connection();
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <AuthProvider>
          <ViewportSync />
          {children}
          <PWAInstall />
          <CookieConsent />
        </AuthProvider>
        <PwaRegister />
        <Analytics />
      </body>
    </html>
  );
}
