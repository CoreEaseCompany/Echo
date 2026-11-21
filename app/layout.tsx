import type { Metadata } from "next";
import Header from "@/components/Header";
import "./globals.css";

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
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Header />

        <main className="app-main flex-1 w-full min-h-0">
          {children}
        </main>

        <footer className="site-footer border-t border-gray-200 py-2 text-center text-xs">
          <span className="site-footer-label">© 2026 Echo</span>
        </footer>
      </body>
    </html>
  );
}
