"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordRequest(){
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const handleReset=async () => {
        if(!email.trim()){
            setMessage("メールアドレスを入力してください");
            return;
        }

        setLoading(true);
        setMessage("");

        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(),
         {
            redirectTo: `${window.location.origin}/reset-password/update`,
         }
        );

        setLoading(false);

        if(error){
            setMessage("メールの送信に失敗しました。設定を確認してください。");
            console.error(error);
            return;
        }

        setMessage("パスワードリセットのメールを送信しました。メールを確認してください。");
    };

    return (
        <main>
            <h1>パスワードリセット</h1>

            <p>登録したメールアドレスを入力してください。</p>

            <input
                type="email"
                placeholder="メールアドレス"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
            />

            <button onClick={handleReset} disabled={loading}>
                {loading ? "送信中..." : "パスワードリセット"}
            </button>

            {message && <p>{message}</p>}

            <p>
                <Link href="/login">ログイン画面に戻る</Link>
            </p>
        </main>
    );
}