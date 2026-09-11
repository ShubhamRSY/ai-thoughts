import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";
import PWAInstall from "@/components/PWAInstall";
import ViewportSync from "@/components/ViewportSync";
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
const title = "AI·Thoughts — Honest takes on AI";
const description =
  "Honest takes on how AI is changing us — voice, video, or words. All ages, all languages, one place for real human voices.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "AI·Thoughts",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AI·Thoughts",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "AI·Thoughts",
    title,
    description,
    images: [
      {
        url: "/icons/icon-512.png",
        width: 512,
        height: 512,
        alt: "AI·Thoughts",
      },
    ],
  },
  twitter: {
    card: "summary",
    title,
    description,
    images: ["/icons/icon-512.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2f0eb",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <AuthProvider>
          <ViewportSync />
          {children}
        </AuthProvider>
        <PwaRegister />
        <PWAInstall />
      </body>
    </html>
  );
}
