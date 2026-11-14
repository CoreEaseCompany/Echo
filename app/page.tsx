"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchTags, normalizeTags } from "@/lib/tags";
import type { JoinedTags } from "@/lib/tags";
import type { Post, Profile, Tag } from "@/lib/types";
import PostCard from "@/components/PostCard";

type Author = Pick<Profile, "user_id" | "username">;

type Feed = {
  posts: Post[];
  profiles: Author[];
  postTags: Record<number, Tag[]>;
};

type PostTagRow = {
  post_id: number;
  tags: JoinedTags;
};

const EMPTY_FEED: Feed = { posts: [], profiles: [], postTags: {} };

// 投稿と関連情報を取得する。
// 取得できた項目だけを返し、失敗した項目は含めない（画面側は既存の表示を維持する）。
async function loadFeed(tagId: number | null): Promise<Partial<Feed>> {
  let postIds: number[] | null = null;

  // タグが選択されている場合、該当する投稿IDを取得
  if (tagId !== null) {
    const { data: relationData, error: relationError } = await supabase
      .from("post_tags")
      .select("post_id")
      .eq("tag_id", tagId);

    if (relationError) {
      console.error(relationError);
      return {};
    }

    postIds = [...new Set((relationData ?? []).map((item) => item.post_id))];

    // 該当する投稿がない場合
    if (postIds.length === 0) return EMPTY_FEED;
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
    return {};
  }

  if (!data) return {};
  if (data.length === 0) return EMPTY_FEED;

  const feed: Partial<Feed> = { posts: data };

  // 投稿者のプロフィールを取得
  const userIds = [...new Set(data.map((post) => post.user_id))];

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, username")
    .in("user_id", userIds);

  if (profileError) {
    console.error(profileError);
  } else {
    feed.profiles = profileData ?? [];
  }

  // 投稿に紐づくタグを取得
  const { data: relationData, error: relationError } = await supabase
    .from("post_tags")
    .select("post_id, tags(id, name)")
    .in(
      "post_id",
      data.map((post) => post.id)
    );

  if (relationError) {
    console.error(relationError);
    return feed;
  }

  // 投稿IDごとにタグを整理
  const groupedTags: Record<number, Tag[]> = {};

  ((relationData ?? []) as unknown as PostTagRow[]).forEach((item) => {
    const itemTags = normalizeTags(item.tags);
    if (itemTags.length === 0) return;

    (groupedTags[item.post_id] ??= []).push(...itemTags);
  });

  feed.postTags = groupedTags;

  return feed;
}

export default function Home() {
  const [feed, setFeed] = useState<Feed>(EMPTY_FEED);
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
        setUserId(user.id);
      }

      // タグ一覧を取得
      const { data: tagData, error: tagError } = await fetchTags();

      if (tagError) {
        console.error(tagError);
      } else {
        setTags(tagData ?? []);
      }

      // 投稿一覧を取得
      const loaded = await loadFeed(null);
      setFeed((current) => ({ ...current, ...loaded }));

      setLoading(false);
    };

    getData();
  }, []);

  // タグ選択
  const handleTagSelect = async (tagId: number | null) => {
    setSelectedTagId(tagId);
    setLoading(true);

    const loaded = await loadFeed(tagId);
    setFeed((current) => ({ ...current, ...loaded }));

    setLoading(false);
  };

  // 投稿削除
  const handleDelete = async (postId: number) => {
    const { error } = await supabase.from("posts").delete().eq("id", postId);

    if (error) {
      alert("削除に失敗しました");
      return;
    }

    setFeed((current) => ({
      ...current,
      posts: current.posts.filter((post) => post.id !== postId),
    }));
  };

  const { posts, profiles, postTags } = feed;

  return (
    <div className="home-main">
      {/* タグ検索 */}
      <section className="home-tag-area">
        <h2>気持ちから投稿を探す</h2>

        <div className="home-tag-list">
          <button
            className={`home-tag-button ${
              selectedTagId === null ? "active" : ""
            }`}
            onClick={() => handleTagSelect(null)}
            disabled={selectedTagId === null}
          >
            すべて
          </button>

          {tags.map((tag) => (
            <button
              key={tag.id}
              className={`home-tag-button ${
                selectedTagId === tag.id ? "active" : ""
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
            <p className="text-center">該当する投稿はありません。</p>
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
    </div>
  );
}
