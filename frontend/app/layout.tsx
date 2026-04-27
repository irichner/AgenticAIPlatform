import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThreadsProvider } from "@/components/shared/ThreadsProvider";
import { BrandingProvider } from "@/components/shared/BrandingProvider";
import { AuthProvider } from "@/contexts/auth";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lanara — Revenue Agent Platform",
  description: "SPM + CRM agent orchestration for modern revenue teams.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="h-full">
        <BrandingProvider>
          <AuthProvider>
            <ThreadsProvider>{children}</ThreadsProvider>
          </AuthProvider>
        </BrandingProvider>
      </body>
    </html>
  );
}
