"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  // ログイン処理
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage("メールアドレスまたはパスワードが正しくありません");
      setSubmitting(false);
      return;
    }

    // ログイン成功後はホーム画面へ遷移
    router.push("/");
  };

  return (
    <div className="login-card">
      <h1 className="login-card__title">ログイン</h1>

      <form onSubmit={handleLogin}>
        <div className="login-card__field">
          <label htmlFor="login-email">メールアドレス</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="login-card__field">
          <label htmlFor="login-password">パスワード</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {message && <p className="login-card__message">{message}</p>}

        <div className="login-card__footer">
          <button
            type="submit"
            className="login-card__submit"
            disabled={submitting}
          >
            {submitting ? "ログイン中..." : "ログイン"}
          </button>
        </div>
      </form>

      <div className="login-card__links">
        <Link href="/reset-password" className="login-card__link">
          パスワードを忘れた方はこちら
        </Link>
        <Link href="/register" className="login-card__link">
          新規登録はこちら
        </Link>
      </div>
    </div>
  );
}
