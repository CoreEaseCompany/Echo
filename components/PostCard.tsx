
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
  const [displayContent, setDisplayContent] = useState(post.content);
  const [isSaving, setIsSaving] = useState(false);

  // 編集開始
  const handleEdit = () => {
    setEditContent(displayContent);
    setIsEditing(true);
  };

  // 編集キャンセル
  const handleCancel = () => {
    setEditContent(displayContent);
    setIsEditing(false);
  };

  // 投稿更新
  const handleUpdate = async () => {
    const trimmedContent = editContent.trim();

    if (!trimmedContent) {
      alert("投稿内容を入力してください");
      return;
    }

    if (isSaving) return;

    setIsSaving(true);

    const { error } = await supabase
      .from("posts")
      .update({
        content: trimmedContent,
      })
      .eq("id", post.id);

    setIsSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    setDisplayContent(trimmedContent);
    setIsEditing(false);
  };

  return (
    <article className="post-card">
      <div className="post-card__content">

        {/* ヘッダー：投稿者 */}
        <div className="post-card__header">
          <Link
            href={`/profile/${post.user_id}`}
            className="post-card__username"
          >
            {username}
          </Link>
        </div>

        {/* ボディ：投稿内容・タグ */}
        <div className="post-card__body">

          {isEditing ? (
            <textarea
              className="post-card__edit"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={4}
              disabled={isSaving}
            />
          ) : (
            <div className="post-card__post-body">
              <Link
                href={`/post/${post.id}`}
                className="post-card__post-link"
              >
                <p className="post-card__text">
                  {displayContent}
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

        </div>

        {/* フッター：操作ボタン */}
        {post.user_id === userId && (
          <div className="post-card__actions">
            {isEditing ? (
              <>
                <button
                  onClick={handleUpdate}
                  disabled={isSaving}
                >
                  {isSaving ? "保存中..." : "保存"}
                </button>

                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  キャンセル
                </button>
              </>
            ) : (
              <>
                <button onClick={handleEdit}>
                  編集
                </button>

                <button onClick={() => onDelete(post.id)}>
                  削除
                </button>
              </>
            )}
          </div>
        )}

      </div>
    </article>
  );
}
