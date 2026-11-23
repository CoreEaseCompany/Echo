// プロフィールアイコン画像（Storage 公開バケット avatars）の加工・アップロード・URL・削除

import { supabase } from "@/lib/supabase";

export const AVATAR_BUCKET = "avatars";

// 保存する画像の一辺（px）
const AVATAR_SIZE = 256;
const OUTPUT_MIME = "image/jpeg";
const OUTPUT_QUALITY = 0.9;
// 透過画像を JPEG にしたとき黒くならないよう塗る背景色
const BACKGROUND_COLOR = "#ffffff";

const INPUT_MAX_BYTES = 10 * 1024 * 1024;
const INPUT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

// file input の accept 属性用
export const AVATAR_ACCEPT = INPUT_MIME_TYPES.join(",");

// 中央を正方形に切り抜いて 256px の JPEG にする
// Canvas で描き直すため、EXIF（位置情報・撮影日時など）は引き継がれない
export async function prepareAvatarImage(
  file: File
): Promise<{ blob: Blob } | { error: string }> {
  if (!INPUT_MIME_TYPES.includes(file.type)) {
    return { error: "JPEG・PNG・WebP の画像を選択してください。" };
  }

  if (file.size > INPUT_MAX_BYTES) {
    return { error: "画像は10MBまで選択できます。" };
  }

  try {
    return { blob: await cropAndEncode(file) };
  } catch (error) {
    // 元画像はアップロードしない
    console.error(error);
    return { error: "画像を処理できませんでした。別の画像をお試しください。" };
  }
}

async function cropAndEncode(file: File): Promise<Blob> {
  // EXIF の向きを反映した状態でピクセルを取得する
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  try {
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context is not available");
    }

    context.fillStyle = BACKGROUND_COLOR;
    context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);

    // 短辺を一辺とする中央の正方形を切り抜く
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    context.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, OUTPUT_MIME, OUTPUT_QUALITY)
    );

    if (!blob || blob.type !== OUTPUT_MIME) {
      throw new Error(`Failed to encode image as ${OUTPUT_MIME}`);
    }

    return blob;
  } finally {
    bitmap.close();
  }
}

// Storage にアップロードし、保存したパスを返す（失敗時は throw）
export async function uploadAvatar(userId: string, blob: Blob): Promise<string> {
  // DB の profiles_avatar_path_owner_check と同じ形式にする
  // 公開URLのキャッシュで古い画像が残らないよう、毎回新しいファイル名にする
  const path = `${userId}/${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, {
      contentType: OUTPUT_MIME,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return path;
}

// パスから公開URLを組み立てる（通信なし）
export function getAvatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;

  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Storage からファイルを削除する（失敗はログのみ）
export async function removeAvatar(path: string): Promise<void> {
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);

  if (error) {
    console.error(error);
  }
}
