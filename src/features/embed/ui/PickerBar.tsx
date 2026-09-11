// このファイルは、馬選択のときに画面下に出す確定バー。
// カードをタップして選んだ馬の名前を出し、「この馬を入れる」で親（ダビふぁく）に知らせる。
// 名前をバーに出すのは、どの馬を入れようとしているかを確定の直前にもう一度見せるため。

import type { HorseRecord } from "@/features/horses/model/types";

interface PickerBarProps {
  horse: HorseRecord;
  onCancel: () => void;
  onConfirm: () => void;
}

export const PickerBar = ({ horse, onCancel, onConfirm }: PickerBarProps) => (
  <div className="picker-bar" role="region" aria-label="選択中の馬">
    <span className="picker-bar__name">{horse.card.name}</span>
    <button type="button" className="picker-bar__cancel" onClick={onCancel}>
      やめる
    </button>
    <button type="button" className="picker-bar__confirm" onClick={onConfirm}>
      この馬を入れる
    </button>
  </div>
);
