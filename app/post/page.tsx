"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fetchTags } from "@/lib/tags";
import type { Tag } from "@/lib/types";

const MAX_LENGTH = 500;

export default function PostPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  // 投稿は保存済みだがタグ設定に失敗し、取り消しもできなかった状態
  const [savedWithoutTags, setSavedWithoutTags] = useState(false);

  const router = useRouter();

  // ログイン確認 → タグ一覧を取得
  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const { data, error } = await fetchTags();

      if (error) {
        console.error(error);
        setMessage("タグの取得に失敗しました");
      } else {
        setTags(data ?? []);
      }

      setLoading(false);
    };

    init();
  }, []);

  // タグの選択・解除
  const handleTagChange = (tagId: number) => {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId]
    );
  };

  // 投稿処理
  const handlePost = async () => {
    if (submitting || savedWithoutTags) return;

    const trimmed = content.trim();

    if (!trimmed) {
      setMessage("投稿内容を入力してください");
      return;
    }

    if (content.length > MAX_LENGTH) {
      setMessage(`投稿内容は${MAX_LENGTH}文字以内で入力してください`);
      return;
    }

    setSubmitting(true);
    setMessage("");

    // ログインユーザーを再確認(user_id は必ずこの値を使う)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("ログインしてください");
      setSubmitting(false);
      return;
    }

    // 投稿を保存
    const { data: post, error: postError } = await supabase
      .from("posts")
      .insert({
        user_id: user.id,
        content: trimmed,
      })
      .select("id")
      .single();

    if (postError || !post) {
      console.error(postError);
      setMessage(
        postError?.code === "23514"
          ? `投稿内容は${MAX_LENGTH}文字以内で入力してください`
          : "投稿に失敗しました。もう一度お試しください"
      );
      setSubmitting(false);
      return;
    }

    // 選択されたタグを保存
    if (selectedTagIds.length > 0) {
      const postTags = selectedTagIds.map((tagId) => ({
        post_id: post.id,
        tag_id: tagId,
      }));

      const { error: tagError } = await supabase
        .from("post_tags")
        .insert(postTags);

      if (tagError) {
        console.error(tagError);

        // 投稿だけが残らないよう、保存した投稿を取り消す
        const { error: deleteError } = await supabase
          .from("posts")
          .delete()
          .eq("id", post.id);

        if (deleteError) {
          console.error(deleteError);
          // 取り消しも失敗した場合は、重複投稿を防ぐため再送信不可にする
          setSavedWithoutTags(true);
          setMessage(
            "投稿は保存されましたが、タグを設定できませんでした。再投稿はしないでください"
          );
        } else {
          setMessage("投稿に失敗しました。もう一度お試しください");
        }

        setSubmitting(false);
        return;
      }
    }

    router.push("/");
  };

  if (loading) {
    return (
      <section className="post-form post-form--state">
        <p>読み込み中...</p>
      </section>
    );
  }

  if (!userId) {
    return (
      <section className="post-form post-form--state">
        <p>ログインしてください</p>
        <Link href="/login" className="post-form__link">
          ログインページへ
        </Link>
      </section>
    );
  }

  const isEmpty = content.trim() === "";

  return (
    <section className="post-form">
      <h1 className="post-form__title">投稿作成</h1>

      <div className="post-form__field">
        <textarea
          className="post-form__input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={MAX_LENGTH}
          placeholder="今の気持ちを書いてみよう..."
          rows={12}
          aria-label="投稿内容"
        />
        <p className="post-form__count">
          {content.length}/{MAX_LENGTH}
        </p>
      </div>

      <div className="post-form__tags">
        {tags.length === 0 ? (
          <p className="post-form__tags-empty">利用できるタグがありません。</p>
        ) : (
          tags.map((tag) => {
            const active = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                className={`home-tag-button${active ? " active" : ""}`}
                aria-pressed={active}
                onClick={() => handleTagChange(tag.id)}
              >
                {tag.name}
              </button>
            );
          })
        )}
      </div>

      <div className="post-form__footer">
        <button
          type="button"
          className="post-form__submit"
          onClick={handlePost}
          disabled={submitting || savedWithoutTags || isEmpty}
        >
          {submitting ? "投稿中..." : "投稿"}
        </button>
      </div>

      {message && <p className="post-form__message">{message}</p>}
    </section>
  );
}
