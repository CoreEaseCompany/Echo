import { supabase } from "@/lib/supabase";
import type { Tag } from "@/lib/types";

// post_tags から結合取得した tags は、単体・配列・null のいずれでも返り得る
export type JoinedTags = Tag | Tag[] | null;

// タグ一覧を取得
export function fetchTags() {
  return supabase.from("tags").select("id, name").order("id");
}

// 結合取得した tags を配列にそろえる
export function normalizeTags(tags: JoinedTags): Tag[] {
  if (!tags) return [];

  return Array.isArray(tags) ? tags : [tags];
}
