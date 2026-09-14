import type { HorseRecord } from "@/features/horses/model/types";
import type { CustomHorsePayload } from "@/features/embed/model/messages";

// マスターの Ped_All と同じ深さ優先の15行。母そのものは表に含まない。
const POSITIONS = ["１父", "父父", "以外", "以外", "見事", "１薄", "以外", "見事",
  "母父", "以外", "以外", "見事", "１薄", "以外", "見事"];

export const buildCustomHorseRecord = (horse: CustomHorsePayload): HorseRecord => ({
  HorseId: horse.key.slice(0, -2),
  Gender: horse.gender,
  SerialNumber: horse.key,
  RareCd: "",
  FactorFlg: "",
  Category: horse.category,
  Category_ht: horse.categoryHt,
  Paternal_t: horse.paternalT,
  Paternal_ht: horse.paternalHt,
  Paternal_jik: horse.paternalJik,
  Paternal_mig: horse.paternalMig,
  Ped_All: `[自身${horse.name}]${horse.category}` + horse.pedigree.map(
    (entry, index) => {
      // 牝馬マスターでは「見事」の先祖位置も「以外」で検索する。
      const position = horse.gender === "1" && POSITIONS[index] === "見事" ? "以外" : POSITIONS[index];
      return `[${position}${entry[0]}]`;
    }
  ).join(""),
  card: {
    name: horse.name,
    ability: "なし",
    abilityData: null,
    temperamentData: null,
    rareBadgeClass: "header01",
    rareBadgeLabel: "ー",
    selfFactorCodes: horse.factors.filter(Boolean),
    stats: {
      runningStyle: "ー", growth: "ー", achievement: "ー", clemency: "ー", stable: "ー",
      potential: "ー", health: "ー", dirt: "ー", distanceMin: "ー", distanceMax: "ー"
    },
    factorCounts: [Array(14).fill(0), Array(14).fill(0), Array(14).fill(0)],
    pedigree: horse.pedigree
  }
});
