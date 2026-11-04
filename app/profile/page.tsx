
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Profile = {
  user_id: string;
  username: string | null;
  bio: string | null;
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) {
        setMessage("ログインしてください");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (error) {
        setMessage("プロフィールの取得に失敗しました");
        console.error(error);
      } else if (data) {
        setProfile(data);
        setUsername(data.username ?? "");
        setBio(data.bio ?? "");
      }

      setLoading(false);
    };

    fetchProfile();
  }, []);

  const handleSave = async () => {
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      setMessage("ログインしてください");
      return;
    }

    if (!username.trim()) {
      setMessage("ユーザー名を入力してください");
      return;
    }

    setSaving(true);
    setMessage("");

    const profileData = {
      user_id: authData.user.id,
      username: username.trim(),
      bio: bio.trim(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("profiles")
      .upsert(profileData, { onConflict: "user_id" })
      .select()
      .single();

    setSaving(false);

    if (error) {
      console.error(error);

      if (error.code === "23505") {
        setMessage("このユーザー名は既に使用されています");
      } else {
        setMessage("保存に失敗しました");
      }
      return;
    }

    setProfile(data);
    setMessage("プロフィールを保存しました");
  };

  if (loading) {
    return <main>読み込み中...</main>;
  }

  return (
    <main>
      <h1>プロフィール</h1>

      {profile && (
        <div>
          <h2>現在のプロフィール</h2>
          <p>{profile.username}</p>
          <p>{profile.bio || "自己紹介はありません"}</p>
        </div>
      )}

      <hr />

      <h2>プロフィール編集</h2>

      <div>
        <label htmlFor="username">ユーザー名</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={30}
          placeholder="ユーザー名"
        />
      </div>

      <div>
        <label htmlFor="bio">自己紹介</label>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={200}
          rows={5}
          placeholder="自己紹介を入力してください"
        />
      </div>

      <button onClick={handleSave} disabled={saving}>
        {saving ? "保存中..." : "保存する"}
      </button>

      {message && <p>{message}</p>}

      <p>
        <Link href="/">投稿一覧へ戻る</Link>
      </p>
    </main>
  );
}
