// このファイルは、埋め込み時に結果カードの右上の角に掛ける ❤ ボタン。
// 見た目は 32px の白い丸、押せる範囲は 44px。押したときに小さなアニメーションを付ける
// （付ける: ハートが弾んで輪が広がる / 外す: 小さく縮む）。

import { useEffect, useState } from "react";
import { HeartIcon } from "@/features/embed/ui/HeartIcon";

interface FavoriteButtonProps {
  active: boolean;
  onToggle: () => void;
}

export const FavoriteButton = ({ active, onToggle }: FavoriteButtonProps) => {
  const [animation, setAnimation] = useState<"in" | "out" | null>(null);

  // アニメーション中の印は animationend ではなくタイマーで外す。
  // 端末で「視差効果を減らす」が有効だとアニメーション自体が走らず、animationend が来ないため。
  useEffect(() => {
    if (!animation) {
      return;
    }
    const timer = window.setTimeout(() => setAnimation(null), 600);
    return () => window.clearTimeout(timer);
  }, [animation]);

  const classNames = [
    "result-card__favorite",
    active ? "is-on" : "",
    animation ? `is-anim-${animation}` : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classNames}
      aria-pressed={active}
      aria-label={active ? "お気に入りから外す" : "お気に入りに追加"}
      onClick={(event) => {
        // 馬選択のときにカードを選んだ扱いにならないよう、カードまで伝えない。
        event.stopPropagation();
        setAnimation(active ? "out" : "in");
        onToggle();
      }}
    >
      <span className="result-card__favorite-circle">
        <HeartIcon className="result-card__favorite-icon" />
      </span>
    </button>
  );
};
