"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useParams } from "next/navigation";
import ChatMedia from "@/components/ChatMedia";
import UserAvatar from "@/components/UserAvatar";
import { getAvatarUrl } from "@/lib/avatar";
import {
  CHAT_MEDIA_ACCEPT,
  createChatMediaUrls,
  prepareChatMedia,
  removeChatMedia,
  uploadChatMedia,
} from "@/lib/chatMedia";
import type { PreparedMedia } from "@/lib/chatMedia";
import { supabase } from "@/lib/supabase";
import { normalizeTags } from "@/lib/tags";
import type { JoinedTags } from "@/lib/tags";
import type { Comment, Empathy, Post, Tag } from "@/lib/types";

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
  // 送信待ちの添付メディア（画像はメタデータ除去済み）
  const [preparedMedia, setPreparedMedia] = useState<PreparedMedia | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // 添付画像の再エンコード中
  const [processing, setProcessing] = useState(false);
  // media_path → 署名付きURL
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  // user_id → アイコン画像のパス（NULL は色アイコン）
  const [avatarPaths, setAvatarPaths] = useState<Record<string, string | null>>({});

  const messagesRef = useRef<HTMLDivElement>(null);
  // 最下部付近を表示しているときだけ、新着で自動スクロールする
  const stickToBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  // 署名付きURLの再発行は1パスにつき1回まで（期限切れ対策・無限ループ防止）
  const retriedPathsRef = useRef(new Set<string>());
  // アイコン画像を取得済み・取得中の user_id（重複取得の防止）
  const requestedAvatarIdsRef = useRef(new Set<string>());

  // 署名付きURLを発行して追加する
  const loadMediaUrls = useCallback(async (paths: string[]) => {
    const urls = await createChatMediaUrls(paths);
    setMediaUrls((current) => ({ ...current, ...urls }));
  }, []);

  // まだ取得していないユーザーのアイコン画像のパスをまとめて取得する
  const loadAvatars = useCallback(async (userIds: string[]) => {
    const requested = requestedAvatarIdsRef.current;
    const ids = [...new Set(userIds)].filter((userId) => !requested.has(userId));

    if (ids.length === 0) return;

    ids.forEach((userId) => requested.add(userId));

    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, avatar_path")
      .in("user_id", ids);

    if (error) {
      // 取得できなくても色アイコンで表示する
      console.error(error);
      return;
    }

    const paths: Record<string, string | null> = {};

    // プロフィールがないユーザーは NULL（色アイコン）として記録する
    for (const userId of ids) {
      paths[userId] = null;
    }

    for (const profile of data ?? []) {
      paths[profile.user_id] = profile.avatar_path;
    }

    setAvatarPaths((current) => ({ ...current, ...paths }));
  }, []);

  const scrollToBottomIfSticky = useCallback(() => {
    const element = messagesRef.current;

    if (element && stickToBottomRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, []);

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
        const loadedComments: Comment[] = commentData ?? [];
        setComments(loadedComments);

        // アイコン画像は完了を待たずに取得する
        loadAvatars(loadedComments.map((comment) => comment.user_id));

        // 添付メディアのURLはまとめて発行する（完了を待たずに表示を始める）
        loadMediaUrls(
          loadedComments.flatMap((comment) =>
            comment.media_path ? [comment.media_path] : []
          )
        );
      }

      setLoading(false);
    };

    getData();
  }, [id, loadMediaUrls, loadAvatars]);

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
          const added = payload.new as Comment;

          setComments((current) => appendComment(current, added));
          loadAvatars([added.user_id]);

          if (added.media_path) {
            loadMediaUrls([added.media_path]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId, loadMediaUrls, loadAvatars]);

  // 新着時の自動スクロール
  useEffect(() => {
    scrollToBottomIfSticky();
  }, [comments, loading, scrollToBottomIfSticky]);

  // 添付メディアを差し替える（古いプレビューURLは解放する）
  const replaceAttachment = useCallback((media: PreparedMedia | null) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const url = media ? URL.createObjectURL(media.blob) : null;
    previewUrlRef.current = url;
    setPreparedMedia(media);
    setPreviewUrl(url);
  }, []);

  // アンマウント時にプレビューURLを解放する
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

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

  // 送信できる状態か（本文かメディアのどちらかが必要）
  const canSend =
    !sending && !processing && (input.trim() !== "" || preparedMedia !== null);

  // 添付ファイルの選択
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 同じファイルを選び直せるようにする
    e.target.value = "";

    if (!file) return;

    setErrorMessage("");
    setProcessing(true);

    const result = await prepareChatMedia(file);

    setProcessing(false);

    if ("error" in result) {
      setErrorMessage(result.error);
      return;
    }

    replaceAttachment(result.media);
  };

  // メッセージ送信
  const handleSend = async () => {
    const trimmed = input.trim();

    if (!userId || !post) {
      setErrorMessage("ログインしてください");
      return;
    }

    if (!canSend) return;

    setSending(true);
    setErrorMessage("");
    stickToBottomRef.current = true;

    try {
      let mediaPath: string | null = null;

      if (preparedMedia) {
        try {
          mediaPath = await uploadChatMedia(userId, post.id, preparedMedia);
        } catch (error) {
          console.error(error);
          setErrorMessage("ファイルを送信できませんでした。時間をおいて再度お試しください。");
          return;
        }
      }

      const { data, error } = await supabase
        .from("comments")
        .insert({
          user_id: userId,
          post_id: post.id,
          content: trimmed,
          media_path: mediaPath,
          media_type: preparedMedia?.type ?? null,
        })
        .select()
        .single();

      if (error) {
        console.error(error);

        // メッセージが登録できなかったファイルは残さない
        if (mediaPath) {
          await removeChatMedia(mediaPath);
        }

        setErrorMessage("送信できませんでした。時間をおいて再度お試しください。");
        return;
      }

      // 自分の送信分は返り値で追加する
      const added = data as Comment;
      setComments((current) => appendComment(current, added));
      loadAvatars([added.user_id]);

      if (added.media_path) {
        loadMediaUrls([added.media_path]);
      }

      setInput("");
      replaceAttachment(null);
    } finally {
      setSending(false);
    }
  };

  // 署名付きURLの期限切れなどで表示できないとき、1回だけURLを再発行する
  const handleMediaError = (path: string) => {
    if (retriedPathsRef.current.has(path)) return;

    retriedPathsRef.current.add(path);
    loadMediaUrls([path]);
  };

  // Enter で送信、Shift+Enter で改行
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  // メッセージ削除（自分のものだけ）
  const handleDeleteComment = async (target: Comment) => {
    setErrorMessage("");

    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", target.id);

    if (error) {
      console.error(error);
      setErrorMessage("削除できませんでした。");
      return;
    }

    // 行を先に消してからファイルを消す（失敗してもログのみ）
    if (target.media_path) {
      removeChatMedia(target.media_path);
    }

    setComments((current) =>
      current.filter((comment) => comment.id !== target.id)
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
          const mediaPath = comment.media_path;

          return (
            <div
              key={comment.id}
              className={`chat-message${isMine ? " chat-message--mine" : ""}`}
            >
              <UserAvatar
                userId={comment.user_id}
                avatarUrl={getAvatarUrl(avatarPaths[comment.user_id])}
                className="chat-message__avatar"
                href={`/profile/${comment.user_id}`}
                ariaLabel="プロフィールを見る"
              />

              <div className="chat-message__body">
                {comment.content && (
                  <p className="chat-message__text">{comment.content}</p>
                )}

                {mediaPath && comment.media_type && (
                  <ChatMedia
                    type={comment.media_type}
                    url={mediaUrls[mediaPath]}
                    onLoad={scrollToBottomIfSticky}
                    onError={() => handleMediaError(mediaPath)}
                  />
                )}

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
                      onClick={() => handleDeleteComment(comment)}
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
        {processing && (
          <p className="chat-room__processing">画像を処理中...</p>
        )}

        {/* 送信前のプレビュー */}
        {preparedMedia && previewUrl && (
          <div className="chat-room__preview">
            <ChatMedia type={preparedMedia.type} url={previewUrl} />

            <button
              type="button"
              className="chat-room__preview-remove"
              onClick={() => replaceAttachment(null)}
              disabled={sending}
            >
              取り消す
            </button>
          </div>
        )}

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

        <input
          ref={fileInputRef}
          type="file"
          accept={CHAT_MEDIA_ACCEPT}
          onChange={handleFileChange}
          hidden
        />

        <div className="chat-room__form-footer">
          <div className="chat-room__form-actions">
            <button
              type="button"
              className="chat-room__attach"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || processing}
            >
              画像・動画
            </button>

            <span className="chat-room__count">
              {input.length}/{MAX_LENGTH}
            </span>
          </div>

          <button
            type="submit"
            className="chat-room__button"
            disabled={!canSend}
          >
            {sending ? "送信中..." : "送信"}
          </button>
        </div>
      </form>
    </section>
  );
}
