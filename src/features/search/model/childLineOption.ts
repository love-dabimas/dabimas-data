// 子系統オートコンプリートで「表示名」と「親系統情報」を一緒に扱うための型。
export interface ChildLineOption {
  value: string;
  parentCode: string;
  parentLabel: string;
}
