// このファイルは、埋め込まれたダビ娘と親（ダビふぁく）の間でやり取りするメッセージの形を決める。
// やり取りは window.postMessage だけで行い、ダビ娘はダビふぁくの保存データ（IndexedDB）には触らない。
// 仕様はダビふぁく側の docs/dabimusume-integration-design.md の §4 と同じ。

import type { GenderTab } from "@/features/horses/model/types";

// メッセージの形を変えるときに、親と子で食い違いに気づけるよう版番号を付ける。
export const EMBED_PROTOCOL_VERSION = 1;

// ダビ娘 → 親
export type MessageToParent =
  | { type: "dabimas:hello"; v: number; mode: "embed" | "picker" }
  | { type: "dabimas:favorite-toggle"; v: number; horseId: string; gender: GenderTab }
  | { type: "dabimas:favorites-only"; v: number; value: boolean }
  | { type: "dabimas:select"; v: number; horseId: string; gender: GenderTab; name: string };

// 親 → ダビ娘
export type MessageFromParent =
  | {
      type: "dabimas:favorites";
      v: number;
      // ❤ を付けてよい馬（ダビふぁくのデータにいる馬）のキー。最初の返事にだけ付く。
      supportedKeys?: string[];
      favoriteKeys?: string[];
      favoritesOnly?: boolean;
    }
  | { type: "dabimas:reset-pick"; v: number };

// 型の中から type と v を除いた「中身」だけを受け取り、送るときに付け足す。
type WithoutEnvelope<T> = T extends unknown ? Omit<T, "v"> : never;

export const postToParent = (message: WithoutEnvelope<MessageToParent>) => {
  window.parent.postMessage({ ...message, v: EMBED_PROTOCOL_VERSION }, window.location.origin);
};

// 親から来たメッセージだけを取り出す。同じオリジンの親以外から来たもの、知らない type は無視する。
export const readMessageFromParent = (event: MessageEvent): MessageFromParent | null => {
  if (event.origin !== window.location.origin || event.source !== window.parent) {
    return null;
  }

  const data: unknown = event.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const type = (data as { type?: unknown }).type;
  if (type === "dabimas:favorites" || type === "dabimas:reset-pick") {
    return data as MessageFromParent;
  }

  return null;
};
