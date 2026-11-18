"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { normalizeTags } from "@/lib/tags";
import type { JoinedTags } from "@/lib/tags";
import type { Comment, Empathy, Post, Tag } from "@/lib/types";
import { getUserColor } from "@/lib/userColor";

const MAX_LENGTH = 500;

type PostWithEmpathies = Post & {
  empathies: Empathy[];
};

// 同じ id のメッセージが既にあれば追加しない（送信の返り値と Realtime の重複対策）
function appendComment(comments: Comment[], added: Comment): Comment[] {
  return comments.some((comment) => comment.id === added.id)
    ? comments
    : [...comments, added];
}

export default function PostDetail() {
  const params = useParams();
  const id = Number(params.id as string);

  const [post, setPost] = useState<PostWithEmpathies | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const messagesRef = useRef<HTMLDivElement>(null);
  // 最下部付近を表示しているときだけ、新着で自動スクロールする
  const stickToBottomRef = useRef(true);

  // 初期データの取得
  useEffect(() => {
    const getData = async () => {
      // ログインユーザーを取得
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      // 投稿を取得
      const { data: postData, error: postError } = await supabase
        .from("posts")
        .select(`
          *,
          empathies (
            id,
            user_id
          )
        `)
        .eq("id", id)
        .single();

      if (postError) {
        console.error(postError);
        setLoading(false);
        return;
      }

      setPost(postData);

      // タグを取得
      const { data: tagData, error: tagError } = await supabase
        .from("post_tags")
        .select("tags(id, name)")
        .eq("post_id", id);

      if (tagError) {
        console.error(tagError);
      } else {
        setTags(
          ((tagData ?? []) as unknown as { tags: JoinedTags }[]).flatMap(
            (item) => normalizeTags(item.tags)
          )
        );
      }

      // 既存のコメントをメッセージ履歴として取得
      const { data: commentData, error: commentError } = await supabase
        .from("comments")
        .select("*")
        .eq("post_id", id)
        .order("created_at", { ascending: true });

      if (commentError) {
        console.error(commentError);
      } else {
        setComments(commentData ?? []);
      }

      setLoading(false);
    };

    getData();
  }, [id]);

  // 他ユーザーの新着メッセージを購読する
  const postId = post?.id;

  useEffect(() => {
    if (!postId) return;

    const channel = supabase
      .channel(`post-chat-${postId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `post_id=eq.${postId}`,
        },
        (payload) => {
          setComments((current) =>
            appendComment(current, payload.new as Comment)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId]);

  // 新着時の自動スクロール
  useEffect(() => {
    const element = messagesRef.current;

    if (element && stickToBottomRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [comments, loading]);

  // スクロール位置が最下部付近かを記録する
  const handleScroll = () => {
    const element = messagesRef.current;
    if (!element) return;

    stickToBottomRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  };

  // 共感済みかどうか
  const hasEmpathy =
    post?.empathies.some(
      (empathy) => empathy.user_id === userId
    ) ?? false;

  // 共感ボタン
  const handleEmpathy = async () => {
    if (!userId || !post) {
      setErrorMessage("ログインしてください");
      return;
    }

    setErrorMessage("");

    if (hasEmpathy) {
      const { error } = await supabase
        .from("empathies")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", userId);

      if (error) {
        console.error(error);
        setErrorMessage("共感を取り消せませんでした。");
        return;
      }

      setPost({
        ...post,
        empathies: post.empathies.filter(
          (empathy) => empathy.user_id !== userId
        ),
      });
    } else {
      const { data, error } = await supabase
        .from("empathies")
        .insert({
          post_id: post.id,
          user_id: userId,
        })
        .select()
        .single();

      if (error) {
        console.error(error);
        setErrorMessage("共感できませんでした。");
        return;
      }

      setPost({
        ...post,
        empathies: [...post.empathies, data],
      });
    }
  };

  // メッセージ送信
  const handleSend = async () => {
    const trimmed = input.trim();

    if (!userId || !post) {
      setErrorMessage("ログインしてください");
      return;
    }

    if (!trimmed || sending) return;

    setSending(true);
    setErrorMessage("");
    stickToBottomRef.current = true;

    const { data, error } = await supabase
      .from("comments")
      .insert({
        user_id: userId,
        post_id: post.id,
        content: trimmed,
      })
      .select()
      .single();

    setSending(false);

    if (error) {
      console.error(error);
      setErrorMessage("送信できませんでした。時間をおいて再度お試しください。");
      return;
    }

    // 自分の送信分は返り値で追加する
    setComments((current) => appendComment(current, data));
    setInput("");
  };

  // Enter で送信、Shift+Enter で改行
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  // メッセージ削除（自分のものだけ）
  const handleDeleteComment = async (commentId: number) => {
    setErrorMessage("");

    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId);

    if (error) {
      console.error(error);
      setErrorMessage("削除できませんでした。");
      return;
    }

    setComments((current) =>
      current.filter((comment) => comment.id !== commentId)
    );
  };

  if (loading) {
    return (
      <section className="chat-room chat-room--state">
        <p className="chat-room__state">読み込み中...</p>
      </section>
    );
  }

  if (!userId) {
    return (
      <section className="chat-room chat-room--state">
        <p className="chat-room__state">チャットに参加するにはログインが必要です。</p>
        <Link href="/login" className="chat-room__link">
          ログイン画面へ
        </Link>
      </section>
    );
  }

  if (!post) {
    return (
      <section className="chat-room chat-room--state">
        <p className="chat-room__state">投稿が見つかりません。</p>
        <Link href="/" className="chat-room__link">
          ← 投稿一覧へ戻る
        </Link>
      </section>
    );
  }

  return (
    <section className="chat-room">
      {/* ヘッダー：タイトル・タグ・共感 */}
      <header className="chat-room__header">
        <h1 className="chat-room__title">{post.content}</h1>

        {tags.length > 0 && (
          <ul className="chat-room__tags">
            {tags.map((tag) => (
              <li key={tag.id} className="chat-room__tag">
                #{tag.name}
              </li>
            ))}
          </ul>
        )}

        <div className="chat-room__empathy">
          <span>共感数：{post.empathies.length}</span>
          <button
            type="button"
            className="chat-room__button"
            onClick={handleEmpathy}
          >
            {hasEmpathy ? "共感を取り消す" : "共感する"}
          </button>
        </div>
      </header>

      {/* メッセージ一覧（この領域だけスクロール） */}
      <div
        className="chat-room__messages"
        ref={messagesRef}
        onScroll={handleScroll}
      >
        {comments.length === 0 && (
          <p className="chat-room__empty">まだメッセージはありません。</p>
        )}

        {comments.map((comment) => {
          const isMine = comment.user_id === userId;

          return (
            <div
              key={comment.id}
              className={`chat-message${isMine ? " chat-message--mine" : ""}`}
            >
              <Link
                href={`/profile/${comment.user_id}`}
                prefetch={false}
                className="chat-message__avatar"
                style={{ backgroundColor: getUserColor(comment.user_id) }}
                aria-label="プロフィールを見る"
              />

              <div className="chat-message__body">
                <p className="chat-message__text">{comment.content}</p>

                <div className="chat-message__meta">
                  <small>
                    {new Date(comment.created_at).toLocaleTimeString("ja-JP", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>

                  {isMine && (
                    <button
                      type="button"
                      className="chat-message__delete"
                      onClick={() => handleDeleteComment(comment.id)}
                    >
                      削除
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {errorMessage && (
        <p className="chat-room__error" role="alert">
          {errorMessage}
        </p>
      )}

      {/* 入力欄（下部固定） */}
      <form
        className="chat-room__form"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <textarea
          className="chat-room__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_LENGTH}
          rows={2}
          placeholder="メッセージを入力（Enterで送信 / Shift+Enterで改行）"
          disabled={sending}
        />

        <div className="chat-room__form-footer">
          <span className="chat-room__count">
            {input.length}/{MAX_LENGTH}
          </span>

          <button
            type="submit"
            className="chat-room__button"
            disabled={sending || !input.trim()}
          >
            {sending ? "送信中..." : "送信"}
          </button>
        </div>
      </form>
    </section>
  );
}
