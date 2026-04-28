import type { HorseRecord } from "@/features/horses/model/types";
import type {
  AbilityDetailRow,
  ConditionRuleRow,
  MatchedNonordinaryAbility,
  NonordinaryBundle,
  NonordinarySearchInput,
  RaceRow
} from "@/features/nonordinary/model/types";

const TACTIC_LABEL_BY_VALUE: Record<string, string> = {
  nige: "逃げ",
  senko: "先行",
  sashi: "差し",
  oikomi: "追込"
};

const SEARCH_FIELDS = ["tactic", "going", "weather"] as const;
const RACE_FIELDS = ["race_name", "racecourse", "surface", "distance"] as const;

type SearchField = (typeof SEARCH_FIELDS)[number];
type RaceField = (typeof RACE_FIELDS)[number];

interface SearchContext {
  race_id: string | null;
  race_name: string | null;
  racecourse: string | null;
  surface: string | null;
  distance: number | null;
  tactic: string[];
  going: string[];
  weather: string[];
}

const normalizeField = (field: string) => {
  if (field === "course") {
    return "racecourse";
  }
  if (field === "track_condition") {
    return "going";
  }
  return field;
};

const normalizeRacecourse = (value: string) => value.replace(/競馬場$/u, "");

const normalizeComparableText = (field: string, value: string) =>
  normalizeField(field) === "racecourse" ? normalizeRacecourse(value) : value;

const getOperator = (rule: ConditionRuleRow) => rule.operator ?? rule.op ?? "raw";
const getValueNumber = (rule: ConditionRuleRow) => rule.value_number ?? rule.value_num ?? null;
const getMinNumber = (rule: ConditionRuleRow) => rule.min_number ?? rule.min_num ?? null;
const getMaxNumber = (rule: ConditionRuleRow) => rule.max_number ?? rule.max_num ?? null;

const unique = <T,>(values: T[]) => [...new Set(values)];

const indexBy = <T, K extends string>(
  values: T[],
  getKey: (value: T) => K
) => {
  const map = new Map<K, T>();
  values.forEach((value) => map.set(getKey(value), value));
  return map;
};

const groupBy = <T, K extends string>(
  values: T[],
  getKey: (value: T) => K
) => {
  const map = new Map<K, T[]>();
  values.forEach((value) => {
    const key = getKey(value);
    const group = map.get(key);
    if (group) {
      group.push(value);
    } else {
      map.set(key, [value]);
    }
  });
  return map;
};

const buildSearchContext = (
  bundle: NonordinaryBundle,
  input: NonordinarySearchInput
): SearchContext => {
  const race = input.race_id
    ? bundle.races.find((row) => row.race_id === input.race_id) ?? null
    : null;

  return {
    race_id: input.race_id,
    race_name: race?.race_name ?? null,
    racecourse: race?.racecourse ?? null,
    surface: race?.surface ?? null,
    distance: race?.distance ?? null,
    tactic: input.tactics
      .filter((value) => value !== "none")
      .map((value) => TACTIC_LABEL_BY_VALUE[value] ?? value),
    going: input.going.filter((value) => value !== "none"),
    weather: input.weather.filter((value) => value !== "none")
  };
};

const selectedValuesForField = (
  input: NonordinarySearchInput,
  field: SearchField
) => {
  if (field === "tactic") {
    return input.tactics;
  }
  if (field === "going") {
    return input.going;
  }
  return input.weather;
};

const actualContextValues = (context: SearchContext, field: SearchField) =>
  context[field];

const matchTextRule = (value: string, rule: ConditionRuleRow) => {
  const field = normalizeField(rule.field);
  const left = normalizeComparableText(field, value);
  const right = rule.value_text == null ? "" : normalizeComparableText(field, rule.value_text);
  const operator = getOperator(rule);

  switch (operator) {
    case "include":
    case "eq":
    case "equals":
      return left === right;
    case "exclude":
    case "not_equals":
      return left !== right;
    case "raw":
      return true;
    default:
      return false;
  }
};

const matchNumberRule = (value: number, rule: ConditionRuleRow) => {
  const operator = getOperator(rule);
  const valueNumber = getValueNumber(rule);
  const minNumber = getMinNumber(rule);
  const maxNumber = getMaxNumber(rule);

  switch (operator) {
    case "include":
    case "eq":
    case "equals":
      return valueNumber == null ? false : value === valueNumber;
    case "exclude":
    case "not_equals":
      return valueNumber == null ? true : value !== valueNumber;
    case "range":
    case "range_include":
      return minNumber != null && maxNumber != null
        ? minNumber <= value && value <= maxNumber
        : false;
    case "range_exclude":
      return minNumber != null && maxNumber != null
        ? value < minNumber || maxNumber < value
        : true;
    case "gte":
      return valueNumber == null ? false : value >= valueNumber;
    case "lte":
      return valueNumber == null ? false : value <= valueNumber;
    case "raw":
      return true;
    default:
      return false;
  }
};

const ruleMatchesValue = (value: string | number, rule: ConditionRuleRow) =>
  typeof value === "number" ? matchNumberRule(value, rule) : matchTextRule(value, rule);

const matchesSelectableField = (
  input: NonordinarySearchInput,
  context: SearchContext,
  field: SearchField,
  rules: ConditionRuleRow[]
) => {
  const selectedValues = selectedValuesForField(input, field);
  if (selectedValues.length === 0) {
    return true;
  }

  const includesNone = selectedValues.includes("none" as never);
  if (rules.length === 0) {
    return includesNone;
  }

  const actualValues = actualContextValues(context, field);
  if (actualValues.length === 0) {
    return false;
  }

  return actualValues.some((value) =>
    rules.some((rule) => ruleMatchesValue(value, rule))
  );
};

const matchesRaceField = (
  context: SearchContext,
  field: RaceField,
  rules: ConditionRuleRow[]
) => {
  if (!context.race_id) {
    return true;
  }
  if (rules.length === 0) {
    return true;
  }

  const value = context[field];
  if (value == null) {
    return false;
  }

  return rules.some((rule) => ruleMatchesValue(value, rule));
};

const matchesDetail = (
  detail: AbilityDetailRow,
  input: NonordinarySearchInput,
  context: SearchContext,
  rulesByDetail: Map<string, ConditionRuleRow[]>
) => {
  const rulesByField = groupBy(
    rulesByDetail.get(detail.detail_id) ?? [],
    (rule) => normalizeField(rule.field)
  );

  for (const field of SEARCH_FIELDS) {
    if (
      !matchesSelectableField(
        input,
        context,
        field,
        rulesByField.get(field) ?? []
      )
    ) {
      return false;
    }
  }

  for (const field of RACE_FIELDS) {
    if (!matchesRaceField(context, field, rulesByField.get(field) ?? [])) {
      return false;
    }
  }

  return true;
};

const sortResults = (results: MatchedNonordinaryAbility[]) =>
  [...results].sort((left, right) => {
    const kanaDiff = (left.kana ?? "").localeCompare(right.kana ?? "", "ja");
    if (kanaDiff !== 0) {
      return kanaDiff;
    }
    return left.ability_name.localeCompare(right.ability_name, "ja");
  });

export const searchNonordinaryAbilities = (
  bundle: NonordinaryBundle,
  horses: HorseRecord[],
  input: NonordinarySearchInput
): MatchedNonordinaryAbility[] => {
  const context = buildSearchContext(bundle, input);
  const horsesById = indexBy(horses, (horse) => horse.HorseId);
  const abilitiesById = indexBy(bundle.abilities, (ability) => ability.ability_id);
  const stallionsById = indexBy(bundle.stallions, (stallion) => stallion.stallion_id);
  const detailsByAbility = groupBy(bundle.ability_details, (detail) => detail.ability_id);
  const rulesByDetail = groupBy(bundle.condition_rules, (rule) => rule.detail_id);
  const abilityStallionsByAbility = groupBy(
    bundle.ability_stallions,
    (row) => row.ability_id
  );
  const warningsByAbility = groupBy(bundle.parse_warnings, (warning) => warning.ability_id);
  const results: MatchedNonordinaryAbility[] = [];

  for (const ability of bundle.abilities) {
    const details = detailsByAbility.get(ability.ability_id) ?? [];
    const matchedDetails = details
      .filter((detail) => matchesDetail(detail, input, context, rulesByDetail))
      .map((detail) => ({
        detail_id: detail.detail_id,
        detail_label: detail.detail_label,
        effect_raw: detail.effect_raw,
        condition_raw: detail.condition_raw,
        probability_percent: detail.probability_percent
      }));

    if (matchedDetails.length === 0) {
      continue;
    }

    const sourceStallions = unique(
      (abilityStallionsByAbility.get(ability.ability_id) ?? []).map(
        (row) => row.stallion_id
      )
    ).map((stallionId) => {
      const stallion = stallionsById.get(stallionId);
      const horse = horsesById.get(stallionId) ?? null;
      return {
        stallion_id: stallionId,
        stallion_name: stallion?.stallion_name ?? horse?.card.name ?? stallionId,
        horse
      };
    });

    const abilityRow = abilitiesById.get(ability.ability_id) ?? ability;
    results.push({
      ability_id: abilityRow.ability_id,
      ability_name: abilityRow.ability_name,
      kana: abilityRow.kana,
      description: abilityRow.description,
      source_url: abilityRow.source_url ?? abilityRow.url,
      matched_details: matchedDetails,
      source_stallion_ids: sourceStallions.map((stallion) => stallion.stallion_id),
      source_stallions: sourceStallions,
      warnings: (warningsByAbility.get(ability.ability_id) ?? []).map(
        (warning) => warning.message
      )
    });
  }

  return sortResults(results);
};

export const getRaceLabel = (race: RaceRow) => race.race_name;
