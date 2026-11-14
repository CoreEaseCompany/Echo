// ユーザーIDから色を決める（DBには保存しない）
// 同じユーザーIDは常に同じ色になる。
export function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }

  const hue = hash % 360;
  return `hsl(${hue} 60% 45%)`;
}
