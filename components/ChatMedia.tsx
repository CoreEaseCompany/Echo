import type { ChatMediaType } from "@/lib/types";

type ChatMediaProps = {
  type: ChatMediaType;
  // 未発行のときは読み込み中を表示する
  url?: string;
  onLoad?: () => void;
  onError?: () => void;
};

// チャットの画像・動画を表示する（送信前のプレビューでも使用）
export default function ChatMedia({ type, url, onLoad, onError }: ChatMediaProps) {
  if (!url) {
    return (
      <div className="chat-message__media chat-message__media--loading">
        読み込み中...
      </div>
    );
  }

  if (type === "video") {
    return (
      <video
        className="chat-message__media"
        src={url}
        controls
        preload="metadata"
        playsInline
        onLoadedMetadata={onLoad}
        onError={onError}
      />
    );
  }

  return (
    // 署名付きURLは期限付きで毎回変わり、画像サイズも不明なため next/image は使わない
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="chat-message__media"
      src={url}
      alt="添付画像"
      loading="lazy"
      onLoad={onLoad}
      onError={onError}
    />
  );
}
