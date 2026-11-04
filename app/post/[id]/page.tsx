
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Tag = {
  id: number;
  name: string;
};

type Post = {
  id: number;
  user_id: string;
  content: string;
  created_at: string;
  empathies: {
    id: number;
    user_id: string;
  }[];
};

type Comment = {
  id: number;
  user_id: string;
  content: string;
  created_at: string;
};

type Profile = {
  user_id: string;
  username: string | null;
};

export default function PostDetail() {
  const params = useParams();
  const id = params.id as string;

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [commentContent, setCommentContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    const getData = async () => {
      // ログインユーザーを取得
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setUserId(user.id);
      }

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
        .eq("id", Number(id))
        .single();

      if (postError) {
        console.error(postError);
        setLoading(false);
        return;
      }

      setPost(postData);

      // 投稿に紐づくタグを取得
      const { data: tagData, error: tagError } = await supabase
        .from("post_tags")
        .select("tags(id, name)")
        .eq("post_id", Number(id));

      if (tagError) {
        console.error(tagError);
      } else {
        const fetchedTags = (
          (tagData ?? []) as unknown as {
            tags: Tag | Tag[] | null;
          }[]
        ).flatMap((item) =>
          Array.isArray(item.tags) ? item.tags : item.tags ? [item.tags] : []
        );

        setTags(fetchedTags);
      }

      // コメントを取得
      const { data: commentData, error: commentError } =
        await supabase
          .from("comments")
          .select("*")
          .eq("post_id", Number(id))
          .order("created_at", { ascending: true });

      if (commentError) {
        console.error(commentError);
      } else {
        setComments(commentData ?? []);
      }

      // 投稿者とコメント投稿者のIDをまとめる
      const userIds = [
        ...new Set([
          postData.user_id,
          ...(commentData ?? []).map((comment) => comment.user_id),
        ]),
      ];

      // プロフィールを取得
      const { data: profileData, error: profileError } =
        await supabase
          .from("profiles")
          .select("user_id, username")
          .in("user_id", userIds);

      if (profileError) {
        console.error(profileError);
      } else {
        setProfiles(profileData ?? []);
      }

      setLoading(false);
    };

    getData();
  }, [id]);

  // 共感済みかどうか
  const hasEmpathy =
    post?.empathies.some(
      (empathy) => empathy.user_id === userId
    ) ?? false;

  // 共感ボタン
  const handleEmpathy = async () => {
    if (!userId) {
      alert("ログインしてください");
      return;
    }

    if (!post) return;

    if (hasEmpathy) {
      const { error } = await supabase
        .from("empathies")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", userId);

      if (error) {
        alert(error.message);
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
        alert(error.message);
        return;
      }

      setPost({
        ...post,
        empathies: [...post.empathies, data],
      });
    }
  };

  // コメント投稿
  const handleComment = async () => {
    if (!userId) {
      alert("ログインしてください");
      return;
    }

    if (!commentContent.trim() || !post) {
      alert("コメントを入力してください");
      return;
    }

    const { data, error } = await supabase
      .from("comments")
      .insert({
        user_id: userId,
        post_id: post.id,
        content: commentContent.trim(),
      })
      .select()
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    setComments((current) => [...current, data]);

    // 自分のプロフィールが未取得なら取得
    if (!profiles.some((profile) => profile.user_id === userId)) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("user_id, username")
        .eq("user_id", userId)
        .maybeSingle();

      if (profileData) {
        setProfiles((current) => [...current, profileData]);
      }
    }

    setCommentContent("");
  };

  // コメント削除
  const handleDeleteComment = async (commentId: number) => {
    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId);

    if (error) {
      alert(error.message);
      return;
    }

    setComments((current) =>
      current.filter((comment) => comment.id !== commentId)
    );
  };

  if (loading) {
    return <p>読み込み中...</p>;
  }

  if (!post) {
    return <p>投稿が見つかりません。</p>;
  }

  // ユーザーIDからユーザー名を取得する関数
  const getUsername = (targetUserId: string) => {
    return (
      profiles.find(
        (profile) => profile.user_id === targetUserId
      )?.username || "名前未設定"
    );
  };

  return (
    <main>
      <h1>投稿詳細</h1>

      {/* 投稿者情報 */}
      <p>
        投稿者：
        <Link href={`/profile/${post.user_id}`}>
          {getUsername(post.user_id)}
        </Link>
      </p>

      {/* 投稿内容 */}
      <p>{post.content}</p>

      {/* タグ表示 */}
      {tags.length > 0 && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {tags.map((tag) => (
            <span
              key={tag.id}
              style={{
                backgroundColor: "#e5e7eb",
                color: "#374151",
                padding: "4px 10px",
                borderRadius: "16px",
                fontSize: "12px",
              }}
            >
              #{tag.name}
            </span>
          ))}
        </div>
      )}

      {/* 投稿日時 */}
      <p>{new Date(post.created_at).toLocaleString("ja-JP")}</p>

      {/* 共感数 */}
      <p>共感数：{post.empathies.length}</p>

      {/* 共感ボタン */}
      <button onClick={handleEmpathy}>
        {hasEmpathy ? "共感を取り消す" : "共感する"}
      </button>

      {/* コメント */}
      <h2>コメント</h2>

      {comments.length === 0 ? (
        <p>まだコメントはありません。</p>
      ) : (
        comments.map((comment) => (
          <div key={comment.id}>
            <p>
              <Link href={`/profile/${comment.user_id}`}>
                {getUsername(comment.user_id)}
              </Link>
            </p>

            <p>{comment.content}</p>

            <small>
              {new Date(comment.created_at).toLocaleString("ja-JP")}
            </small>

            {comment.user_id === userId && (
              <button onClick={() => handleDeleteComment(comment.id)}>
                削除
              </button>
            )}

            <hr />
          </div>
        ))
      )}

      {/* コメント入力 */}
      <div>
        <textarea
          value={commentContent}
          onChange={(e) => setCommentContent(e.target.value)}
          placeholder="コメントを入力してください"
        />

        <button onClick={handleComment}>
          コメントする
        </button>
      </div>

      <Link href="/">
        ← 投稿一覧へ戻る
      </Link>
    </main>
  );
}
