
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Profile = {
  user_id: string;
  username: string | null;
  bio: string | null;
};

type Post = {
  id: number;
  content: string;
  created_at: string;
};

export default function PublicProfilePage() {
  const params = useParams();
  const userId = params.userId as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      const { data: profileData, error: profileError } =
        await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

      if (profileError) {
        console.error(profileError);
        setMessage("プロフィールの取得に失敗しました");
        setLoading(false);
        return;
      }

      if (!profileData) {
        setMessage("プロフィールが見つかりません");
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const { data: postData, error: postError } =
        await supabase
          .from("posts")
          .select("id, content, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

      if (postError) {
        console.error(postError);
        setMessage("投稿の取得に失敗しました");
      } else {
        setPosts(postData ?? []);
      }

      setLoading(false);
    };

    fetchData();
  }, [userId]);

  if (loading) {
    return <main>読み込み中...</main>;
  }

  if (!profile) {
    return (
      <main>
        <p>{message || "プロフィールが見つかりません"}</p>
        <Link href="/">投稿一覧へ戻る</Link>
      </main>
    );
  }

  return (
    <main>
      <h1>{profile.username || "名前未設定"}</h1>

      <h2>自己紹介</h2>
      <p>{profile.bio || "自己紹介はありません"}</p>

      <hr />

      <h2>投稿一覧</h2>

      {posts.length === 0 ? (
        <p>まだ投稿はありません</p>
      ) : (
        posts.map((post) => (
          <div key={post.id}>
            <Link href={`/post/${post.id}`}>
              <p>{post.content}</p>
            </Link>
            <small>
              {new Date(post.created_at).toLocaleString("ja-JP")}
            </small>
            <hr />
          </div>
        ))
      )}

      <Link href="/">投稿一覧へ戻る</Link>
    </main>
  );
}
