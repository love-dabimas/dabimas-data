// このファイルは、埋め込まれているときだけ使う状態をまとめて持つ。
// お気に入りの正本は親（ダビふぁく）にあり、ここに置くのは親から配られた写し。
// 馬選択のときに「今選んでいる馬」もここで持つ（確定するまでは親に知らせない）。

import { create } from "zustand";
import type { HorseRecord } from "@/features/horses/model/types";
import { horseKeyOf } from "@/features/embed/model/embedMode";
import { postToParent } from "@/features/embed/model/messages";

interface EmbedState {
  // ❤ を付けてよい馬のキー。親から届くまでは null で、その間は ❤ を出さない。
  supportedKeys: Set<string> | null;
  favoriteKeys: Set<string>;
  // 「お気に入りのみ」。ダビふぁくの馬選択ダイアログ・PC の入力欄と共通の 1 つの設定。
  favoritesOnly: boolean;
  pickedHorse: HorseRecord | null;
  setFavoritesOnly: (value: boolean) => void;
  // 同じ馬をもう一度タップしたら選択を外し、別の馬なら選択を移す。
  togglePick: (horse: HorseRecord) => void;
  clearPick: () => void;
}

export const useEmbedStore = create<EmbedState>((set) => ({
  supportedKeys: null,
  favoriteKeys: new Set<string>(),
  favoritesOnly: false,
  pickedHorse: null,
  setFavoritesOnly: (value) => {
    // 押した手応えが遅れないよう先に画面へ反映し、親には保存と他の画面への反映を頼む。
    // 親から配り直された値が届いたら、そちらで上書きされる。
    set({ favoritesOnly: value });
    postToParent({ type: "dabimas:favorites-only", value });
  },
  togglePick: (horse) =>
    set((state) => ({
      pickedHorse:
        state.pickedHorse && horseKeyOf(state.pickedHorse) === horseKeyOf(horse) ? null : horse
    })),
  clearPick: () => set({ pickedHorse: null })
}));
