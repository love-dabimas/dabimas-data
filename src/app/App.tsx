import { useEffect, useMemo, useState } from "react";
import {
  loadHorseData,
  type LoadPhase,
  type LoadProgress
} from "@/features/horses/api/loadHorseData";
import type { FactorOption, HorseRecord } from "@/features/horses/model/types";
import type { NonordinaryBundle } from "@/features/nonordinary/model/types";
import type { ChildLineOption } from "@/features/search/model/childLineOption";
import { SearchPage } from "@/features/search/ui/SearchPage";
import { useSearchStore } from "@/features/search/store/useSearchStore";
import { PARENT_LINE_OPTIONS } from "@/shared/constants/parentLines";

// 起動直後は「読み込み中」、成功時は「ready」、失敗時は「error」の 3 状態で画面を切り替える。
type LoadState =
  | {
      status: "loading";
      phase: LoadPhase;
      message: string;
    }
  | {
      status: "ready";
      horses: HorseRecord[];
      factors: FactorOption[];
      nonordinaryBundle: NonordinaryBundle;
    }
  | {
      status: "error";
      message: string;
    };

const PARENT_LINE_ORDER = new Map<string, number>(
  PARENT_LINE_OPTIONS.map((option, index) => [option.value, index])
);

const PARENT_LINE_LABELS = new Map<string, string>(
  PARENT_LINE_OPTIONS.map((option) => [option.value, option.fullLabel])
);

// 馬データから子系統候補を一意に集め、親系統の表示順に並べ直してオートコンプリートに渡す。
const getUniqueSortedChildLineOptions = (
  horses: HorseRecord[],
  lineField: "Category" | "Category_ht",
  parentField: "Paternal_t" | "Paternal_ht"
): ChildLineOption[] => {
  const optionMap = new Map<string, ChildLineOption>();

  for (const horse of horses) {
    const value = horse[lineField].trim();

    if (!value || optionMap.has(value)) {
      continue;
    }

    const parentCode = horse[parentField].trim();

    optionMap.set(value, {
      value,
      parentCode,
      parentLabel: PARENT_LINE_LABELS.get(parentCode) ?? parentCode
    });
  }

  return [...optionMap.values()].sort((left, right) => {
    const leftOrder = PARENT_LINE_ORDER.get(left.parentCode) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = PARENT_LINE_ORDER.get(right.parentCode) ?? Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.value.localeCompare(right.value, "ja");
  });
};

const LOADING_STEPS: Array<{ phase: LoadPhase; label: string }> = [
  { phase: "requesting", label: "ファイル取得" },
  { phase: "parsing", label: "データ展開" },
  { phase: "preparing", label: "画面準備" }
];

const INITIAL_PROGRESS: LoadProgress = {
  phase: "requesting",
  message: "配合データと因子データを取得しています。"
};

export const App = () => {
  // 検索画面を開くたびに前回条件が残らないよう、アプリ起動時に条件を初期化する。
  const resetCriteria = useSearchStore((state) => state.resetCriteria);
  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    ...INITIAL_PROGRESS
  });

  useEffect(() => {
    resetCriteria();
  }, [resetCriteria]);

  useEffect(() => {
    let cancelled = false;

    // 読み込み関数から流れてくる進捗を、そのままローディング UI へ反映する。
    const updateProgress = (progress: LoadProgress) => {
      if (cancelled) {
        return;
      }

      setLoadState((current) =>
        current.status === "loading"
          ? {
              status: "loading",
              ...progress
            }
          : current
      );
    };

    // 初回表示時に JSON を読み込み、成功したら検索画面へ切り替える。
    const run = async () => {
      try {
        const result = await loadHorseData(updateProgress);

        if (cancelled) {
          return;
        }

        setLoadState({
          status: "ready",
          horses: result.horses,
          factors: result.factors,
          nonordinaryBundle: result.nonordinaryBundle
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "データの読み込みに失敗しました。";

        setLoadState({
          status: "error",
          message
        });
      }
    };

    void run();

    return () => {
      // アンマウント後に state 更新しないよう、非同期処理の結果を破棄する。
      cancelled = true;
    };
  }, []);

  // 自身の子系統候補を ready 状態になったタイミングだけで作り直す。
  const lineOptions = useMemo(
    () =>
      loadState.status === "ready"
        ? getUniqueSortedChildLineOptions(
            loadState.horses,
            "Category",
            "Paternal_t"
          )
        : [],
    [loadState]
  );

  // 母父の子系統候補も同じルールで別フィールドから生成する。
  const lineHtOptions = useMemo(
    () =>
      loadState.status === "ready"
        ? getUniqueSortedChildLineOptions(
            loadState.horses,
            "Category_ht",
            "Paternal_ht"
          )
        : [],
    [loadState]
  );

  if (loadState.status === "loading") {
    // 読み込みフェーズをカード風 UI の進捗バーへ変換する。
    const activeStepIndex = Math.max(
      LOADING_STEPS.findIndex(
        (step) => step.phase === loadState.phase
      ),
      0
    );
    const progressWidth = `${((activeStepIndex + 1) / LOADING_STEPS.length) * 100}%`;

    return (
      <main className="screen">
        <section className="search-overlay search-overlay--startup" aria-live="polite" aria-label="起動中">
          <div className="search-overlay__card search-overlay__card--startup">
            <div className="search-overlay__status">
              <span className="search-overlay__spinner" aria-hidden="true" />
              <span className="search-overlay__label">起動中</span>
            </div>

            <div className="search-overlay__intro">
              <p className="search-overlay__eyebrow">ダビ娘</p>
              <h1 className="search-overlay__title">検索データを準備しています</h1>
              <p className="search-overlay__message">{loadState.message}</p>
            </div>

            <div className="search-overlay__progress" aria-hidden="true">
              <span
                className="search-overlay__progress-bar"
                style={{ width: progressWidth }}
              ></span>
            </div>

            <div className="search-overlay__steps" aria-label="読み込みステップ">
              {LOADING_STEPS.map((step, index) => {
                const classNames = [
                  "search-overlay__step",
                  index < activeStepIndex ? "is-complete" : "",
                  index === activeStepIndex ? "is-active" : ""
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <span key={step.phase} className={classNames}>
                    {step.label}
                  </span>
                );
              })}
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (loadState.status === "error") {
    // エラー時は読み込みを中断し、再読込だけに導線を絞る。
    return (
      <main className="screen">
        <section className="shell loading-card">
          <p className="eyebrow">エラー</p>
          <h1>データを表示できませんでした</h1>
          <p className="support-copy">{loadState.message}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => window.location.reload()}
          >
            再読み込み
          </button>
        </section>
      </main>
    );
  }

  // ここまで来たら必要な検索データは揃っているので、通常の検索 UI を表示する。
  return (
    <SearchPage
      horses={loadState.horses}
      factors={loadState.factors}
      nonordinaryBundle={loadState.nonordinaryBundle}
      lineOptions={lineOptions}
      lineHtOptions={lineHtOptions}
    />
  );
};
