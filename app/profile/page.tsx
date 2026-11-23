"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getUserColor } from "@/lib/userColor";
import ProfilePostList from "@/components/ProfilePostList";

export default function ProfilePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) {
        setLoading(false);
        return;
      }

      setUserId(authData.user.id);
      setEmail(authData.user.email ?? "");

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (error) {
        setMessage("プロフィールの取得に失敗しました");
        console.error(error);
      } else if (data) {
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

    const { error } = await supabase
      .from("profiles")
      .upsert(profileData, { onConflict: "user_id" });

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

    setMessage("プロフィールを保存しました");
  };

  if (loading) {
    return (
      <section className="profile-card profile-card--state">
        <p>読み込み中...</p>
      </section>
    );
  }

  if (!userId) {
    return (
      <section className="profile-card profile-card--state">
        <p>ログインしてください</p>
        <Link href="/login" className="profile-card__link">
          ログインページへ
        </Link>
      </section>
    );
  }

  return (
    <>
    <section className="profile-card">
      <h1 className="profile-card__title">プロフィール</h1>

      <div
        className="profile-card__icon"
        style={{ backgroundColor: getUserColor(userId) }}
        aria-hidden="true"
      />

      <div className="profile-card__field">
        <label htmlFor="username">ユーザーネーム</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={30}
          placeholder="ユーザーネーム"
        />
      </div>

      <div className="profile-card__field">
        <label htmlFor="email">メールアドレス</label>
        <input
          id="email"
          type="email"
          value={email}
          readOnly
          className="profile-card__input--readonly"
        />
      </div>

      <div className="profile-card__field">
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

      <div className="profile-card__footer">
        <button
          type="button"
          className="profile-card__save"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "保存中..." : "保存する"}
        </button>
      </div>

      {message && <p className="profile-card__message">{message}</p>}
    </section>

    <ProfilePostList key={userId} userId={userId} username={username} viewerId={userId} />
    </>
  );
}
