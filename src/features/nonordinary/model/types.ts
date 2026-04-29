// このファイルは「非凡な才能」の検索機能に必要なデータの形（型）をまとめたもの。
// レース・馬場・天候・脚質などの条件指定に使う型と、
// サーバーから受け取るデータのまとまり（バンドル）の型が定義されている。

import type { HorseRecord } from "@/features/horses/model/types";

// 脚質の選択肢。"none" は「条件指定なし」を表す。
export type NonordinaryTacticValue =
  | "none"
  | "nige"
  | "senko"
  | "sashi"
  | "oikomi";

// 馬場状態の選択肢。"none" は「条件指定なし」を表す。
export type NonordinaryGoingValue =
  | "none"
  | "良"
  | "稍重"
  | "重"
  | "不良";

// 天候の選択肢。"none" は「条件指定なし」を表す。
export type NonordinaryWeatherValue =
  | "none"
  | "晴"
  | "曇"
  | "雨"
  | "雪";

// 非凡検索モーダルでユーザーが選んだ条件をまとめたもの。
// race_id が null の場合はレース指定なし（すべて）を意味する。
export interface NonordinarySearchInput {
  race_id: string | null;
  tactics: NonordinaryTacticValue[];
  going: NonordinaryGoingValue[];
  weather: NonordinaryWeatherValue[];
}

// ウェブサイトから取ってきた「非凡な才能」データを全部まとめたもの。
// 才能・種牡馬・発揮条件・発揮効果・条件ルールなどがテーブル形式で入っている。
export interface NonordinaryBundle {
  meta: {
    schema_version: string;
    generated_at: string;
    source: string;
    source_policy: string;
    ability_type: string;
  };
  race_filter_options: RaceFilterOption[];
  races: RaceRow[];
  abilities: AbilityRow[];
  stallions: StallionRow[];
  ability_stallions: AbilityStallionRow[];
  ability_details: AbilityDetailRow[];
  ability_effects: AbilityEffectRow[];
  condition_groups: ConditionGroupRow[];
  condition_rules: ConditionRuleRow[];
  parse_warnings: ParseWarningRow[];
}

// 非凡検索のレース絞り込みプルダウンに表示する 1 件分の選択肢。
export interface RaceFilterOption {
  sort_order: number;
  race_id: string | null;
  race_name: string;
  is_all: boolean;
}

// 1 レースぶんの情報（名前・競馬場・コース・距離など）。
export interface RaceRow {
  race_id: string;
  race_name: string;
  racecourse: string | null;
  surface: "芝" | "ダート" | string | null;
  distance: number | null;
  raw_course: string | null;
  source_url: string | null;
}

// 1 つの非凡な才能の基本情報（名前・説明・URL など）。
export interface AbilityRow {
  ability_id: string;
  ability_name: string;
  kana: string | null;
  ability_type: string;
  description: string | null;
  url: string;
  source_url?: string;
  source_status: string;
  raw_text_hash: string | null;
}

// 非凡な才能を持つ種牡馬の 1 件ぶんの情報。
export interface StallionRow {
  stallion_id: string;
  stallion_name: string;
  url: string;
  source: string;
}

// 「どの才能をどの種牡馬が持つか」を示す中間テーブルの 1 件。
export interface AbilityStallionRow {
  ability_id: string;
  stallion_id: string;
  stallion_name?: string;
  source: string;
  verified_by_stallion_page: boolean | null;
}

// 才能の「才能詳細」1 件ぶん。発揮効果・発揮条件・対象・確率の生テキストが入る。
// 1 つの才能が複数の条件パターンを持つ場合は複数行になる。
export interface AbilityDetailRow {
  detail_id: string;
  ability_id: string;
  detail_index?: number;
  detail_order?: number;
  detail_label: string;
  effect_raw: string | null;
  condition_raw: string | null;
  target_raw: string | null;
  probability_raw: string | null;
  probability_percent: number | null;
}

// 才能の発揮効果 1 件。複数の効果がある才能のために配列で持つ。
export interface AbilityEffectRow {
  effect_id: string;
  detail_id: string;
  effect_no: number;
  effect_raw: string;
  requires_group_nos: number[];
}

// 発揮条件をまとめるグループ。1 つの才能詳細に対して 1 グループが対応する。
export interface ConditionGroupRow {
  group_id?: string;
  condition_group_id?: string;
  detail_id: string;
  group_no: number;
  group_label: string;
  group_raw: string;
}

// 発揮条件の 1 ルール。競馬場・馬場・天候・脚質・距離などを「field」と「operator」で表現する。
export interface ConditionRuleRow {
  rule_id: string;
  ability_id: string;
  detail_id: string;
  group_id?: string;
  condition_group_id?: string;
  group_no?: number;
  field: string;
  operator?: string;
  op?: string;
  value_text: string | null;
  value_number?: number | null;
  value_num?: number | null;
  min_number?: number | null;
  min_num?: number | null;
  max_number?: number | null;
  max_num?: number | null;
  raw_text?: string;
  raw?: string;
  parse_status?: "parsed" | "raw_only" | "warning" | string;
}

// データの解析中に「うまく読み取れなかった」部分を記録する警告。
export interface ParseWarningRow {
  ability_id: string;
  detail_id: string | null;
  raw: string;
  message: string;
}

// 検索条件に一致した「才能詳細」の 1 件。検索結果カードに表示される情報を含む。
export interface MatchedNonordinaryDetail {
  detail_id: string;
  detail_label: string;
  effect_raw: string | null;
  condition_raw: string | null;
  probability_percent: number | null;
}

// 才能を持つ種牡馬の 1 件。horse が null の場合は horselist に未登録の馬を表す。
export interface MatchedSourceStallion {
  stallion_id: string;
  stallion_name: string;
  horse: HorseRecord | null;
}

// 検索条件にヒットした「非凡な才能」1 件ぶんの表示用データ。
// 才能名・説明・一致した条件詳細・対応する種牡馬・警告メッセージが入る。
export interface MatchedNonordinaryAbility {
  ability_id: string;
  ability_name: string;
  kana: string | null;
  description: string | null;
  source_url: string;
  matched_details: MatchedNonordinaryDetail[];
  source_stallion_ids: string[];
  source_stallions: MatchedSourceStallion[];
  warnings: string[];
}
