
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "../components/Header";
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
  title: "Echo",
  description: "気持ちを共有する匿名SNS",
};

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
      <body className="min-h-full flex flex-col">

        {/* 雲の質感を作るSVGフィルター */}
        <svg
          aria-hidden="true"
          width="0"
          height="0"
          style={{ position: "absolute" }}
        >
          <defs>
            <filter
              id="cloud-noise"
              x="-25%"
              y="-25%"
              width="150%"
              height="150%"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.035"
                numOctaves="3"
                seed="8"
                result="noise"
              />

              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="20"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>

        <Header />

        <main className="app-main flex-1 w-full min-h-0 overflow-hidden">
          {children}
        </main>

        <footer className="site-footer border-t border-gray-200 py-2 text-center text-xs">
          <span className="site-footer-label">© 2026 Echo</span>
        </footer>
      </body>
    </html>
  );
}
