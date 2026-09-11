// このファイルは、❤ ボタンと「お気に入りのみ」ボタンで使うハートのアイコン。
// 文字の「♥」は端末のフォント次第で形が変わるので、SVG で形をそろえる。
// 形は Material Design Icons の favorite と同じ（Apache License 2.0）。
// 線と塗りの色は CSS 側（src/styles/embed.css）で切り替える。

const HEART_PATH =
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09" +
  "C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

interface HeartIconProps {
  className?: string;
}

export const HeartIcon = ({ className }: HeartIconProps) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={HEART_PATH} />
  </svg>
);
