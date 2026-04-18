export type GenderTab = "0" | "1";

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

export type PedigreeEntry = [
  name: string,
  childLine: string,
  lineCode: string,
  factorCodes: string[]
];

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

export interface FactorOption {
  id: string;
  name: string;
  badges?: string[];
}
