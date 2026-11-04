
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import PostCard from "@/components/PostCard";

type Post = {
  id: number;
  user_id: string;
  content: string;
  created_at: string;
};

type Profile = {
  user_id: string;
  username: string | null;
};

type Tag = {
  id: number;
  name: string;
};

type PostTag = {
  post_id: number;
  tags: Tag | Tag[] | null;
};

export default function Home() {
  const [email, setEmail] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [postTags, setPostTags] = useState<Record<number, Tag[]>>({});
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getData = async () => {
      // ログインユーザーを取得
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setEmail(user.email ?? "");
        setUserId(user.id);
      }

      // タグ一覧を取得
      const { data: tagData, error: tagError } = await supabase
        .from("tags")
        .select("id, name")
        .order("id");

      if (tagError) {
        console.error(tagError);
      } else {
        setTags(tagData ?? []);
      }

      // 投稿一覧を取得
      await getPosts();

      setLoading(false);
    };

    getData();
  }, []);

  // 投稿と関連情報を取得
  const getPosts = async (tagId?: number | null) => {
    let postIds: number[] | null = null;

    // タグが選択されている場合、該当する投稿IDを取得
    if (tagId !== null && tagId !== undefined) {
      const { data: relationData, error: relationError } = await supabase
        .from("post_tags")
        .select("post_id")
        .eq("tag_id", tagId);

      if (relationError) {
        console.error(relationError);
        return;
      }

      postIds = [...new Set((relationData ?? []).map((item) => item.post_id))];

      // 該当する投稿がない場合
      if (postIds.length === 0) {
        setPosts([]);
        setProfiles([]);
        setPostTags({});
        return;
      }
    }

    // 投稿を取得
    let query = supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (postIds !== null) {
      query = query.in("id", postIds);
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      return;
    }

    if (!data) return;

    setPosts(data);

    if (data.length === 0) {
      setProfiles([]);
      setPostTags({});
      return;
    }

    // 投稿者のユーザーIDを取得
    const userIds = [...new Set(data.map((post) => post.user_id))];

    // プロフィールを取得
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, username")
      .in("user_id", userIds);

    if (profileError) {
      console.error(profileError);
    } else {
      setProfiles(profileData ?? []);
    }

    // 投稿に紐づくタグを取得
    const postIdsForTags = data.map((post) => post.id);

    const { data: relationData, error: relationError } = await supabase
      .from("post_tags")
      .select("post_id, tags(id, name)")
      .in("post_id", postIdsForTags);

    if (relationError) {
      console.error(relationError);
      return;
    }

    // 投稿IDごとにタグを整理
    const groupedTags: Record<number, Tag[]> = {};

    (
      (relationData ?? []) as unknown as PostTag[]
    ).forEach((item) => {
      if (!item.tags) return;

      const itemTags = Array.isArray(item.tags)
        ? item.tags
        : [item.tags];

      if (!groupedTags[item.post_id]) {
        groupedTags[item.post_id] = [];
      }

      groupedTags[item.post_id].push(...itemTags);
    });

    setPostTags(groupedTags);
  };

  // タグ選択
  const handleTagSelect = async (tagId: number | null) => {
    setSelectedTagId(tagId);
    setLoading(true);

    await getPosts(tagId);

    setLoading(false);
  };

  // 投稿削除
  const handleDelete = async (postId: number) => {
    const { error } = await supabase
      .from("posts")
      .delete()
      .eq("id", postId);

    if (error) {
      alert("削除に失敗しました");
      return;
    }

    setPosts((currentPosts) =>
      currentPosts.filter((post) => post.id !== postId)
    );
  };


  return (
    <main className="home-main">
      {/* タグ検索 */}
      <section className="home-tag-area">
        <h2>気持ちから投稿を探す</h2>

        <div className="home-tag-list">
          <button
            className={`home-tag-button ${selectedTagId === null ? "active" : ""
              }`}
            onClick={() => handleTagSelect(null)}
            disabled={selectedTagId === null}
          >
            すべて
          </button>

          {tags.map((tag) => (
            <button
              key={tag.id}
              className={`home-tag-button ${selectedTagId === tag.id ? "active" : ""
                }`}
              onClick={() => handleTagSelect(tag.id)}
              disabled={selectedTagId === tag.id}
            >
              #{tag.name}
            </button>
          ))}
        </div>
      </section>

      {/* 投稿一覧 */}
      <div className="post-grid-scroll">
        <section className="post-grid">
          {loading ? (
            <p className="text-center">読み込み中...</p>
          ) : posts.length === 0 ? (
            <p className="text-center">
              該当する投稿はありません。
            </p>
          ) : (
            posts.map((post) => {
              const profile = profiles.find(
                (item) => item.user_id === post.user_id
              );

              return (
                <PostCard
                  key={post.id}
                  post={post}
                  userId={userId}
                  username={profile?.username ?? "名前未設定"}
                  tags={postTags[post.id] ?? []}
                  onDelete={handleDelete}
                />
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
