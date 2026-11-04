"use client";

import Link from "next/link";
import { useRouter } from 'next/navigation';
import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const router = useRouter(); //ページ遷移のためのフック

    //ログイン処理  
    const handleLogin = async () => {
        //supabaseのauth.signInWithPasswordを使用してログイン
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        //エラーの場合エラー表示し終了
        if (error) {
            alert("メールアドレスまたはパスワードが正しくありません");
            return;
        }

        // ログイン成功後にホーム画面に遷移
        router.push("/");
    };

    return (
        <main>
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

            <button onClick={handleLogin}>
                ログイン
            </button>

            <p>
                <Link href="/reset-password">
                    パスワードを忘れた方はこちら
                </Link>
            </p>
        </main>
    );
}