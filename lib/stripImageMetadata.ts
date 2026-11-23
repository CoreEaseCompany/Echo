// 画像を Canvas で再エンコードし、EXIF などのメタデータ（位置情報・撮影日時・カメラ情報）を取り除く

// 入力 MIME → 出力品質（undefined は可逆形式のため指定なし）
const OUTPUT_QUALITY: Record<string, number | undefined> = {
  "image/jpeg": 0.9,
  "image/png": undefined,
  "image/webp": 0.9,
};

export async function stripImageMetadata(file: File): Promise<Blob> {
  if (!(file.type in OUTPUT_QUALITY)) {
    throw new Error(`Unsupported image type: ${file.type}`);
  }

  // EXIF の向きを反映した状態でピクセルを取得する（Orientation タグが消えても向きが崩れない）
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context is not available");
    }

    // 透過を維持するため背景は塗らない
    context.drawImage(bitmap, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type, OUTPUT_QUALITY[file.type])
    );

    // 指定形式で出力できないブラウザ（WebP 非対応など）は別形式で返すため、エラーにする
    if (!blob || blob.type !== file.type) {
      throw new Error(`Failed to encode image as ${file.type}`);
    }

    return blob;
  } finally {
    bitmap.close();
  }
}
