"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserColor } from "@/lib/userColor";
import ProfilePostList from "@/components/ProfilePostList";
import type { Profile } from "@/lib/types";

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) {
        setLoggedIn(false);
        setLoading(false);
        return;
      }

      setViewerId(authData.user.id);

      // 自分自身のプロフィールは編集可能な /profile に集約する
      if (authData.user.id === userId) {
        router.replace("/profile");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error(error);
        setMessage("プロフィールの取得に失敗しました");
      } else if (!data) {
        setMessage("プロフィールが見つかりません");
      } else {
        setProfile(data);
      }

      setLoading(false);
    };

    fetchData();
  }, [userId, router]);

  if (loading) {
    return (
      <section className="profile-card profile-card--state">
        <p>読み込み中...</p>
      </section>
    );
  }

  if (!loggedIn) {
    return (
      <section className="profile-card profile-card--state">
        <p>ログインしてください</p>
        <Link href="/login" className="profile-card__link">
          ログインページへ
        </Link>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="profile-card profile-card--state">
        <p>{message || "プロフィールが見つかりません"}</p>
        <Link href="/" className="profile-card__link">
          ホームへ戻る
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
        style={{ backgroundColor: getUserColor(profile.user_id) }}
        aria-hidden="true"
      />

      <div className="profile-card__field">
        <label htmlFor="username">ユーザーネーム</label>
        <input
          id="username"
          type="text"
          value={profile.username || "名前未設定"}
          readOnly
          className="profile-card__input--readonly"
        />
      </div>

      <div className="profile-card__field">
        <label htmlFor="bio">自己紹介</label>
        <textarea
          id="bio"
          value={profile.bio ?? ""}
          readOnly
          rows={5}
          className="profile-card__input--readonly"
        />
      </div>
    </section>

    <ProfilePostList
      key={profile.user_id}
      userId={profile.user_id}
      username={profile.username ?? ""}
      viewerId={viewerId}
    />
    </>
  );
}
