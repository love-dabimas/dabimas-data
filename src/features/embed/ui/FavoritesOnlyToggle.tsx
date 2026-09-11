// このファイルは、埋め込み時にキーワード欄の右に置く「お気に入りのみ」ボタン。
// オン・オフはダビふぁくの馬選択ダイアログ・PC の入力欄と共通の 1 つの設定なので、
// 押したら親（ダビふぁく）に保存を頼む（src/features/embed/store/useEmbedStore.ts）。

import { HeartIcon } from "@/features/embed/ui/HeartIcon";

interface FavoritesOnlyToggleProps {
  active: boolean;
  count: number;
  onChange: (value: boolean) => void;
}

export const FavoritesOnlyToggle = ({ active, count, onChange }: FavoritesOnlyToggleProps) => (
  <button
    type="button"
    className={`favorites-only-toggle${active ? " is-on" : ""}`}
    aria-pressed={active}
    onClick={() => onChange(!active)}
  >
    <HeartIcon className="favorites-only-toggle__icon" />
    お気に入りのみ（{count}）
  </button>
);
