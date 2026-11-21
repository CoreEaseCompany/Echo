"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Header() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // ログイン状態の取得・監視
  useEffect(() => {
    const getSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setEmail(session?.user.email ?? null);
      setLoading(false);
    };

    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // ログアウト処理
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      alert("ログアウトに失敗しました");
      return;
    }

    router.push("/login");
    router.refresh();
  };

  return (
    <header className="site-header">

      {/* Echoタイトル */}
      <Link href="/" className="header-brand">
        <Image
          src="/images/Logo.png"
          alt="Echo"
          width={80}
          height={80}
          loading="eager"
          className="header-logo"
        />
      </Link>

      {/* ナビゲーション */}
      {!loading && (
        <nav className="header-nav">
          <Link href="/" className="header-nav-link">
            ホーム
          </Link>

          {email ? (
            <>
              <Link href="/post" className="header-nav-link">
                投稿する
              </Link>

              <Link href="/profile" className="header-nav-link">
                プロフィール
              </Link>

              <button
                onClick={handleLogout}
                className="header-nav-link"
              >
                ログアウト
              </button>

              <span className="header-email">
                {email}
              </span>
            </>
          ) : (
            <>
              <Link href="/login" className="header-nav-link">
                ログイン
              </Link>

              <Link href="/register" className="header-nav-link">
                新規登録
              </Link>
            </>
          )}
        </nav>
      )}
    </header>
  );
}
