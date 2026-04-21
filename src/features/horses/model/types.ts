// 性別タブは既存データの値に合わせて "0" / "1" をそのまま使う。
export type GenderTab = "0" | "1";

// 馬カード上部に表示する各能力値。
export interface HorseCardStats {
  runningStyle: string;
  growth: string;
  achievement: string;
  clemency: string;
  stable: string;
  potential: string;
  health: string;
  dirt: string;
  distanceMin: string;
  distanceMax: string;
}

// 血統表の 1 行ぶんを、元データの並び順どおりにタプルで保持する。
export type PedigreeEntry = [
  name: string,
  childLine: string,
  lineCode: string,
  factorCodes: string[]
];

// 1 枚の結果カードを描画するのに必要な派生済みデータ群。
export interface HorseCardData {
  name: string;
  ability: string;
  rareBadgeClass: string;
  rareBadgeLabel: string;
  selfFactorCodes: string[];
  stats: HorseCardStats;
  factorCounts: [number[], number[], number[]];
  pedigree: PedigreeEntry[];
}

// 検索や表示の土台になる元レコード。
export interface HorseRecord {
  SerialNumber: string;
  Gender: GenderTab;
  HorseId: string;
  FactorFlg: string;
  RareCd: string;
  Category: string;
  Category_ht: string;
  Paternal_t: string;
  Paternal_ht: string;
  Paternal_jik: string;
  Paternal_mig: string;
  Ped_All: string;
  card: HorseCardData;
}

// 祖先オートコンプリートで使う因子マスタ。
export interface FactorOption {
  id: string;
  name: string;
  badges?: string[];
}
