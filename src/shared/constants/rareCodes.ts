// レア条件ボタンに並べるコード一覧。UI の見た目と同じ順番で定義する。
export const RARE_OPTIONS = [
  { value: "8", label: "真" },
  { value: "7", label: "極" },
  { value: "6", label: "驫" },
  { value: "5", label: "５" },
  { value: "4", label: "４" },
  { value: "3", label: "３" },
  { value: "2", label: "２" },
  { value: "1", label: "１" },
  { value: "Z", label: "券" },
  { value: "Y", label: "名" },
  { value: "X", label: "優" },
  { value: "W", label: "良" },
  { value: "V", label: "可" },
  { value: "U", label: "無" }
] as const;

// 初期状態では主に使う上位レアだけを ON にして検索しやすくする。
export const DEFAULT_RARE_CODES = ["8", "7", "6", "5", "4", "Z", "Y", "X"];
