
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type Tag = {
  id: number;
  name: string;
};

export default function PostPage() {
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const router = useRouter();

  // タグ一覧を取得
  useEffect(() => {
    const getTags = async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("id, name")
        .order("id");

      if (error) {
        alert("タグの取得に失敗しました: " + error.message);
        setLoading(false);
        return;
      }

      setTags(data ?? []);
      setLoading(false);
    };

    getTags();
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
    if (!content.trim()) {
      alert("投稿内容を入力してください");
      return;
    }

    // ログインユーザー取得
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("ログインしてください");
      return;
    }

    // 投稿を保存
    const { data: post, error: postError } = await supabase
      .from("posts")
      .insert({
        user_id: user.id,
        content: content.trim(),
      })
      .select("id")
      .single();

    if (postError || !post) {
      alert(postError?.message ?? "投稿に失敗しました");
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
        alert(
          "投稿は保存されましたが、タグの保存に失敗しました: " +
            tagError.message
        );
        router.push("/");
        return;
      }
    }

    alert("投稿しました");
    router.push("/");
  };

  return (
    <main>
      <h1>投稿作成</h1>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="今の気持ちを書いてみよう..."
        rows={5}
      />

      <h2>タグ</h2>

      {loading ? (
        <p>タグを読み込み中...</p>
      ) : tags.length === 0 ? (
        <p>利用できるタグがありません。</p>
      ) : (
        <div>
          {tags.map((tag) => (
            <label key={tag.id} style={{ marginRight: "12px" }}>
              <input
                type="checkbox"
                checked={selectedTagIds.includes(tag.id)}
                onChange={() => handleTagChange(tag.id)}
              />
              {tag.name}
            </label>
          ))}
        </div>
      )}

      <br />

      <button onClick={handlePost} disabled={loading}>
        投稿
      </button>
    </main>
  );
}
