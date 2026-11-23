// チャットの画像・動画（Storage バケット chat-media）の検証・アップロード・URL発行・削除

import { supabase } from "@/lib/supabase";
import { stripImageMetadata } from "@/lib/stripImageMetadata";
import type { ChatMediaType } from "@/lib/types";

export const CHAT_MEDIA_BUCKET = "chat-media";

// 署名付きURLの有効期限（秒）
const SIGNED_URL_EXPIRES_IN = 60 * 60;

const MB = 1024 * 1024;
const IMAGE_MAX_BYTES = 10 * MB;
const VIDEO_MAX_BYTES = 50 * MB;

type MediaRule = {
  type: ChatMediaType;
  ext: string;
  maxBytes: number;
  // true: Canvas で再エンコードしてメタデータを除去する
  strip: boolean;
};

const MEDIA_RULES: Record<string, MediaRule> = {
  "image/jpeg": { type: "image", ext: "jpg", maxBytes: IMAGE_MAX_BYTES, strip: true },
  "image/png": { type: "image", ext: "png", maxBytes: IMAGE_MAX_BYTES, strip: true },
  "image/webp": { type: "image", ext: "webp", maxBytes: IMAGE_MAX_BYTES, strip: true },
  "image/gif": { type: "image", ext: "gif", maxBytes: IMAGE_MAX_BYTES, strip: false },
  "video/mp4": { type: "video", ext: "mp4", maxBytes: VIDEO_MAX_BYTES, strip: false },
  "video/webm": { type: "video", ext: "webm", maxBytes: VIDEO_MAX_BYTES, strip: false },
  "video/quicktime": { type: "video", ext: "mov", maxBytes: VIDEO_MAX_BYTES, strip: false },
};

// file input の accept 属性用
export const CHAT_MEDIA_ACCEPT = Object.keys(MEDIA_RULES).join(",");

const SIZE_ERROR = "画像は10MB、動画は50MBまで送信できます。";

// アップロード可能な状態に整えたメディア
export type PreparedMedia = {
  blob: Blob;
  type: ChatMediaType;
  mime: string;
};

// 形式・サイズを検証し、JPEG / PNG / WebP はメタデータを除去する
export async function prepareChatMedia(
  file: File
): Promise<{ media: PreparedMedia } | { error: string }> {
  const rule = MEDIA_RULES[file.type];

  if (!rule) {
    return { error: "この形式のファイルは送信できません。" };
  }

  if (file.size > rule.maxBytes) {
    return { error: SIZE_ERROR };
  }

  if (!rule.strip) {
    return { media: { blob: file, type: rule.type, mime: file.type } };
  }

  let blob: Blob;

  try {
    blob = await stripImageMetadata(file);
  } catch (error) {
    // 元画像はアップロードしない
    console.error(error);
    return { error: "画像を処理できませんでした。別の画像をお試しください。" };
  }

  // 再エンコードでサイズが増えることがあるため再確認する
  if (blob.size > rule.maxBytes) {
    return { error: SIZE_ERROR };
  }

  return { media: { blob, type: rule.type, mime: blob.type } };
}

// Storage にアップロードし、保存したパスを返す（失敗時は throw）
export async function uploadChatMedia(
  userId: string,
  postId: number,
  media: PreparedMedia
): Promise<string> {
  const rule = MEDIA_RULES[media.mime];

  if (!rule) {
    throw new Error(`Unsupported media type: ${media.mime}`);
  }

  // DB の comments_media_path_owner_check と同じ形式にする
  const path = `${userId}/${postId}/${crypto.randomUUID()}.${rule.ext}`;

  const { error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(path, media.blob, {
      contentType: media.mime,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return path;
}

// パスごとの署名付きURLをまとめて発行する（失敗時は空のオブジェクト）
export async function createChatMediaUrls(
  paths: string[]
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_EXPIRES_IN);

  if (error) {
    console.error(error);
    return {};
  }

  const urls: Record<string, string> = {};

  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) {
      urls[item.path] = item.signedUrl;
    }
  }

  return urls;
}

// Storage からファイルを削除する（失敗はログのみ）
export async function removeChatMedia(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .remove([path]);

  if (error) {
    console.error(error);
  }
}
