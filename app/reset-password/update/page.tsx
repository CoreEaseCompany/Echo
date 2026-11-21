"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  const showError = (text: string) => {
    setIsError(true);
    setMessage(text);
  };

  const handleUpdatePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;

    if (!password || !confirmPassword) {
      showError("パスワードを入力してください");
      return;
    }

    if (password.length < 6) {
      showError("パスワードは6文字以上にしてください");
      return;
    }

    if (password !== confirmPassword) {
      showError("パスワードが一致しません");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (error) {
      showError(
        "パスワードの変更に失敗しました。再設定メールから開き直してください。"
      );
      console.error(error);
      return;
    }

    setIsError(false);
    setMessage("パスワードを変更しました。ログインできます。");
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="login-card">
      <h1 className="login-card__title">新しいパスワードの設定</h1>

      <p className="login-card__text">新しいパスワードを入力してください。</p>

      <form onSubmit={handleUpdatePassword}>
        <div className="login-card__field">
          <label htmlFor="password">新しいパスワード</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        <div className="login-card__field">
          <label htmlFor="confirmPassword">新しいパスワード（確認）</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
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
            {loading ? "変更中..." : "パスワードを変更"}
          </button>
        </div>
      </form>

      <div className="login-card__links">
        <Link href="/login" className="login-card__link">
          ログイン画面へ戻る
        </Link>
      </div>
    </div>
  );
}
