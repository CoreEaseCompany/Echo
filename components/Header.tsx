
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

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
    } = supabase.auth.onAuthStateChange((event, session) => {
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
        <span className="header-brand-title">Echo</span>
        <span className="header-brand-subtitle">
          あなたの気持ちを、ここに。
        </span>
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
