// このファイルは、検索結果の馬カードを一覧表示する「結果パネル」の画面部品。
// 馬の数が多くても画面がもたつかないように「仮想スクロール」という仕組みを使っており、
// 今スクリーンに見えている範囲だけカードを実際に描画する。
// 非凡・天性の詳細モーダルを開く処理もここで一括して管理している。

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from "react";
import type { HorseRecord, HorseSkillData } from "@/features/horses/model/types";
import type { HorseCardHighlightCriteria } from "@/features/search/lib/createHorseCardHighlighter";
import { HorseResultCard } from "@/features/search/ui/HorseResultCard";
import { HorseSkillModal } from "@/features/search/ui/HorseSkillModal";

// 結果パネルに渡す設定。馬のリスト・強調条件・表示件数・センチネル要素の参照などが入る。
interface ResultsPanelProps {
  records: HorseRecord[];
  criteria: HorseCardHighlightCriteria;
  hasActivePrimaryFilters: boolean;
  visibleCount: number;
  sentinelRef: RefObject<HTMLDivElement | null>;
}

// 仮想スクロールで「どの範囲のカードを描画するか」を表す。
// start/end はインデックス（0 始まり）、top/bottom はピクセル単位のスペーサー高さ。
interface VirtualRange {
  start: number;
  end: number;
  top: number;
  bottom: number;
}

// 仮想スクロールの 1 行ぶん。子要素・並び順・高さ計測コールバックを受け取る。
interface VirtualRowProps {
  children: ReactNode;
  index: number;
  onMeasure: (index: number, height: number) => void;
}

// モーダルで表示するスキル（非凡 or 天性）の情報。タイトルとスキルデータのセット。
interface ActiveSkillModalState {
  title: string;
  skill: HorseSkillData;
}

// スキルモーダルを開く対象が「非凡」か「天性」かを示す文字列。
type ResultCardSkillKind = "ability" | "temperament";

// 何も条件を選んでいないとき（待機中）に出す案内文。
const EMPTY_IDLE_HEADING = "検索条件を選択してください";
const EMPTY_IDLE_BODY =
  "キーワード、系統、能力、レア度、非凡・天性などから条件を指定すると、該当する馬を表示します。";
// 条件を選んだが 0 件だったときに出すメッセージ。
const EMPTY_RESULTS_HEADING = "該当する馬が見つかりませんでした";
const EMPTY_RESULTS_BODY =
  "条件を広げるか、レア条件の絞り込みを見直してください。";
// 件数表示に使う文字列パーツ。「100件中 100件を表示」のように組み合わせる。
const SUMMARY_SUFFIX = "件を表示";
const SUMMARY_MIDDLE = "件中";
// まだカードの高さを計測していないときに使う仮の高さ（ピクセル）。
const ESTIMATED_CARD_HEIGHT = 620;
// 画面に見えている範囲より上下にどれだけ余分に描画しておくか（ピクセル）。
// 大きいほどスクロール時のちらつきが減るが、描画するカードが増えて重くなる。
const VIRTUAL_OVERSCAN_PX = 900;

// スキルデータを持っていてモーダルを開ける状態かどうかを判定する。
// タブ・説明文・URLのどれかがあれば「開ける」とみなす。
const canOpenSkillModal = (skill?: HorseSkillData | null) =>
  Boolean(
    skill &&
      ((skill.detailTabs?.length ?? 0) > 0 ||
        (skill.description?.length ?? 0) > 0 ||
        skill.detailUrl)
  );

// 詳細データがまだ取得できていない場合に使う仮のスキルオブジェクトを作る。
const createFallbackSkill = (name: string): HorseSkillData => ({
  name,
  description: ["詳細情報はまだ取得されていません。"],
  detailUrl: "",
  detailTabs: []
});

// data-result-card-skill 属性の文字列値を ResultCardSkillKind 型に変換する。
// "ability" / "temperament" 以外の値が来たときは null を返して無効とする。
const skillKindFromValue = (value: string | undefined): ResultCardSkillKind | null =>
  value === "ability" || value === "temperament" ? value : null;

// 馬のレコードと「非凡 or 天性」の区分から、モーダルに渡すデータを組み立てる。
// 表示できるデータがない場合は null を返してモーダルを開かない。
const skillModalStateForHorse = (
  horse: HorseRecord | undefined,
  kind: ResultCardSkillKind
): ActiveSkillModalState | null => {
  if (!horse) {
    return null;
  }

  const skill =
    kind === "ability"
      ? horse.card.abilityData ?? null
      : horse.card.temperamentData ?? null;
  const fallbackName =
    kind === "ability"
      ? horse.card.ability
      : horse.card.temperamentData?.name;
  const value = skill?.name || fallbackName || "なし";
  const fallbackSkill = value !== "なし" ? createFallbackSkill(value) : null;
  const modalSkill = skill ?? fallbackSkill;

  if (!modalSkill || (!canOpenSkillModal(modalSkill) && value === "なし")) {
    return null;
  }

  return {
    title: kind === "ability" ? "非凡" : "天性",
    skill: modalSkill
  };
};

// 「各カードの上端 y 座標の配列（offsets）」の中から、
// 指定したスクロール位置（value）に対応するカードのインデックスを二分探索で素早く見つける。
// 線形検索だと馬が 1000 頭のとき 1000 回調べるが、二分探索なら約 10 回で済む。
const findOffsetIndex = (offsets: number[], value: number) => {
  let low = 0;
  let high = offsets.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (offsets[mid] < value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return Math.max(0, low - 1);
};

// 仮想スクロールで使う「1 行ぶんのラッパー」。
// 描画した直後と、サイズが変わるたびに自分の高さを親（ResultsPanelBase）へ報告する。
// ResizeObserver でカードの高さ変化を監視し、offsets の配列を正確に保つ。
// memo でくるんで、関係ない再描画を防いでいる。
const VirtualRow = memo(({ children, index, onMeasure }: VirtualRowProps) => {
  // この div 要素自身への参照を持つ。高さ計測に使う。
  const ref = useRef<HTMLDivElement>(null);

  // useLayoutEffect は画面描画の直後に同期的に走る。
  // 描画が終わってすぐ高さを測りたいので useEffect ではなく useLayoutEffect を使う。
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    // DOM 要素の高さを計って親に伝える。小数点以下は切り上げてピクセル整数にする。
    const measure = () => {
      onMeasure(index, Math.ceil(node.getBoundingClientRect().height));
    };

    // 最初に 1 回計測する。
    measure();

    // その後もカードの高さが変わるたびに再計測する（画像読み込み後など）。
    const observer = new ResizeObserver(measure);
    observer.observe(node);

    // このカードが画面から消えるとき（アンマウント時）に監視を止める。
    return () => {
      observer.disconnect();
    };
  }, [index, onMeasure]);

  return (
    <div ref={ref} className="results-list__virtual-row">
      {children}
    </div>
  );
});

// 検索結果パネルの本体。memo でくるんで不要な再描画を防ぐ。
const ResultsPanelBase = ({
  records,
  criteria,
  hasActivePrimaryFilters,
  visibleCount: _visibleCount,
  sentinelRef: _sentinelRef
}: ResultsPanelProps) => {
  // 条件未入力または結果 0 件のどちらかなら「空の状態」とみなす。
  const isEmpty = !hasActivePrimaryFilters || records.length === 0;
  // 仮想スクロールリスト全体の div への参照。スクロール位置の計算に使う。
  const listRef = useRef<HTMLDivElement>(null);
  // カードごとに計測した実際の高さを保存するマップ。index → height（px）。
  // Ref にすることで、高さを書き換えても余計な再描画が起きないようにしている。
  const measuredHeightsRef = useRef<Map<number, number>>(new Map());
  // カードの高さが更新されるたびにインクリメントされるカウンター。
  // このカウンターが変わると offsets の useMemo が再計算されるトリガーになる。
  const [measureVersion, setMeasureVersion] = useState(0);
  // 今開いているスキルモーダルのデータ。null のときはモーダルを閉じている。
  const [activeSkillModal, setActiveSkillModal] = useState<ActiveSkillModalState | null>(null);
  // ウィンドウの高さとスクロール量。仮想スクロール範囲の計算に必要。
  const [viewport, setViewport] = useState(() => ({
    height: typeof window === "undefined" ? 900 : window.innerHeight,
    scrollY: typeof window === "undefined" ? 0 : window.scrollY
  }));

  // 検索結果や条件が変わったら、カードの高さキャッシュをすべてリセットする。
  // 古い高さが残っていると仮想スクロールの位置計算がずれるため。
  useEffect(() => {
    measuredHeightsRef.current.clear();
    setMeasureVersion((version) => version + 1);
  }, [records, criteria]);

  // スクロールとリサイズを監視してビューポート情報を最新に保つ。
  // requestAnimationFrame でまとめることで、スクロールごとに重い処理が走らないようにする。
  useEffect(() => {
    // 次のアニメーションフレームの ID。0 は「予約なし」を意味する。
    let frameId = 0;

    const updateViewport = () => {
      // すでにフレームが予約済みなら二重に予約しない。
      if (frameId !== 0) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        setViewport({
          height: window.innerHeight,
          scrollY: window.scrollY
        });
      });
    };

    // 初回に 1 回実行して現在の値を取得する。
    updateViewport();
    window.addEventListener("scroll", updateViewport, { passive: true });
    window.addEventListener("resize", updateViewport);

    // クリーンアップ：コンポーネントが消えるときにリスナーとフレーム予約を解除する。
    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  // 各カードの「上端の y 座標」を前から順番に積み上げた配列を作る。
  // offsets[0] = 0（一番上）、offsets[1] = カード 0 の高さ、offsets[2] = カード 0 + 1 の高さ…
  // この配列を二分探索すると、特定のスクロール位置に対応するカードを素早く見つけられる。
  const offsets = useMemo(() => {
    const nextOffsets = new Array(records.length + 1);
    nextOffsets[0] = 0;

    for (let index = 0; index < records.length; index += 1) {
      nextOffsets[index + 1] =
        nextOffsets[index] +
        // 実際に計測済みの高さがあればそれを、なければ推定値（620px）を使う。
        (measuredHeightsRef.current.get(index) ?? ESTIMATED_CARD_HEIGHT);
    }

    return nextOffsets;
  }, [records.length, measureVersion]);

  // 今の画面（ビューポート）に合わせて「どのカードを描画するか」の範囲を計算する。
  // start〜end の外にあるカードは DOM に存在しないが、スペーサー（空の div）で高さだけ確保する。
  const virtualRange: VirtualRange = useMemo(() => {
    // 条件なし or 結果 0 件のときは何も描画しない。
    if (!hasActivePrimaryFilters || records.length === 0) {
      return { start: 0, end: 0, top: 0, bottom: 0 };
    }

    // リスト要素のページ先頭からの絶対 y 座標を求める。
    const listTop =
      (listRef.current?.getBoundingClientRect().top ?? 0) + viewport.scrollY;
    // オーバースキャン（余白）を加味した「描画すべき上端」と「描画すべき下端」を計算する。
    const visibleTop = Math.max(0, viewport.scrollY - listTop - VIRTUAL_OVERSCAN_PX);
    const visibleBottom = Math.max(
      visibleTop,
      viewport.scrollY + viewport.height - listTop + VIRTUAL_OVERSCAN_PX
    );
    // 二分探索で描画範囲の最初と最後のカードインデックスを求める。
    const start = findOffsetIndex(offsets, visibleTop);
    const end = Math.min(records.length, findOffsetIndex(offsets, visibleBottom) + 2);
    const totalHeight = offsets[records.length] ?? 0;

    return {
      start,
      end,
      // 描画範囲より上のカードの合計高さ → 上スペーサーの高さになる。
      top: offsets[start] ?? 0,
      // 描画範囲より下のカードの合計高さ → 下スペーサーの高さになる。
      bottom: Math.max(0, totalHeight - (offsets[end] ?? totalHeight))
    };
  }, [
    hasActivePrimaryFilters,
    offsets,
    records.length,
    viewport.height,
    viewport.scrollY
  ]);

  // 今画面に描画する範囲だけ切り出した配列。条件なしの場合は空にする。
  const visibleRecords = hasActivePrimaryFilters
    ? records.slice(virtualRange.start, virtualRange.end)
    : [];
  // 「HorseId-SerialNumber」をキーにして馬レコードをすばやく引けるマップ。
  // クリックイベントで馬を特定するときに使う。
  const horseByKey = useMemo(
    () =>
      new Map(
        records.map((horse) => [
          `${horse.HorseId}-${horse.SerialNumber}`,
          horse
        ])
      ),
    [records]
  );

  // VirtualRow から高さが報告されたときに呼ばれる。
  // 値が変わっていないときは無視して、変わったときだけ保存して再計算を促す。
  const handleMeasure = useCallback((index: number, height: number) => {
    const current = measuredHeightsRef.current.get(index);
    if (current === height) {
      return;
    }

    measuredHeightsRef.current.set(index, height);
    setMeasureVersion((version) => version + 1);
  }, []);

  // スキルモーダルを開くときに HorseResultCard から呼ばれるコールバック。
  const handleOpenSkillModal = useCallback((title: string, skill: HorseSkillData) => {
    setActiveSkillModal({ title, skill });
  }, []);

  // リスト全体にクリック・タッチイベントを 1 つだけ貼り付けて、
  // 各カードの「非凡」「天性」要素がタップされたかどうかを判定する。
  // カードごとにリスナーを付けるより、親にまとめたほうがメモリ効率が良い（イベント委譲）。
  useEffect(() => {
    const root = listRef.current;
    if (!root) {
      return;
    }

    const handleNativeSkillActivation = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      // クリックされた要素（またはその親）に data-result-card-skill 属性があるか探す。
      const skillElement = target.closest<HTMLElement>("[data-result-card-skill]");
      if (!skillElement || !root.contains(skillElement)) {
        return;
      }

      // 属性値から「非凡 or 天性」と馬の識別情報を取り出す。
      const kind = skillKindFromValue(skillElement.dataset.resultCardSkill);
      const horseId = skillElement.dataset.resultCardHorseId;
      const serial = skillElement.dataset.resultCardSerial;

      if (!kind || !horseId || !serial) {
        return;
      }

      const modalState = skillModalStateForHorse(horseByKey.get(`${horseId}-${serial}`), kind);
      if (!modalState) {
        return;
      }

      // リンクのデフォルト動作（ページ遷移）を止めてモーダルを開く。
      event.preventDefault();
      event.stopPropagation();
      setActiveSkillModal(modalState);
    };

    // capture: true で最優先（バブリングより先）に受け取る。
    root.addEventListener("click", handleNativeSkillActivation, true);
    root.addEventListener("touchend", handleNativeSkillActivation, {
      capture: true,
      passive: false
    });

    return () => {
      root.removeEventListener("click", handleNativeSkillActivation, true);
      root.removeEventListener("touchend", handleNativeSkillActivation, true);
    };
  }, [horseByKey]);

  return (
    <>
    <section className={`results-panel ${isEmpty ? "results-panel--empty" : ""}`}>
      {hasActivePrimaryFilters ? (
        <div className="results-panel__summary">
          <p>
            {records.length} {SUMMARY_MIDDLE} {records.length} {SUMMARY_SUFFIX}
          </p>
        </div>
      ) : null}

      {records.length > 0 ? (
        <div ref={listRef} className="results-list results-list--virtual">
          <div
            className="results-list__spacer"
            style={{ height: `${virtualRange.top}px` }}
          />
          {visibleRecords.map((horse, offset) => {
            const index = virtualRange.start + offset;
            return (
              <VirtualRow
                key={`${horse.HorseId}-${horse.SerialNumber}`}
                index={index}
                onMeasure={handleMeasure}
              >
                <HorseResultCard
                  horse={horse}
                  criteria={criteria}
                  onOpenSkillModal={handleOpenSkillModal}
                />
              </VirtualRow>
            );
          })}
          <div
            className="results-list__spacer"
            style={{ height: `${virtualRange.bottom}px` }}
          />
        </div>
      ) : (
        <div className="empty-state">
          <h2>{hasActivePrimaryFilters ? EMPTY_RESULTS_HEADING : EMPTY_IDLE_HEADING}</h2>
          <p>{hasActivePrimaryFilters ? EMPTY_RESULTS_BODY : EMPTY_IDLE_BODY}</p>
        </div>
      )}
    </section>
    {activeSkillModal ? (
      <HorseSkillModal
        open
        title={activeSkillModal.title}
        skill={activeSkillModal.skill}
        onClose={() => setActiveSkillModal(null)}
      />
    ) : null}
    </>
  );
};

export const ResultsPanel = memo(ResultsPanelBase);
