"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { normalizeTags } from "@/lib/tags";
import type { JoinedTags } from "@/lib/tags";
import type { Post, Tag } from "@/lib/types";
import PostCard from "@/components/PostCard";

const PAGE_SIZE = 10;

type Props = {
  userId: string; // 表示対象ユーザー
  username: string;
  viewerId: string | null; // ログインユーザー（編集・削除の判定用）
};

type PostTagRow = {
  post_id: number;
  tags: JoinedTags;
};

export default function ProfilePostList({ userId, username, viewerId }: Props) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [tagsByPost, setTagsByPost] = useState<Record<number, Tag[]>>({});
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const offsetRef = useRef(0);

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError("");

    const from = offsetRef.current;
    const to = from + PAGE_SIZE - 1;

    const { data, error: postError } = await supabase
      .from("posts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (postError) {
      console.error(postError);
      setError("投稿の取得に失敗しました");
      loadingRef.current = false;
      setLoading(false);
      // 無限リトライを避けるため、これ以上の自動読み込みは止める
      setHasMore(false);
      return;
    }

    const rows = data ?? [];

    if (rows.length > 0) {
      const { data: relationData, error: relationError } = await supabase
        .from("post_tags")
        .select("post_id, tags(id, name)")
        .in(
          "post_id",
          rows.map((post) => post.id)
        );

      if (relationError) {
        console.error(relationError);
      } else {
        const grouped: Record<number, Tag[]> = {};
        ((relationData ?? []) as unknown as PostTagRow[]).forEach((item) => {
          const itemTags = normalizeTags(item.tags);
          if (itemTags.length === 0) return;
          (grouped[item.post_id] ??= []).push(...itemTags);
        });
        setTagsByPost((current) => ({ ...current, ...grouped }));
      }
    }

    offsetRef.current = from + rows.length;
    setPosts((current) => {
      const known = new Set(current.map((post) => post.id));
      return [...current, ...rows.filter((post) => !known.has(post.id))];
    });
    setHasMore(rows.length >= PAGE_SIZE);
    loadingRef.current = false;
    setLoading(false);
  }, [userId]);

  // 1ページ目を取得（表示対象が変わる場合は親側の key で再マウントされる）
  useEffect(() => {
    loadMore();
  }, [loadMore]);

  // 末尾の番兵が見えたら次ページを取得
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { rootMargin: "0px 0px 100% 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, posts.length]);

  // 投稿削除
  const handleDelete = async (postId: number) => {
    const { error: deleteError } = await supabase
      .from("posts")
      .delete()
      .eq("id", postId);

    if (deleteError) {
      alert("削除に失敗しました");
      return;
    }

    setPosts((current) => current.filter((post) => post.id !== postId));
  };

  const initialLoading = loading && posts.length === 0;

  return (
    <div className="profile-post-list">
      {initialLoading ? (
        <p className="profile-post-list__state">読み込み中...</p>
      ) : posts.length === 0 && !error ? (
        <p className="profile-post-list__state">まだ投稿がありません。</p>
      ) : (
        posts.map((post) => (
          <div key={post.id} className="profile-post-item">
            <PostCard
              post={post}
              userId={viewerId ?? ""}
              username={username || "名前未設定"}
              tags={tagsByPost[post.id] ?? []}
              onDelete={handleDelete}
            />
          </div>
        ))
      )}

      {error && <p className="profile-post-list__state">{error}</p>}

      {!initialLoading && loading && posts.length > 0 && (
        <p className="profile-post-list__state profile-post-list__state--inline">
          読み込み中...
        </p>
      )}

      {!hasMore && !loading && !error && posts.length > 0 && (
        <p className="profile-post-list__state">投稿は以上です。</p>
      )}

      <div ref={sentinelRef} className="profile-post-list__sentinel" />
    </div>
  );
}
