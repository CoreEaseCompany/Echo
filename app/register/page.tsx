"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  // ユーザー登録処理
  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setSubmitting(false);
      return;
    }

    // 登録成功後はログインページへ遷移
    router.push("/login");
  };

  return (
    <div className="login-card">
      <h1 className="login-card__title">ユーザー登録</h1>

      <form onSubmit={handleRegister}>
        <div className="login-card__field">
          <label htmlFor="register-email">メールアドレス</label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="login-card__field">
          <label htmlFor="register-password">パスワード</label>
          <input
            id="register-password"
            type="password"
            autoComplete="new-password"
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
            {submitting ? "登録中..." : "登録"}
          </button>
        </div>
      </form>

      <div className="login-card__links">
        <Link href="/login" className="login-card__link">
          ログイン画面に戻る
        </Link>
      </div>
    </div>
  );
}
