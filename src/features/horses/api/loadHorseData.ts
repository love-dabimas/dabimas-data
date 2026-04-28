import type { FactorOption, HorseRecord, HorseSkillData } from "@/features/horses/model/types";
import type { NonordinaryBundle } from "@/features/nonordinary/model/types";

// factor.json は `{ factor: [...] }` という入れ子構造なので、API レスポンス用に型を分けている。
interface FactorResponse {
  factor: FactorOption[];
}

// ローダー UI が扱う進捗フェーズはこの 3 段階に限定する。
export type LoadPhase = "requesting" | "parsing" | "preparing";

export interface LoadProgress {
  phase: LoadPhase;
  message: string;
}

// GitHub Pages のサブパス配信でも壊れないよう、すべて BASE_URL 基準で組み立てる。
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

const splitDetailLines = (value: string | null | undefined) =>
  (value ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

const buildNonordinarySkillIndex = (bundle: NonordinaryBundle) => {
  const detailsByAbilityId = new Map<string, NonordinaryBundle["ability_details"]>();

  bundle.ability_details.forEach((detail) => {
    const details = detailsByAbilityId.get(detail.ability_id);
    if (details) {
      details.push(detail);
    } else {
      detailsByAbilityId.set(detail.ability_id, [detail]);
    }
  });

  const skillByName = new Map<string, HorseSkillData>();

  bundle.abilities.forEach((ability) => {
    const details = [...(detailsByAbilityId.get(ability.ability_id) ?? [])].sort(
      (left, right) =>
        (left.detail_order ?? left.detail_index ?? 0) -
        (right.detail_order ?? right.detail_index ?? 0)
    );

    skillByName.set(ability.ability_name, {
      name: ability.ability_name,
      description: splitDetailLines(ability.description),
      detailUrl: ability.source_url ?? ability.url,
      detailTabs: details.map((detail, index) => ({
        label:
          details.length > 1
            ? detail.detail_label || `その${index + 1}`
            : detail.detail_label || "詳細",
        effects: splitDetailLines(detail.effect_raw).filter((line) => line !== "発揮効果種別"),
        conditions: splitDetailLines(detail.condition_raw),
        targets: splitDetailLines(detail.target_raw),
        probability:
          splitDetailLines(detail.probability_raw).length > 0
            ? splitDetailLines(detail.probability_raw)
            : detail.probability_percent == null
              ? []
              : [`${detail.probability_percent}%`]
      }))
    });
  });

  return skillByName;
};

const applyNonordinarySkillDetails = (
  horses: HorseRecord[],
  bundle: NonordinaryBundle
): HorseRecord[] => {
  const skillByName = buildNonordinarySkillIndex(bundle);

  return horses.map((horse) => {
    if (horse.card.abilityData || horse.card.ability === "なし") {
      return horse;
    }

    const abilityData = skillByName.get(horse.card.ability);
    if (!abilityData) {
      return horse;
    }

    return {
      ...horse,
      card: {
        ...horse.card,
        abilityData
      }
    };
  });
};

export const loadHorseData = async (
  onProgress?: (progress: LoadProgress) => void
): Promise<{
  horses: HorseRecord[];
  factors: FactorOption[];
  nonordinaryBundle: NonordinaryBundle;
}> => {
  // まずはネットワーク取得フェーズを UI へ通知する。
  onProgress?.({
    phase: "requesting",
    message: "配合データと因子データを取得しています。"
  });

  // 画面に必要な JSON は相互依存がないので並列で落とす。
  const [horseResponse, factorResponse, nonordinaryResponse] = await Promise.all([
    fetch(assetUrl("json/horselist.json")),
    fetch(assetUrl("json/factor.json")),
    fetch(assetUrl("json/nonordinary_abilities_bundle.json"))
  ]);

  // どちらか片方でも欠けると検索 UI 全体が成立しないため、ここで明示的に失敗させる。
  if (!horseResponse.ok) {
    throw new Error(`horselist.json の取得に失敗しました: ${horseResponse.status}`);
  }

  if (!factorResponse.ok) {
    throw new Error(`factor.json の取得に失敗しました: ${factorResponse.status}`);
  }

  if (!nonordinaryResponse.ok) {
    throw new Error(
      `nonordinary_abilities_bundle.json の取得に失敗しました: ${nonordinaryResponse.status}`
    );
  }

  onProgress?.({
    phase: "parsing",
    message: "受け取ったデータを展開して、検索に使える形へ整えています。"
  });

  // JSON パースも並列で済ませて待ち時間を減らす。
  const [horseData, factorJson, nonordinaryBundle] = await Promise.all([
    horseResponse.json() as Promise<HorseRecord[]>,
    factorResponse.json() as Promise<FactorResponse>,
    nonordinaryResponse.json() as Promise<NonordinaryBundle>
  ]);

  // パース後は描画直前フェーズとして最後のメッセージだけ更新する。
  onProgress?.({
    phase: "preparing",
    message: "表示の準備をしています。もう少しで開きます。"
  });

  // UI 側が使いやすいように、必要な配列だけを返す。
  return {
    horses: applyNonordinarySkillDetails(horseData, nonordinaryBundle),
    factors: factorJson.factor,
    nonordinaryBundle
  };
};
