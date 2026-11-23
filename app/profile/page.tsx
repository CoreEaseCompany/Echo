"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  AVATAR_ACCEPT,
  getAvatarUrl,
  prepareAvatarImage,
  removeAvatar,
  uploadAvatar,
} from "@/lib/avatar";
import ProfilePostList from "@/components/ProfilePostList";
import UserAvatar from "@/components/UserAvatar";

export default function ProfilePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  // 保存済みのアイコン画像のパス
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  // 選択済み・未保存のアイコン画像（加工済み）
  const [pendingAvatar, setPendingAvatar] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // 「画像を削除」が押された（保存時に確定）
  const [removeRequested, setRemoveRequested] = useState(false);
  // アイコン画像の加工中
  const [processing, setProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

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
        setAvatarPath(data.avatar_path ?? null);
      }

      setLoading(false);
    };

    fetchProfile();
  }, []);

  // アンマウント時にプレビューURLを解放する
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  // 未保存のアイコン画像を差し替える（古いプレビューURLは解放する）
  const replacePending = useCallback((blob: Blob | null) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const url = blob ? URL.createObjectURL(blob) : null;
    previewUrlRef.current = url;
    setPendingAvatar(blob);
    setPreviewUrl(url);
  }, []);

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 同じファイルを再選択できるようにする
    e.target.value = "";

    if (!file) return;

    setMessage("");
    setProcessing(true);
    const result = await prepareAvatarImage(file);
    setProcessing(false);

    if ("error" in result) {
      setMessage(result.error);
      return;
    }

    replacePending(result.blob);
    setRemoveRequested(false);
  };

  const handleAvatarRemove = () => {
    replacePending(null);
    setRemoveRequested(true);
  };

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

    try {
      let newPath: string | null = null;

      if (pendingAvatar) {
        try {
          newPath = await uploadAvatar(authData.user.id, pendingAvatar);
        } catch (error) {
          console.error(error);
          setMessage("画像のアップロードに失敗しました");
          return;
        }
      }

      const avatarChanged = newPath !== null || removeRequested;

      const profileData = {
        user_id: authData.user.id,
        username: username.trim(),
        bio: bio.trim(),
        updated_at: new Date().toISOString(),
        // 画像を変更していないときは avatar_path を送らない（既存値を上書きしない）
        ...(avatarChanged ? { avatar_path: newPath } : {}),
      };

      const { error } = await supabase
        .from("profiles")
        .upsert(profileData, { onConflict: "user_id" });

      if (error) {
        console.error(error);

        // プロフィールに登録できなかった画像は残さない
        if (newPath) {
          await removeAvatar(newPath);
        }

        if (error.code === "23505") {
          setMessage("このユーザー名は既に使用されています");
        } else {
          setMessage("保存に失敗しました");
        }
        return;
      }

      if (avatarChanged) {
        // 差し替え・削除した古い画像を消す（失敗はログのみ）
        if (avatarPath) {
          await removeAvatar(avatarPath);
        }

        setAvatarPath(newPath);
        replacePending(null);
        setRemoveRequested(false);
      }

      setMessage("プロフィールを保存しました");
    } finally {
      setSaving(false);
    }
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

  const busy = saving || processing;
  const displayUrl =
    previewUrl ?? (removeRequested ? null : getAvatarUrl(avatarPath));

  return (
    <>
    <section className="profile-card">
      <h1 className="profile-card__title">プロフィール</h1>

      <UserAvatar
        userId={userId}
        avatarUrl={displayUrl}
        className="profile-card__icon"
      />

      <div className="profile-card__icon-actions">
        <input
          ref={fileInputRef}
          type="file"
          accept={AVATAR_ACCEPT}
          onChange={handleAvatarChange}
          hidden
        />
        <button
          type="button"
          className="profile-card__icon-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          {processing ? "画像を処理中..." : "画像を選択"}
        </button>
        {displayUrl && (
          <button
            type="button"
            className="profile-card__icon-button"
            onClick={handleAvatarRemove}
            disabled={busy}
          >
            画像を削除
          </button>
        )}
      </div>

      <p className="profile-card__icon-note">
        アイコン画像は誰でも閲覧できます。顔写真など、個人を特定できる画像は設定しないでください。
      </p>

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
          disabled={busy}
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
