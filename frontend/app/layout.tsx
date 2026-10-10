import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MotionProvider } from "@/components/common/MotionProvider";
import { Navbar } from "@/components/navigation/Navbar";
import { Footer } from "@/components/navigation/Footer";
import { IntroCurtain } from "@/components/brand/IntroCurtain";
import { RouteTheme } from "@/components/common/RouteTheme";
import { SITE_DESCRIPTION, SITE_NAME } from "@/utils/site";
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
  title: { default: `${SITE_NAME}: shop the room`, template: `%s | ${SITE_NAME}` },
  applicationName: SITE_NAME,
  description: SITE_DESCRIPTION,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <MotionProvider>
          <RouteTheme>
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
          </RouteTheme>
          <IntroCurtain />
        </MotionProvider>
      </body>
    </html>
  );
}
