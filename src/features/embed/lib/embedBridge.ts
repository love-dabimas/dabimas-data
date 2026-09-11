// このファイルは、埋め込まれたダビ娘と親（ダビふぁく）をつなぐ窓口。
// 親から届くメッセージを受け取ってストアに反映し、ダビ娘からのお願いを親へ送る。

import type { HorseRecord } from "@/features/horses/model/types";
import { IS_EMBEDDED, IS_PICKER } from "@/features/embed/model/embedMode";
import { postToParent, readMessageFromParent } from "@/features/embed/model/messages";
import { useEmbedStore } from "@/features/embed/store/useEmbedStore";

let started = false;

// 起動時に 1 度だけ呼び、親からのメッセージの受け口を作る。
// 検索画面が出る前に作っておき、hello への返事を取りこぼさないようにする。
export const startEmbedBridge = () => {
  if (!IS_EMBEDDED || started) {
    return;
  }
  started = true;

  window.addEventListener("message", (event) => {
    const message = readMessageFromParent(event);
    if (!message) {
      return;
    }

    if (message.type === "dabimas:reset-pick") {
      // 親が別のセル用に開き直したとき・馬を入れ終わったときは、選んでいた馬を残さない。
      useEmbedStore.setState({ pickedHorse: null });
      return;
    }

    const next: Partial<ReturnType<typeof useEmbedStore.getState>> = {};
    if (Array.isArray(message.supportedKeys)) {
      next.supportedKeys = new Set(message.supportedKeys);
    }
    if (Array.isArray(message.favoriteKeys)) {
      next.favoriteKeys = new Set(message.favoriteKeys);
    }
    if (typeof message.favoritesOnly === "boolean") {
      next.favoritesOnly = message.favoritesOnly;
    }
    useEmbedStore.setState(next);
  });
};

// 検索画面が出たことを親に知らせる。親は ❤ を付けてよい馬と今のお気に入りを返してくる。
export const announceReady = () => {
  if (!IS_EMBEDDED) {
    return;
  }
  postToParent({ type: "dabimas:hello", mode: IS_PICKER ? "picker" : "embed" });
};

// ❤ の切り替えを親に頼む。正本は親にあるので、画面の点灯は親から配り直された値で行う。
export const requestFavoriteToggle = (horse: HorseRecord) => {
  postToParent({ type: "dabimas:favorite-toggle", horseId: horse.HorseId, gender: horse.Gender });
};

// 下部バーの「この馬を入れる」。セルに入れてよいかの判定と実際の反映は親が行う。
export const confirmPickedHorse = (horse: HorseRecord) => {
  postToParent({
    type: "dabimas:select",
    horseId: horse.HorseId,
    gender: horse.Gender,
    name: horse.card.name
  });
};
