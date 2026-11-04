"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUpdatePassword = async () => {
    if (!password || !confirmPassword) {
      setMessage("パスワードを入力してください");
      return;
    }

    if (password.length < 6) {
      setMessage("パスワードは6文字以上にしてください");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("パスワードが一致しません");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (error) {
      setMessage(
        "パスワードの変更に失敗しました。再設定メールから開き直してください。"
      );
      console.error(error);
      return;
    }

    setMessage("パスワードを変更しました。ログインできます。");
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <main>
      <h1>新しいパスワードの設定</h1>

      <p>新しいパスワードを入力してください。</p>

      <div>
        <label htmlFor="password">新しいパスワード</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      <div>
        <label htmlFor="confirmPassword">
          新しいパスワード（確認）
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      <button
        onClick={handleUpdatePassword}
        disabled={loading}
      >
        {loading ? "変更中..." : "パスワードを変更"}
      </button>

      {message && <p>{message}</p>}

      <p>
        <Link href="/login">ログイン画面へ戻る</Link>
      </p>
    </main>
  );
}