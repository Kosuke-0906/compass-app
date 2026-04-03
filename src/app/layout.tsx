import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Compass",
  description: "Personal Todo, Diary, and Goal Management Application",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Compass",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};
import { LanguageProvider } from "@/context/LanguageContext";
import { BottomNav } from "@/components/BottomNav";
import { AuthProvider } from "@/context/AuthContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden">
        <AuthProvider>
          <LanguageProvider>
            <main className="flex-1 overflow-y-auto pb-20">
              {children}
            </main>
            <BottomNav />
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
