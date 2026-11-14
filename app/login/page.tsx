"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  // ログイン処理
  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert("メールアドレスまたはパスワードが正しくありません");
      return;
    }

    // ログイン成功後はホーム画面へ遷移
    router.push("/");
  };

  return (
    <div>
      <h1>ログイン</h1>

      <input
        type="email"
        placeholder="メールアドレス"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <br />

      <input
        type="password"
        placeholder="パスワード"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <br />

      <button onClick={handleLogin}>ログイン</button>

      <p>
        <Link href="/reset-password">パスワードを忘れた方はこちら</Link>
      </p>
    </div>
  );
}
