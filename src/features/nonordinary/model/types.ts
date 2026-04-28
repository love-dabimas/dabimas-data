import type { HorseRecord } from "@/features/horses/model/types";

export type NonordinaryTacticValue =
  | "none"
  | "nige"
  | "senko"
  | "sashi"
  | "oikomi";

export type NonordinaryGoingValue =
  | "none"
  | "良"
  | "稍重"
  | "重"
  | "不良";

export type NonordinaryWeatherValue =
  | "none"
  | "晴"
  | "曇"
  | "雨"
  | "雪";

export interface NonordinarySearchInput {
  race_id: string | null;
  tactics: NonordinaryTacticValue[];
  going: NonordinaryGoingValue[];
  weather: NonordinaryWeatherValue[];
}

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

export interface RaceFilterOption {
  sort_order: number;
  race_id: string | null;
  race_name: string;
  is_all: boolean;
}

export interface RaceRow {
  race_id: string;
  race_name: string;
  racecourse: string | null;
  surface: "芝" | "ダート" | string | null;
  distance: number | null;
  raw_course: string | null;
  source_url: string | null;
}

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

export interface StallionRow {
  stallion_id: string;
  stallion_name: string;
  url: string;
  source: string;
}

export interface AbilityStallionRow {
  ability_id: string;
  stallion_id: string;
  stallion_name?: string;
  source: string;
  verified_by_stallion_page: boolean | null;
}

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

export interface AbilityEffectRow {
  effect_id: string;
  detail_id: string;
  effect_no: number;
  effect_raw: string;
  requires_group_nos: number[];
}

export interface ConditionGroupRow {
  group_id?: string;
  condition_group_id?: string;
  detail_id: string;
  group_no: number;
  group_label: string;
  group_raw: string;
}

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

export interface ParseWarningRow {
  ability_id: string;
  detail_id: string | null;
  raw: string;
  message: string;
}

export interface MatchedNonordinaryDetail {
  detail_id: string;
  detail_label: string;
  effect_raw: string | null;
  condition_raw: string | null;
  probability_percent: number | null;
}

export interface MatchedSourceStallion {
  stallion_id: string;
  stallion_name: string;
  horse: HorseRecord | null;
}

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
