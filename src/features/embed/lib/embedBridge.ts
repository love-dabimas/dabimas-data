// このファイルは、埋め込まれたダビ娘と親（ダビふぁく）をつなぐ窓口。
// 親から届くメッセージを受け取ってストアに反映し、ダビ娘からのお願いを親へ送る。

import type { HorseRecord } from "@/features/horses/model/types";
import { IS_EMBEDDED, IS_PICKER, horseKeyOf } from "@/features/embed/model/embedMode";
import { postToParent, readMessageFromParent } from "@/features/embed/model/messages";
import { useEmbedStore } from "@/features/embed/store/useEmbedStore";

import { buildCustomHorseRecord } from "./buildCustomHorseRecord";

let started = false;
let candidatesSent = false;

// StrictMode の再マウントでも、マスター候補の送信は一度だけ。
export const announceCandidates = (horses: HorseRecord[]) => {
  if (!IS_EMBEDDED || candidatesSent) return;
  candidatesSent = true;
  postToParent({ type: "dabimas:candidates", rows: horses
    .filter((horse) => !horse.HorseId.startsWith("ch_"))
    .map((horse) => [horseKeyOf(horse), horse.Paternal_t, horse.Paternal_ht,
      horse.Paternal_jik, horse.Paternal_mig]) });
};

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

    if (message.type === "dabimas:custom-horses") {
      const customHorses = message.horses.map(buildCustomHorseRecord);
      useEmbedStore.setState((state) => ({
        customHorses,
        pickedHorse: state.pickedHorse?.HorseId.startsWith("ch_")
          ? customHorses.find((horse) => horseKeyOf(horse) === horseKeyOf(state.pickedHorse!)) ?? null
          : state.pickedHorse
      }));
      return;
    }
    if (message.type === "dabimas:theory-map") {
      useEmbedStore.getState().receiveTheoryMap(message);
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
