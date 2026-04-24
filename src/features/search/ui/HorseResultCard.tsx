import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { HorseRecord, PedigreeEntry } from "@/features/horses/model/types";
import {
  createHorseCardHighlighter,
  type HorseCardHighlighter
} from "@/features/search/lib/createHorseCardHighlighter";
import type { SearchCriteria } from "@/features/search/model/searchCriteria";
import { renderHighlightedText } from "@/features/search/lib/renderHighlightedText";

interface HorseResultCardProps {
  horse: HorseRecord;
  criteria: SearchCriteria;
}

// 旧 HTML テーブルの血統位置を React 化した都合で、スロット名は既存構造を踏襲している。
type PedigreeSlot =
  | "t"
  | "tt"
  | "ttt"
  | "tttt"
  | "ttht"
  | "tht"
  | "thtt"
  | "thht"
  | "ht"
  | "htt"
  | "httt"
  | "htht"
  | "hht"
  | "hhtt"
  | "hhht";

const PEDIGREE_SLOTS: PedigreeSlot[] = [
  "t",
  "tt",
  "ttt",
  "tttt",
  "ttht",
  "tht",
  "thtt",
  "thht",
  "ht",
  "htt",
  "httt",
  "htht",
  "hht",
  "hhtt",
  "hhht"
];

const FACTOR_HEADER_CODES = [
  "01",
  "02",
  "03",
  "04",
  "11",
  "12",
  "13",
  "14",
  "09",
  "10",
  "05",
  "06",
  "07",
  "08"
];
const FACTOR_BADGE_LABELS: Record<string, string> = {
  "01": "短",
  "02": "速",
  "03": "底",
  "04": "長",
  "05": "適",
  "06": "丈",
  "07": "早",
  "08": "晩",
  "09": "堅",
  "10": "難",
  "11": "走",
  "12": "中",
  "13": "強",
  "14": "雷"
};
const IMAGE_FACTOR_CODES = new Set(
  Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"))
);
const THIN_FACTOR_HEADER_CODES = FACTOR_HEADER_CODES.filter(
  (code) => !["11", "12", "13", "14"].includes(code)
);
const FACTOR_INDEX_BY_CODE = Object.fromEntries(
  FACTOR_HEADER_CODES.map((code, index) => [code, index])
) as Record<string, number>;

// 旧カードの基準幅。モバイルではこの幅を基準に縮小率を計算する。
const LEGACY_CARD_WIDTH = 760;

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

// 因子アイコンも Pages の配信パスを考慮して組み立てる。
const factorIcon = (code: string) => assetUrl(`static/img/icn/icn_factor_${code}.png`);

// 数字系コードは画像、補助コードはフォールバック文字で描画する。
const renderFactorImage = (code: string) => {
  if (!code) {
    return null;
  }

  if (!IMAGE_FACTOR_CODES.has(code)) {
    return (
      <span className={`result-card__factor-fallback header01_f${code}`}>
        {FACTOR_BADGE_LABELS[code] ?? ""}
      </span>
    );
  }

  return <img src={factorIcon(code)} alt="" />;
};

// 血統表末尾の因子欄は最大 2 個だけ見せる仕様なので、空欄込みで 2 セルへそろえる。
const renderPedigreeFactorCells = (
  kind: "horse" | "migoto" | "omoshiro" | "omoshiro_mare",
  factorCodes: string[]
) => {
  const visibleCodes = factorCodes.slice(-2);
  const paddedCodes =
    visibleCodes.length === 0
      ? ["", ""]
      : visibleCodes.length === 1
        ? ["", visibleCodes[0]]
        : visibleCodes;

  return paddedCodes.map((code, index) => (
    <td key={`${kind}-${index}-${code || "blank"}`} className={`factor_${kind}`} width="24">
      {renderFactorImage(code)}
    </td>
  ));
};

// 因子カウント表のヘッダーをコード配列から機械的に組み立てる。
const renderCountHeaderCells = (keyPrefix: string, headerCodes = FACTOR_HEADER_CODES) =>
  headerCodes.map((code) => (
    <th
      key={`${keyPrefix}-factor-header-${code}`}
      className={`result-card__factor-header header01_f${code}`}
    >
      <span className="result-card__factor-header-text">{FACTOR_BADGE_LABELS[code] ?? ""}</span>
    </th>
  ));

// 実際の件数も同じコード順でセル化し、見出しとの対応を保つ。
const renderCountValueCells = (
  counts: number[],
  keyPrefix: string,
  headerCodes = FACTOR_HEADER_CODES
) =>
  headerCodes.map((code) => {
    const count = counts[FACTOR_INDEX_BY_CODE[code]] ?? 0;
    return (
      <td key={`${keyPrefix}-factor-count-${code}`}>{String(count).padStart(2, "0")}</td>
    );
  });

// 血統データが欠けている行は空行タプルで補い、描画側を単純化する。
const getPedigreeEntry = (horse: HorseRecord, index: number): PedigreeEntry =>
  horse.card.pedigree[index] ?? ["", "", "", []];

// React 側のハイライト描画関数へ小さく別名を付けて読みやすくする。
const renderText = (value: string, terms: string[]) => renderHighlightedText(value, terms);

const renderTheoryMarks = (horse: HorseRecord) => {
  const theory = horse.card.theory;
  if (!theory) {
    return null;
  }

  const items = [
    ["完璧", theory.canPerfect],
    ["超完璧", theory.canSuperPerfect],
    ["奇跡", theory.canMiracle],
    ["至高", theory.canShiho]
  ] as const;

  return (
    <span className="result-card__theory-panel" aria-label="配合理論">
      <span className="result-card__theory-grid">
        {items.map(([label, enabled]) => (
          <span key={label} className="result-card__theory-cell">
            <span className="result-card__theory-label">{label}</span>
            <span className={enabled ? "result-card__theory-value is-enabled" : "result-card__theory-value"}>
              {enabled ? "○" : "－"}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
};

// 旧テーブルごとの colspan / rowSpan を維持したまま、スロット別に 1 行ずつ描画する。
const renderPedigreeRow = (
  slot: PedigreeSlot,
  [name, childLine, lineCode, factorCodes]: PedigreeEntry,
  horse: HorseRecord,
  highlighter: HorseCardHighlighter
) => {
  const isStallion = horse.Gender === "0";
  const renderName = (value: string) => renderText(value, highlighter.pedigreeNameTerms(slot));
  const renderChildLine = (value: string) =>
    renderText(value, highlighter.pedigreeChildLineTerms(slot));
  const renderLineCode = (value: string) =>
    renderText(value, highlighter.pedigreeLineCodeTerms(slot));

  // slot ごとに行構造が違うため、ここでは既存マークアップを素直に分岐で再現する。
  switch (slot) {
    case "t":
      return (
        <tr key={slot}>
          <td align="center" className="father_0" width="15">
            父
          </td>
          <td colSpan={4} className={isStallion ? "omoshiro_0" : "omoshiro_mare_0"}>
            {renderName(name)}
          </td>
          <td
            width="180"
            className={`factor_02_img ${isStallion ? "omoshiro" : "omoshiro_mare_11"}`}
          >
            {renderChildLine(childLine)}
          </td>
          <td width="50" className={isStallion ? "omoshiro_11" : "omoshiro_mare_12"}>
            {renderLineCode(lineCode)}
          </td>
          {renderPedigreeFactorCells(
            isStallion ? "omoshiro" : "omoshiro_mare",
            factorCodes
          )}
        </tr>
      );

    case "tt":
      return (
        <tr key={slot}>
          <td align="center" className="father_1" rowSpan={7} width="15"></td>
          <td className="father_0" width="15">
            父
          </td>
          <td colSpan={3} className="horse_0">
            {renderName(name)}
          </td>
          <td width="180" className="factor_02_img horse_0">
            {renderChildLine(childLine)}
          </td>
          <td width="50" className="horse_1"></td>
          {renderPedigreeFactorCells("horse", factorCodes)}
        </tr>
      );

    case "ttt":
      return (
        <tr key={slot}>
          <td align="center" className="father_1" rowSpan={3} width="15"></td>
          <td className="father_0" width="15">
            父
          </td>
          <td colSpan={2} className="horse_0">
            {renderName(name)}
          </td>
          <td width="180" className="factor_02_img horse_0">
            {renderChildLine(childLine)}
          </td>
          <td width="50" className="horse_1"></td>
          {renderPedigreeFactorCells("horse", factorCodes)}
        </tr>
      );

    case "tttt":
      return (
        <tr key={slot}>
          <td align="center" className="father_1" width="15"></td>
          <td className="father" width="15">
            父
          </td>
          <td className="horse_0">{renderName(name)}</td>
          <td width="180" className="factor_02_img horse_0">
            {renderChildLine(childLine)}
          </td>
          <td width="50" className="horse_1"></td>
          {renderPedigreeFactorCells("horse", factorCodes)}
        </tr>
      );

    case "ttht":
      return (
        <tr key={slot}>
          <td className="mother">母</td>
          <td className="father">父</td>
          <td className={isStallion ? "migoto" : "horse_0"}>
            {renderName(name)}
          </td>
          <td width="180" className={`factor_02_img ${isStallion ? "migoto_0" : "horse_0"}`}>
            {renderChildLine(childLine)}
          </td>
          <td width="50" className={isStallion ? "migoto_1" : "horse_1"}>
            {isStallion ? renderLineCode(lineCode) : null}
          </td>
          {renderPedigreeFactorCells(isStallion ? "migoto" : "horse", factorCodes)}
        </tr>
      );

    case "tht":
      return (
        <tr key={slot}>
          <td className="mother_0">母</td>
          <td className="father_0" rowSpan={1}>
            父
          </td>
          <td colSpan={2} className={isStallion ? "omoshiro_0" : "omoshiro_mare_0"}>
            {renderName(name)}
          </td>
          <td
            width="180"
            className={`factor_02_img ${isStallion ? "omoshiro" : "omoshiro_mare_11"}`}
          >
            {renderChildLine(childLine)}
          </td>
          <td width="50" className={isStallion ? "omoshiro_2" : "omoshiro_mare_2"}>
            {renderLineCode(lineCode)}
          </td>
          {renderPedigreeFactorCells(
            isStallion ? "omoshiro" : "omoshiro_mare",
            factorCodes
          )}
        </tr>
      );

    case "thtt":
      return (
        <tr key={slot}>
          <td className="mother_1" rowSpan={2}></td>
          <td className="father_1"></td>
          <td className="father">父</td>
          <td className="horse_0">{renderName(name)}</td>
          <td width="180" className="factor_02_img horse_0">
            {renderChildLine(childLine)}
          </td>
          <td width="50" className="horse_1"></td>
          {renderPedigreeFactorCells("horse", factorCodes)}
        </tr>
      );

    case "thht":
      return (
        <tr key={slot}>
          <td className="mother">母</td>
          <td className="father">父</td>
          <td className={isStallion ? "migoto" : "horse_0"}>
            {renderName(name)}
          </td>
          <td width="180" className={`factor_02_img ${isStallion ? "migoto_0" : "horse_0"}`}>
            {renderChildLine(childLine)}
          </td>
          <td width="50" className={isStallion ? "migoto_1" : "horse_1"}>
            {isStallion ? renderLineCode(lineCode) : null}
          </td>
          {renderPedigreeFactorCells(isStallion ? "migoto" : "horse", factorCodes)}
        </tr>
      );

    case "ht":
      return (
        <tr key={slot}>
          <td className="mother_0">母</td>
          <td className="father_0">父</td>
          <td colSpan={3} className={isStallion ? "omoshiro_0" : "omoshiro_mare_0"}>
            {renderName(name)}
          </td>
          <td
            width="180"
            className={`factor_02_img ${isStallion ? "omoshiro" : "omoshiro_mare_11"}`}
          >
            {renderChildLine(childLine)}
          </td>
          <td width="50" className={isStallion ? "omoshiro_12" : "omoshiro_mare_12"}>
            {renderLineCode(lineCode)}
          </td>
          {renderPedigreeFactorCells(
            isStallion ? "omoshiro" : "omoshiro_mare",
            factorCodes
          )}
        </tr>
      );

    case "htt":
      return (
        <tr key={slot}>
          <td className="mother_1" rowSpan={6}></td>
          <td className="father_1" rowSpan={3}></td>
          <td className="father_0">父</td>
          <td colSpan={2} className="horse_0">
            {renderName(name)}
          </td>
          <td width="180" className="factor_02_img horse_0">
            {renderChildLine(childLine)}
          </td>
          <td width="50" className="horse_1"></td>
          {renderPedigreeFactorCells("horse", factorCodes)}
        </tr>
      );

    case "httt":
      return (
        <tr key={slot}>
          <td className="father_1"></td>
          <td className="father">父</td>
          <td className="horse_0">{renderName(name)}</td>
          <td width="180" className="factor_02_img horse_0">
            {renderChildLine(childLine)}
          </td>
          <td width="50" className="horse_1"></td>
          {renderPedigreeFactorCells("horse", factorCodes)}
        </tr>
      );

    case "htht":
      return (
        <tr key={slot}>
          <td className="mother">母</td>
          <td className="father">父</td>
          <td className={isStallion ? "migoto" : "horse_0"}>
            {renderName(name)}
          </td>
          <td width="180" className={`factor_02_img ${isStallion ? "migoto_0" : "horse_0"}`}>
            {renderChildLine(childLine)}
          </td>
          <td width="50" className={isStallion ? "migoto_1" : "horse_1"}>
            {isStallion ? renderLineCode(lineCode) : null}
          </td>
          {renderPedigreeFactorCells(isStallion ? "migoto" : "horse", factorCodes)}
        </tr>
      );

    case "hht":
      return (
        <tr key={slot}>
          <td className="mother_0">母</td>
          <td className="father_0">父</td>
          <td colSpan={2} className={isStallion ? "omoshiro_0" : "omoshiro_mare_0"}>
            {renderName(name)}
          </td>
          <td
            width="180"
            className={`factor_02_img ${isStallion ? "omoshiro" : "omoshiro_mare_11"}`}
          >
            {renderChildLine(childLine)}
          </td>
          <td width="50" className={isStallion ? "omoshiro_2" : "omoshiro_mare_2"}>
            {renderLineCode(lineCode)}
          </td>
          {renderPedigreeFactorCells(
            isStallion ? "omoshiro" : "omoshiro_mare",
            factorCodes
          )}
        </tr>
      );

    case "hhtt":
      return (
        <tr key={slot}>
          <td className="mother_1" rowSpan={2}></td>
          <td className="father_1" rowSpan={1}></td>
          <td className="father">父</td>
          <td className="horse_0">{renderName(name)}</td>
          <td width="180" className="factor_02_img horse_0">
            {renderChildLine(childLine)}
          </td>
          <td className="horse_1" width="50"></td>
          {renderPedigreeFactorCells("horse", factorCodes)}
        </tr>
      );

    case "hhht":
      return (
        <tr key={slot}>
          <td className="mother">母</td>
          <td className="father">父</td>
          <td className={isStallion ? "migoto" : "horse_0"}>
            {renderName(name)}
          </td>
          <td width="180" className={`factor_02_img ${isStallion ? "migoto_0" : "horse_0"}`}>
            {renderChildLine(childLine)}
          </td>
          <td width="50" className={isStallion ? "migoto_1" : "horse_1"}>
            {isStallion ? renderLineCode(lineCode) : null}
          </td>
          {renderPedigreeFactorCells(isStallion ? "migoto" : "horse", factorCodes)}
        </tr>
      );
  }
};

export const HorseResultCard = ({ horse, criteria }: HorseResultCardProps) => {
  // all / 1薄 / 2薄 の因子カウントを上段表へ分けて表示する。
  const [allFactorCounts, thin1FactorCounts, thin2FactorCounts] = horse.card.factorCounts;
  const highlighter = createHorseCardHighlighter(criteria, horse);
  const viewportRef = useRef<HTMLDivElement>(null);
  const legacyRef = useRef<HTMLElement>(null);
  const [legacyScale, setLegacyScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | null>(null);

  // 距離は min/max 両方ある時だけレンジ表記にする。
  const distance =
    horse.card.stats.distanceMin && horse.card.stats.distanceMax
      ? `${horse.card.stats.distanceMin}〜${horse.card.stats.distanceMax}`
      : horse.card.stats.distanceMin || horse.card.stats.distanceMax;

  // モバイルでは旧カードを transform で縮小し、その見た目高さを親へ同期する。
  useLayoutEffect(() => {
    let frameId = 0;
    const viewport = viewportRef.current;
    const legacy = legacyRef.current;

    if (!viewport || !legacy) {
      return;
    }

    const measure = () => {
      const availableWidth = viewport.clientWidth;

      if (availableWidth <= 0) {
        return;
      }

      // 基準幅より狭い時だけ縮小し、広い画面では等倍表示のままにする。
      const nextScale = Math.min(1, availableWidth / LEGACY_CARD_WIDTH);
      const nextHeight = Math.ceil(legacy.offsetHeight * nextScale);

      setLegacyScale((current) => (Math.abs(current - nextScale) < 0.001 ? current : nextScale));
      setScaledHeight((current) => (current === nextHeight ? current : nextHeight));
    };

    const scheduleMeasure = () => {
      if (frameId !== 0) {
        return;
      }

      frameId = requestAnimationFrame(() => {
        frameId = 0;
        measure();
      });
    };

    // 初回表示とリサイズの両方で高さを再計算する。
    measure();

    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(viewport);
    resizeObserver.observe(legacy);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      if (frameId !== 0) {
        cancelAnimationFrame(frameId);
      }

      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, []);

  return (
    <article className="result-card">
      <div
        ref={viewportRef}
        className="result-card__viewport"
        style={
          {
            "--result-card-scale": `${legacyScale}`,
            height: scaledHeight ? `${scaledHeight}px` : undefined
          } as CSSProperties
        }
      >
        {/* 旧 HTML に寄せた中身は絶対配置し、親 viewport 側が実高さを持つ。 */}
        <section ref={legacyRef} className="result-card__legacy">
          <div className="horsedata2">
            {/* 上段: 馬名、因子、非凡、能力値などの概要表。 */}
            <table className="horse_spec" width="100%">
              <tbody>
                <tr>
                  <th className={horse.card.rareBadgeClass} style={{ width: "10%" }}>
                    {horse.card.rareBadgeLabel || "\u00a0"}
                  </th>
                  <td colSpan={3}>
                    <div className="result-card__summary-cell">
                      <label className="result-card__summary-main">
                        <span className="result-card__horse-name">
                          {renderText(horse.card.name, highlighter.horseNameTerms)}
                        </span>
                        <span className="factor_02_img">
                          {horse.card.selfFactorCodes.map((code, index) => (
                            <img
                              key={`self-factor-${index}-${code}`}
                              src={factorIcon(code)}
                              alt=""
                            />
                          ))}
                          &nbsp;
                          {renderText(horse.Category, highlighter.horseCategoryTerms)}
                        </span>
                      </label>
                      {renderTheoryMarks(horse)}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 中段: 能力値と全因子カウント。 */}
            <table width="100%">
              <tbody>
                <tr>
                  <th className="header01" aria-label="脚質">
                    <span className="result-card__label-full">脚質</span>
                    <span className="result-card__label-short">脚</span>
                  </th>
                  <th className="header01" aria-label="成長">
                    <span className="result-card__label-full">成長</span>
                    <span className="result-card__label-short">成</span>
                  </th>
                  <th className="header01" aria-label="実績">
                    <span className="result-card__label-full">実績</span>
                    <span className="result-card__label-short">実</span>
                  </th>
                  <th className="header01" aria-label="気性">
                    <span className="result-card__label-full">気性</span>
                    <span className="result-card__label-short">気</span>
                  </th>
                  <th className="header01" aria-label="安定">
                    <span className="result-card__label-full">安定</span>
                    <span className="result-card__label-short">安</span>
                  </th>
                  <th className="header01" aria-label="底力">
                    <span className="result-card__label-full">底力</span>
                    <span className="result-card__label-short">底</span>
                  </th>
                  <th className="header01" aria-label="健康">
                    <span className="result-card__label-full">健康</span>
                    <span className="result-card__label-short">健</span>
                  </th>
                  <th className="header01" aria-label="適正力">
                    <span className="result-card__label-full">適正力</span>
                    <span className="result-card__label-short">適</span>
                  </th>
                  <th className="header01" aria-label="距離">
                    <span className="result-card__label-full">距離</span>
                    <span className="result-card__label-short">距</span>
                  </th>
                  {renderCountHeaderCells("all")}
                </tr>
                <tr>
                  <td>{renderText(horse.card.stats.runningStyle, highlighter.defaultTerms)}</td>
                  <td>{renderText(horse.card.stats.growth, highlighter.defaultTerms)}</td>
                  <td>{renderText(horse.card.stats.achievement, highlighter.defaultTerms)}</td>
                  <td>{renderText(horse.card.stats.clemency, highlighter.defaultTerms)}</td>
                  <td>{renderText(horse.card.stats.stable, highlighter.defaultTerms)}</td>
                  <td>{renderText(horse.card.stats.potential, highlighter.defaultTerms)}</td>
                  <td>{renderText(horse.card.stats.health, highlighter.defaultTerms)}</td>
                  <td>{renderText(horse.card.stats.dirt, highlighter.defaultTerms)}</td>
                  <td className="result-card__distance-value">
                    {renderText(distance, highlighter.defaultTerms)}
                  </td>
                  {renderCountValueCells(allFactorCounts, "all")}
                </tr>
              </tbody>
            </table>

            {/* 下段: 1 薄 / 2 薄の因子カウント。 */}
            <table width="100%">
              <tbody>
                <tr>
                  <th className="header01_01" colSpan={THIN_FACTOR_HEADER_CODES.length}>
                    1薄め
                  </th>
                  <th className="header01_02" colSpan={THIN_FACTOR_HEADER_CODES.length}>
                    2薄め
                  </th>
                </tr>
                <tr>
                  {renderCountHeaderCells("thin1", THIN_FACTOR_HEADER_CODES)}
                  {renderCountHeaderCells("thin2", THIN_FACTOR_HEADER_CODES)}
                </tr>
                <tr>
                  {renderCountValueCells(
                    thin1FactorCounts,
                    "thin1",
                    THIN_FACTOR_HEADER_CODES
                  )}
                  {renderCountValueCells(
                    thin2FactorCounts,
                    "thin2",
                    THIN_FACTOR_HEADER_CODES
                  )}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="detail">
            {/* 血統表本体。スロット配列順に 1 行ずつ差し込む。 */}
            <table className="pedigree" width="100%">
              <tbody>
                {PEDIGREE_SLOTS.map((slot, index) =>
                  renderPedigreeRow(slot, getPedigreeEntry(horse, index), horse, highlighter)
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </article>
  );
};
