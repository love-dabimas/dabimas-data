import type { FactorOption, HorseRecord } from "@/features/horses/model/types";

interface FactorResponse {
  factor: FactorOption[];
}

export type LoadPhase = "requesting" | "parsing" | "preparing";

export interface LoadProgress {
  phase: LoadPhase;
  message: string;
}

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export const loadHorseData = async (
  onProgress?: (progress: LoadProgress) => void
): Promise<{
  horses: HorseRecord[];
  factors: FactorOption[];
}> => {
  onProgress?.({
    phase: "requesting",
    message: "配合データと因子データを取得しています。"
  });

  const [horseResponse, factorResponse] = await Promise.all([
    fetch(assetUrl("json/horselist.json")),
    fetch(assetUrl("json/factor.json"))
  ]);

  if (!horseResponse.ok) {
    throw new Error(`horselist.json の取得に失敗しました: ${horseResponse.status}`);
  }

  if (!factorResponse.ok) {
    throw new Error(`factor.json の取得に失敗しました: ${factorResponse.status}`);
  }

  onProgress?.({
    phase: "parsing",
    message: "受け取ったデータを展開して、検索に使える形へ整えています。"
  });

  const [horseData, factorJson] = await Promise.all([
    horseResponse.json() as Promise<HorseRecord[]>,
    factorResponse.json() as Promise<FactorResponse>
  ]);

  onProgress?.({
    phase: "preparing",
    message: "表示の準備をしています。もう少しで開きます。"
  });

  return {
    horses: horseData,
    factors: factorJson.factor
  };
};
