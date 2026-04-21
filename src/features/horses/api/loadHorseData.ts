import type { FactorOption, HorseRecord } from "@/features/horses/model/types";

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

export const loadHorseData = async (
  onProgress?: (progress: LoadProgress) => void
): Promise<{
  horses: HorseRecord[];
  factors: FactorOption[];
}> => {
  // まずはネットワーク取得フェーズを UI へ通知する。
  onProgress?.({
    phase: "requesting",
    message: "配合データと因子データを取得しています。"
  });

  // 画面に必要な 2 つの JSON は相互依存がないので並列で落とす。
  const [horseResponse, factorResponse] = await Promise.all([
    fetch(assetUrl("json/horselist.json")),
    fetch(assetUrl("json/factor.json"))
  ]);

  // どちらか片方でも欠けると検索 UI 全体が成立しないため、ここで明示的に失敗させる。
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

  // JSON パースも並列で済ませて待ち時間を減らす。
  const [horseData, factorJson] = await Promise.all([
    horseResponse.json() as Promise<HorseRecord[]>,
    factorResponse.json() as Promise<FactorResponse>
  ]);

  // パース後は描画直前フェーズとして最後のメッセージだけ更新する。
  onProgress?.({
    phase: "preparing",
    message: "表示の準備をしています。もう少しで開きます。"
  });

  // UI 側が使いやすいように、必要な配列だけを返す。
  return {
    horses: horseData,
    factors: factorJson.factor
  };
};
