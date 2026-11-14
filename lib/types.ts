// アプリ全体で共有するデータ型

export type Tag = {
  id: number;
  name: string;
};

export type Post = {
  id: number;
  user_id: string;
  content: string;
  created_at: string;
};

export type Profile = {
  user_id: string;
  username: string | null;
  bio: string | null;
};

export type Comment = {
  id: number;
  user_id: string;
  content: string;
  created_at: string;
};

export type Empathy = {
  id: number;
  user_id: string;
};
