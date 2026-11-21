"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordRequest() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;

    if (!email.trim()) {
      setIsError(true);
      setMessage("メールアドレスを入力してください");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password/update`,
    });

    setLoading(false);

    if (error) {
      setIsError(true);
      setMessage("メールの送信に失敗しました。設定を確認してください。");
      console.error(error);
      return;
    }

    setIsError(false);
    setMessage(
      "パスワードリセットのメールを送信しました。メールを確認してください。"
    );
  };

  return (
    <div className="login-card">
      <h1 className="login-card__title">パスワードリセット</h1>

      <p className="login-card__text">登録したメールアドレスを入力してください。</p>

      <form onSubmit={handleReset} noValidate>
        <div className="login-card__field">
          <label htmlFor="reset-email">メールアドレス</label>
          <input
            id="reset-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {message && (
          <p
            className={`login-card__message${
              isError ? "" : " login-card__message--info"
            }`}
          >
            {message}
          </p>
        )}

        <div className="login-card__footer">
          <button
            type="submit"
            className="login-card__submit"
            disabled={loading}
          >
            {loading ? "送信中..." : "リセットメールを送信"}
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
