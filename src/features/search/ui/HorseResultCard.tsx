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

const FACTOR_HEADER_CODES = Array.from({ length: 12 }, (_, index) =>
  String(index + 1).padStart(2, "0")
);

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

const factorIcon = (code: string) => assetUrl(`static/img/icn/icn_factor_${code}.png`);

const renderFactorImage = (code: string) =>
  code ? <img src={factorIcon(code)} alt="" /> : null;

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

const renderCountHeaderCells = (keyPrefix: string) =>
  FACTOR_HEADER_CODES.map((code, index) => (
    <th
      key={`${keyPrefix}-factor-header-${code}`}
      className={`result-card__factor-header header01_f${String(index + 1).padStart(2, "0")}`}
    >
      <span className="result-card__factor-header-icon">{renderFactorImage(code)}</span>
    </th>
  ));

const renderCountValueCells = (counts: number[], keyPrefix: string) =>
  counts.map((count, index) => (
    <td key={`${keyPrefix}-factor-count-${index}`}>{String(count).padStart(2, "0")}</td>
  ));

const getPedigreeEntry = (horse: HorseRecord, index: number): PedigreeEntry =>
  horse.card.pedigree[index] ?? ["", "", "", []];

const renderText = (value: string, terms: string[]) => renderHighlightedText(value, terms);

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
  const [allFactorCounts, thin1FactorCounts, thin2FactorCounts] = horse.card.factorCounts;
  const highlighter = createHorseCardHighlighter(criteria, horse);
  const distance =
    horse.card.stats.distanceMin && horse.card.stats.distanceMax
      ? `${horse.card.stats.distanceMin}〜${horse.card.stats.distanceMax}`
      : horse.card.stats.distanceMin || horse.card.stats.distanceMax;
  return (
    <article className="result-card">
      <div className="result-card__viewport">
        <section className="result-card__legacy">
          <div className="horsedata2">
            <table className="horse_spec" width="100%">
              <tbody>
                <tr>
                  <th className={horse.card.rareBadgeClass} style={{ width: "10%" }}>
                    {horse.card.rareBadgeLabel || "\u00a0"}
                  </th>
                  <td width="60%">
                    <label>
                      {renderText(horse.card.name, highlighter.horseNameTerms)}
                      <div className="factor_02_img">
                        {horse.card.selfFactorCodes.map((code, index) => (
                          <img
                            key={`self-factor-${index}-${code}`}
                            src={factorIcon(code)}
                            alt=""
                          />
                        ))}
                        &nbsp;
                        {renderText(horse.Category, highlighter.horseCategoryTerms)}
                      </div>
                    </label>
                  </td>
                  <th className="header01" style={{ width: "10%" }}>
                    非凡
                  </th>
                  <td>{renderText(horse.card.ability || "なし", highlighter.defaultTerms)}</td>
                </tr>
              </tbody>
            </table>

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

            <table width="100%">
              <tbody>
                <tr>
                  <th className="header01_01" colSpan={12}>
                    1薄め
                  </th>
                  <th className="header01_02" colSpan={12}>
                    2薄め
                  </th>
                </tr>
                <tr>
                  {renderCountHeaderCells("thin1")}
                  {renderCountHeaderCells("thin2")}
                </tr>
                <tr>
                  {renderCountValueCells(thin1FactorCounts, "thin1")}
                  {renderCountValueCells(thin2FactorCounts, "thin2")}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="detail">
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
