
"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Post = {
  id: number;
  user_id: string;
  content: string;
};

type Tag = {
  id: number;
  name: string;
};

type Props = {
  post: Post;
  userId: string;
  username: string;
  tags: Tag[];
  onDelete: (postId: number) => void;
};

export default function PostCard({
  post,
  userId,
  username,
  tags,
  onDelete,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);

  const handleUpdate = async () => {
    if (!editContent.trim()) {
      alert("投稿内容を入力してください");
      return;
    }

    const { error } = await supabase
      .from("posts")
      .update({
        content: editContent.trim(),
      })
      .eq("id", post.id);

    if (error) {
      alert(error.message);
      return;
    }

    post.content = editContent.trim();
    setIsEditing(false);
  };

  return (
    <article className="post-card">
      <div className="post-card__content">

        {/* 投稿者 */}
        <Link
          href={`/profile/${post.user_id}`}
          className="post-card__username"
        >
          {username}
        </Link>

        {/* 投稿内容 */}
        {isEditing ? (
          <>
            <textarea
              className="post-card__edit"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={4}
            />

            <div className="post-card__actions">
              <button onClick={handleUpdate}>
                保存
              </button>

              <button
                onClick={() => {
                  setEditContent(post.content);
                  setIsEditing(false);
                }}
              >
                キャンセル
              </button>
            </div>
          </>
        ) : (
          <div className="post-card__post-body">
            <Link
              href={`/post/${post.id}`}
              className="post-card__post-link"
            >
              <p className="post-card__text">
                {post.content}
              </p>
            </Link>
          </div>
        )}

        {/* タグ */}
        {tags.length > 0 && (
          <div className="post-card__tags">
            {tags.map((tag) => (
              <span key={tag.id} className="post-card__tag">
                #{tag.name}
              </span>
            ))}
          </div>
        )}

        {/* 投稿者本人のみ編集・削除可能 */}
        {post.user_id === userId && (
          <div className="post-card__actions">
            {!isEditing && (
              <button onClick={() => setIsEditing(true)}>
                編集
              </button>
            )}

            <button onClick={() => onDelete(post.id)}>
              削除
            </button>
          </div>
        )}

      </div>
    </article>
  );
}
