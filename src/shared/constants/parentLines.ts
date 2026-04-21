// 画面で使う親系統コード一覧。表示順もこの配列順をそのまま採用する。
export const PARENT_LINE_OPTIONS = [
  { value: "Ro", label: "Ro", fullLabel: "Royal Charger" },
  { value: "Ne", label: "Ne", fullLabel: "Nearctic" },
  { value: "Ns", label: "Ns", fullLabel: "Nasrullah" },
  { value: "Na", label: "Na", fullLabel: "Native Dancer" },
  { value: "Ha", label: "Ha", fullLabel: "Hampton" },
  { value: "St", label: "St", fullLabel: "St.Simon" },
  { value: "He", label: "He", fullLabel: "Herod" },
  { value: "Te", label: "Te", fullLabel: "Teddy" },
  { value: "Ph", label: "Ph", fullLabel: "Phalaris" },
  { value: "Ma", label: "Ma", fullLabel: "Matchem" },
  { value: "Hi", label: "Hi", fullLabel: "Himyar" },
  { value: "Sw", label: "Sw", fullLabel: "Swynford" },
  { value: "Fa", label: "Fa", fullLabel: "Fairway" },
  { value: "To", label: "To", fullLabel: "Tom Fool" },
  { value: "Ec", label: "Ec", fullLabel: "Eclipse" }
] as const;

// 祖先検索で指定できる位置候補。既存データの表記に合わせて全角を維持している。
export const ANCESTOR_POSITION_OPTIONS = [
  { value: "自身", label: "自身" },
  { value: "１父", label: "１父" },
  { value: "父父", label: "父父" },
  { value: "母父", label: "母父" },
  { value: "１薄", label: "１薄" },
  { value: "見事", label: "見事" },
  { value: "以外", label: "以外" }
] as const;
