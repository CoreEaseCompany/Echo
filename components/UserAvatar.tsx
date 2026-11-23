"use client";

import { useState } from "react";
import Link from "next/link";
import { getUserColor } from "@/lib/userColor";

type UserAvatarProps = {
  userId: string;
  // 表示する画像のURL（未設定なら色アイコン）
  avatarUrl?: string | null;
  className: string;
  // 指定するとリンクとして表示する
  href?: string;
  ariaLabel?: string;
};

// アイコン画像、または画像がない・読み込めないときはユーザーIDから決まる色で表示する
export default function UserAvatar({
  userId,
  avatarUrl,
  className,
  href,
  ariaLabel,
}: UserAvatarProps) {
  // 読み込みに失敗したURL（URLが変われば再表示する）
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const style = { backgroundColor: getUserColor(userId) };
  const showImage = avatarUrl && avatarUrl !== failedUrl;

  const image = showImage ? (
    // ユーザーがアップロードした画像のため next/image は使わない
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="user-avatar__image"
      src={avatarUrl}
      alt=""
      loading="lazy"
      onError={() => setFailedUrl(avatarUrl)}
    />
  ) : null;

  if (href) {
    return (
      <Link
        href={href}
        prefetch={false}
        className={className}
        style={style}
        aria-label={ariaLabel}
      >
        {image}
      </Link>
    );
  }

  return (
    <div className={className} style={style} aria-hidden="true">
      {image}
    </div>
  );
}
