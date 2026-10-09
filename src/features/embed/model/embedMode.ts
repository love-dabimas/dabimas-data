// このファイルは、ダビ娘がダビふぁくの中に iframe で埋め込まれているかどうかと、
// 埋め込まれているときの動き方（単体画面 / 馬選択）を URL から読み取る。
// 埋め込みの見た目と動きは、ここで決まったモードのときだけ有効になり、
// ダビ娘を普通に開いたときの見た目と動きは今までと変わらない。
//
//   ?embed=1               … ダビふぁくのホームから開く単体画面（カードに ❤、「お気に入りのみ」）
//   ?picker=1&sex=0|1|any  … ダビふぁくの馬選択の「条件で探す」から開く（上に加えて、カードをタップして選ぶ）
//   &pedigree=open         … 血統表を最初から開く（どちらのモードにも付きうる）

import type { GenderTab, HorseRecord } from "@/features/horses/model/types";

export type EmbedMode = "none" | "embed" | "picker";
export type PickerSex = GenderTab | "any";

const params = new URLSearchParams(window.location.search);

// iframe の中でないとき（URL を直接開いたとき）は、クエリが付いていても今のダビ娘として動かす。
const isInFrame = window.parent !== window;

export const EMBED_MODE: EmbedMode = !isInFrame
  ? "none"
  : params.get("picker") === "1"
    ? "picker"
    : params.get("embed") === "1"
      ? "embed"
      : "none";

export const IS_EMBEDDED = EMBED_MODE !== "none";
export const IS_PICKER = EMBED_MODE === "picker";

// ?pedigree=open … 血統表を最初から開いた状態で出す。ダビふぁくの設定から付く。
// 既定（付かないとき）は畳む。血統表は1枚あたり15行あって、一覧を
// スクロールするときの重さの本体になっている。
export const PEDIGREE_OPEN = params.get("pedigree") === "open";

// 血統表を畳んで出すかどうか。カードの描画（HorseResultCard）と、
// 仮想スクロールの高さの見積もり（ResultsPanel）の両方が同じ値を見る。
// 別々に判定すると、片方だけ畳んだときに見積もりが実寸から大きく外れて
// スクロールがガタつく。
export const COLLAPSE_PEDIGREE = IS_EMBEDDED && !PEDIGREE_OPEN;

// 馬選択のとき、どちらの性別のセルから開かれたか。種牡馬・牝馬のタブを先に選んでおくのに使う。
export const PICKER_SEX: PickerSex = (() => {
  const value = params.get("sex");
  return value === "0" || value === "1" ? value : "any";
})();

// ダビ娘の中で馬を見分けるキー。ダビふぁくの ID（s/b + HorseId）への変換は親（ダビふぁく）が行う。
export const horseKeyOf = (horse: Pick<HorseRecord, "HorseId" | "Gender">) =>
  `${horse.HorseId}-${horse.Gender}`;

// ゲーム内 ID（ゲーム本体が持つ番号）で作るキー。採取や全書の更新のタイミングに
// 左右されないので、両アプリで最も安定して一致する。
export const gameKeyOf = (horse: Pick<HorseRecord, "card" | "Gender">) => {
  const gameId = horse.card?.sourceGameId;
  return gameId ? `g${gameId}-${horse.Gender}` : null;
};

// 親（ダビふぁく）が持っているかを調べるときに使うキーの一覧。
// 1. ゲーム内 ID のキー（親が対応していれば最優先で当たる）
// 2. いまの HorseId
// 3. 以前の HorseId（legacy_ids）。R2 を正本にした時点で採番が変わった馬は、
//    親側がまだ古い ID で持っているので、これが無いと ❤ が出ない。
export const matchKeysOf = (
  horse: Pick<HorseRecord, "HorseId" | "Gender" | "legacy_ids" | "card">
): string[] => [
  gameKeyOf(horse),
  horseKeyOf(horse),
  ...(horse.legacy_ids ?? []).map((id) => `${id}-${horse.Gender}`),
].filter((key): key is string => key !== null);

// 親が知っているキーのうち、最初に当たったものを返す（無ければ null）。
export const matchedKeyIn = (
  supportedKeys: Set<string>,
  horse: Pick<HorseRecord, "HorseId" | "Gender" | "legacy_ids" | "card">
): string | null => matchKeysOf(horse).find((key) => supportedKeys.has(key)) ?? null;

// 埋め込み用のスタイル（src/styles/embed.css）を効かせるため、<html> にモードのクラスを付ける。
export const applyEmbedModeClass = () => {
  if (!IS_EMBEDDED) {
    return;
  }

  document.documentElement.classList.add("embed-mode");
  if (IS_PICKER) {
    document.documentElement.classList.add("embed-mode--picker");
  }
};
