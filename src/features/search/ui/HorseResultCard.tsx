import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Fragment, memo } from "react";
import type {
  HorseRecord,
  HorseSkillData,
  PedigreeEntry
} from "@/features/horses/model/types";
import {
  createHorseCardHighlighter,
  type HorseCardHighlighter,
  type HorseCardHighlightCriteria
} from "@/features/search/lib/createHorseCardHighlighter";
import { renderHighlightedText } from "@/features/search/lib/renderHighlightedText";
import { COLLAPSE_PEDIGREE, IS_EMBEDDED, IS_PICKER, horseKeyOf, matchedKeyIn } from "@/features/embed/model/embedMode";
import { requestFavoriteToggle } from "@/features/embed/lib/embedBridge";
import { useEmbedStore } from "@/features/embed/store/useEmbedStore";
import { FavoriteButton } from "@/features/embed/ui/FavoriteButton";

interface HorseResultCardProps {
  horse: HorseRecord;
  criteria: HorseCardHighlightCriteria;
  pedigreeOpen: boolean;
  onTogglePedigree: (horse: HorseRecord) => void;
  onOpenSkillModal: (title: string, skill: HorseSkillData) => void;
}

type ResultCardSkillKind = "ability" | "temperament";

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

// 血統表末尾の因子欄は 2 セル固定。行ごとにセル数を変えると桁が揃わなくなる。
// マスターの祖先は 1 行あたり最大 2 個なので、ここは今までどおり 1 個ずつ入る。
// 自家製馬の父だけは利用者が選んだ種牡馬そのもので、因子を 3 個持ちうる
// （ダビふぁくの血統表も 3 個出す）。落とさずに、左のセルへまとめて入れる。
// そのとき左のセルは 2 個ぶんの幅が要る。表は table-layout: auto でカード幅まで
// 詰められているので、放っておくと 2 個目が隣のセルへはみ出して 3 個目に
// ぴったり重なり、見た目は 2 個のままになる。幅は CSS 側（--multi）で確保する。
const renderPedigreeFactorCells = (
  kind: "horse" | "migoto" | "omoshiro" | "omoshiro_mare",
  factorCodes: string[]
) => {
  // マスターの因子は ["", "難", "底"] のように空文字で桁を埋めてくる。
  // 先に落としておかないと「2 個入っているセル」を見分けられない。
  const filled = factorCodes.filter(Boolean);
  const cells: string[][] =
    filled.length <= 1 ? [[], filled] : [filled.slice(0, -1), filled.slice(-1)];

  return cells.map((codes, index) => (
    <td
      key={`${kind}-${index}-${codes.join("") || "blank"}`}
      className={
        codes.length > 1
          ? `factor_${kind} result-card__factor-cell--multi`
          : `factor_${kind}`
      }
      width="24"
    >
      {codes.length === 0
        ? renderFactorImage("")
        : codes.map((code, position) => (
            <Fragment key={`${position}-${code}`}>{renderFactorImage(code)}</Fragment>
          ))}
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

const canOpenSkillModal = (skill?: HorseSkillData | null) =>
  Boolean(
    skill &&
      ((skill.detailTabs?.length ?? 0) > 0 ||
        (skill.description?.length ?? 0) > 0 ||
        skill.detailUrl)
  );

const createFallbackSkill = (name: string): HorseSkillData => ({
  name,
  description: ["詳細情報はまだ取得されていません。"],
  detailUrl: "",
  detailTabs: []
});

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

// 埋め込みのときだけ、配合理論マークの代わりに出す面白・見事の系統。
// 面白は Paternal_t / Paternal_jik の前半 / Paternal_ht / Paternal_jik の後半 の 4 つ。
// 見事は Paternal_mig を 2 文字ずつに割ったもので、種牡馬は 4 つ・繁殖牝馬は 3 つになる
// （全 2,979 頭で例外なし）。数が違うので枠は固定せず、並んだ分だけ伸ばす。
const renderLineCodes = (horse: HorseRecord) => {
  const rows = [
    {
      kind: "omoshiro",
      label: "面白",
      codes: [
        horse.Paternal_t,
        horse.Paternal_jik.slice(0, 2),
        horse.Paternal_ht,
        horse.Paternal_jik.slice(2, 4)
      ]
    },
    {
      kind: "migoto",
      label: "見事",
      codes: horse.Paternal_mig.match(/.{2}/g) ?? []
    }
  ] as const;

  return (
    <span className="result-card__lines" aria-label="面白・見事の系統">
      {rows.map(({ kind, label, codes }) => (
        <span key={kind} className={`result-card__lines-row result-card__lines-row--${kind}`}>
          <span className="result-card__lines-label">{label}</span>
          {codes.map((code, index) => (
            <span key={index} className="result-card__lines-code">
              {code}
            </span>
          ))}
        </span>
      ))}
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

const HorseResultCardBase = ({ horse, criteria, pedigreeOpen, onTogglePedigree, onOpenSkillModal }: HorseResultCardProps) => {
  // all / 1薄 / 2薄 の因子カウントを上段表へ分けて表示する。
  const [allFactorCounts, thin1FactorCounts, thin2FactorCounts] = horse.card.factorCounts;
  const highlighter = createHorseCardHighlighter(criteria, horse);
  const viewportRef = useRef<HTMLDivElement>(null);
  const legacyRef = useRef<HTMLElement>(null);
  const [legacyScale, setLegacyScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | null>(null);
  // ダビふぁくに埋め込まれているときだけ使う。❤ はダビふぁくのデータにいる馬にだけ出す。
  // 普通に開いたときは常に false / 何もしない。
  const horseKey = horseKeyOf(horse);
  // 親が持っているかは、ゲーム内 ID・いまの ID・以前の ID の順で照合する
  // （R2 を正本にしたときに採番が変わった馬を取りこぼさないため）。
  const canFavorite = useEmbedStore(
    (state) => IS_EMBEDDED && !horse.HorseId.startsWith("ch_") && state.supportedKeys !== null
      && matchedKeyIn(state.supportedKeys, horse) !== null
  );
  const isFavorite = useEmbedStore((state) => matchedKeyIn(state.favoriteKeys, horse) !== null);
  const isPicked = useEmbedStore(
    (state) =>
      IS_PICKER && state.pickedHorse !== null && horseKeyOf(state.pickedHorse) === horseKey
  );
  const togglePick = useEmbedStore((state) => state.togglePick);
  const clearPick = useEmbedStore((state) => state.clearPick);
  const temperament = horse.card.temperamentData ?? null;

  // 距離は min/max 両方ある時だけレンジ表記にする。
  const distance = IS_EMBEDDED && horse.HorseId.startsWith("ch_") ? "ー" :
    horse.card.stats.distanceMin && horse.card.stats.distanceMax
      ? `${horse.card.stats.distanceMin}〜${horse.card.stats.distanceMax}`
      : horse.card.stats.distanceMin || horse.card.stats.distanceMax;

  const getModalSkill = (
    skill: HorseSkillData | null | undefined,
    fallbackName: string | undefined
  ) => {
    const value = skill?.name || fallbackName || "なし";
    const fallbackSkill = value !== "なし" ? createFallbackSkill(value) : null;
    const modalSkill = skill ?? fallbackSkill;
    const isClickable = Boolean(modalSkill) && (canOpenSkillModal(modalSkill) || value !== "なし");

    return { value, modalSkill, isClickable };
  };

  const openSkillModal = (kind: ResultCardSkillKind) => {
    const resolved =
      kind === "ability"
        ? getModalSkill(horse.card.abilityData ?? null, horse.card.ability)
        : getModalSkill(temperament, temperament?.name);

    if (resolved.isClickable && resolved.modalSkill) {
      onOpenSkillModal(kind === "ability" ? "非凡" : "天性", resolved.modalSkill);
    }
  };

  const handleSkillClick = (
    event: React.MouseEvent<HTMLElement>,
    kind: ResultCardSkillKind
  ) => {
    event.preventDefault();
    event.stopPropagation();
    openSkillModal(kind);
  };

  const handleSkillKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    kind: ResultCardSkillKind
  ) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openSkillModal(kind);
  };

  const handleSkillTouchEnd = (
    event: React.TouchEvent<HTMLElement>,
    kind: ResultCardSkillKind
  ) => {
    event.preventDefault();
    event.stopPropagation();
    openSkillModal(kind);
  };

  const renderSkillEntry = (
    kind: ResultCardSkillKind,
    title: string,
    skill: HorseSkillData | null | undefined,
    fallbackName: string | undefined
  ) => {
    const { value, modalSkill, isClickable } = getModalSkill(skill, fallbackName);
    const entryClassName = [
      "result-card__skill-entry",
      `result-card__skill-entry--${kind}`,
      isClickable ? "result-card__skill-entry--button" : ""
    ].filter(Boolean).join(" ");
    const renderedValue = kind === "ability" ? renderText(value, highlighter.defaultTerms) : value;

    if (isClickable && modalSkill) {
      return (
        <span
          className={entryClassName}
          data-result-card-horse-id={horse.HorseId}
          data-result-card-serial={horse.SerialNumber}
          data-result-card-skill={kind}
          role="button"
          tabIndex={0}
          onClick={(event) => handleSkillClick(event, kind)}
          onKeyDown={(event) => handleSkillKeyDown(event, kind)}
          onTouchEnd={(event) => handleSkillTouchEnd(event, kind)}
        >
          <span className="result-card__skill-label">{title}</span>
          <span className="result-card__skill-value">{renderedValue}</span>
        </span>
      );
    }

    return (
      <div className={entryClassName}>
        <span className="result-card__skill-label">{title}</span>
        <span className="result-card__skill-value">{renderedValue}</span>
      </div>
    );
  };

  // モバイルでは旧カードを transform で縮小し、その見た目高さを親へ同期する。
  useLayoutEffect(() => {
    let frameId = 0;
    const viewport = viewportRef.current;
    const legacy = legacyRef.current;

    if (!viewport || !legacy) {
      return;
    }

    // ResizeObserver が渡してくるサイズだけで計算し、offsetHeight /
    // clientWidth は読まない。あれは強制同期レイアウトを起こし、旧カードは
    // 760px 幅の大きな table なので1回が重い。スクロール中に次々カードが
    // 出入りするとこれが積み上がってカクつく（実測でスクロール中の CPU の
    // 約2割がこの計測だった）。
    let observedWidth = -1;
    let observedLegacyHeight = -1;

    const sizeOf = (entry: ResizeObserverEntry) => {
      const box = entry.borderBoxSize && entry.borderBoxSize[0];
      return box
        ? { width: box.inlineSize, height: box.blockSize }
        : { width: entry.contentRect.width, height: entry.contentRect.height };
    };

    const apply = () => {
      if (observedWidth <= 0 || observedLegacyHeight <= 0) {
        return;
      }

      // 基準幅より狭い時だけ縮小し、広い画面では等倍表示のままにする。
      const nextScale = Math.min(1, observedWidth / LEGACY_CARD_WIDTH);
      const nextHeight = Math.ceil(observedLegacyHeight * nextScale);

      setLegacyScale((current) => (Math.abs(current - nextScale) < 0.001 ? current : nextScale));
      setScaledHeight((current) => (current === nextHeight ? current : nextHeight));
    };

    const scheduleApply = () => {
      if (frameId !== 0) {
        return;
      }

      frameId = requestAnimationFrame(() => {
        frameId = 0;
        apply();
      });
    };

    // 最初の高さは描画前に決める。ここを ResizeObserver 任せにすると、最初の
    // 描画が高さ未定（＝20px の空箱）のまま出る。仮想スクロールはその 20px を
    // 実寸と受け取り「まだ入る」と判断して数十枚まとめて描き、数秒固まる。
    // 1枚につき1回だけの読み出しなので、スクロール中に積み上がることはない。
    observedWidth = viewport.clientWidth;
    observedLegacyHeight = legacy.offsetHeight;
    apply();

    const resizeObserver = new ResizeObserver((entries) => {
      let changed = false;

      for (const entry of entries) {
        const size = sizeOf(entry);

        if (entry.target === legacy) {
          // 中身の高さ。ここが変わったときだけ縮小後の高さを出し直す。
          if (size.height !== observedLegacyHeight) {
            observedLegacyHeight = size.height;
            changed = true;
          }
          continue;
        }

        // viewport の高さは apply 自身が書き換えているので、幅だけ見る。
        // 高さの変化まで拾うと、測る→高さを変える→また呼ばれる、の往復になる。
        if (size.width !== observedWidth) {
          observedWidth = size.width;
          changed = true;
        }
      }

      if (changed) {
        scheduleApply();
      }
    });
    // observe した時点で今のサイズが1回配られるので、初回の同期計測は要らない。
    resizeObserver.observe(viewport);
    resizeObserver.observe(legacy);
    window.addEventListener("resize", scheduleApply);

    return () => {
      if (frameId !== 0) {
        cancelAnimationFrame(frameId);
      }

      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleApply);
    };
  }, []);

  return (
    <>
      <article
        className={`result-card${isPicked ? " is-picked" : ""}`}
        onClick={
          IS_PICKER
            ? (event) => {
                // カード内の非凡・天性の表示や ❤ のタップは、選択の扱いにしない。
                if ((event.target as HTMLElement).closest("button, a, [role='button']")) {
                  return;
                }
                if (!isPicked) togglePick(horse);
              }
            : undefined
        }
      >
      {canFavorite ? (
        <FavoriteButton active={isFavorite} onToggle={() => requestFavoriteToggle(horse)} />
      ) : null}
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
                          {IS_EMBEDDED && horse.HorseId.startsWith("ch_") && (
                            <span className="custom-horse-badge" aria-label="自家製馬">自</span>
                          )}
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
                      {IS_PICKER ? renderLineCodes(horse) : renderTheoryMarks(horse)}
                    </div>
                  </td>
                </tr>
                {!IS_PICKER && <tr>
                  <td colSpan={4} className="result-card__skill-summary-cell">
                    <div className="result-card__skill-summary">
                      {renderSkillEntry(
                        "ability",
                        "非凡",
                        horse.card.abilityData ?? null,
                        horse.card.ability
                      )}
                      {renderSkillEntry(
                        "temperament",
                        "天性",
                        temperament,
                        temperament?.name
                      )}
                    </div>
                  </td>
                </tr>}
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
                  {!IS_PICKER && renderCountHeaderCells("all")}
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
                  {!IS_PICKER && renderCountValueCells(allFactorCounts, "all")}
                </tr>
              </tbody>
            </table>

            {/* 下段: 1 薄 / 2 薄の因子カウント。 */}
            {!IS_PICKER && <table width="100%">
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
            </table>}
          </div>

          {(!COLLAPSE_PEDIGREE || pedigreeOpen) && <div className="detail">
            {/* 血統表本体。スロット配列順に 1 行ずつ差し込む。 */}
            <table className="pedigree" width="100%">
              <tbody>
                {PEDIGREE_SLOTS.map((slot, index) =>
                  renderPedigreeRow(slot, getPedigreeEntry(horse, index), horse, highlighter)
                )}
              </tbody>
            </table>
          </div>}
        </section>
      </div>
      {COLLAPSE_PEDIGREE && (
        <button
          type="button"
          className="result-card__pedigree-toggle"
          aria-expanded={pedigreeOpen}
          onClick={() => onTogglePedigree(horse)}
        >
          {pedigreeOpen ? "▲ 血統表を隠す" : "▼ 血統表を見る"}
        </button>
      )}
      {isPicked && (
        <div className="result-card__selection-overlay">
          <button type="button" className="result-card__deselect" onClick={clearPick}>
            選択を解除する
          </button>
        </div>
      )}
      </article>
    </>
  );
};

export const HorseResultCard = memo(HorseResultCardBase);
