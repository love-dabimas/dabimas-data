# 非凡検索フロント仕様

更新日: 2026-04-29
対象実装: `src/features/search/ui/NonordinaryModal.tsx`, `src/features/nonordinary/lib/searchNonordinaryAbilities.ts`

---

## 1. 目的

非凡検索モーダルで条件に合う非凡を探し、その非凡を持つ馬だけをメイン検索結果へ反映する。

この画面は非凡の詳細閲覧画面ではなく、メイン検索へ馬ID条件を渡すための絞り込みUIである。

---

## 2. 入力条件

モーダルで指定できる条件は以下。

```txt
騎乗指示
レース
馬場状態
天候
```

`NonordinarySearchInput` は以下。

```ts
interface NonordinarySearchInput {
  race_id: string | null;
  tactics: NonordinaryTacticValue[];
  going: NonordinaryGoingValue[];
  weather: NonordinaryWeatherValue[];
}
```

初期値:

```ts
{
  race_id: null,
  tactics: [],
  going: [],
  weather: []
}
```

---

## 3. 騎乗指示

表示候補:

```txt
条件指定なし
逃げ
先行
差し
追込
```

内部値:

```ts
type NonordinaryTacticValue =
  | "none"
  | "nige"
  | "senko"
  | "sashi"
  | "oikomi";
```

検索時は以下へ変換する。

```txt
nige   -> 逃げ
senko  -> 先行
sashi  -> 差し
oikomi -> 追込
```

`マーク` は現行UIでは表示しない。

---

## 4. 馬場状態

表示候補:

```txt
条件指定なし
良
稍重
重
不良
```

内部値:

```ts
type NonordinaryGoingValue =
  | "none"
  | "良"
  | "稍重"
  | "重"
  | "不良";
```

---

## 5. 天候

表示候補:

```txt
条件指定なし
晴
曇
雨
雪
```

内部値:

```ts
type NonordinaryWeatherValue =
  | "none"
  | "晴"
  | "曇"
  | "雨"
  | "雪";
```

---

## 6. レース選択

レース候補は `bundle.race_filter_options` から取得する。

表示順は開催日の昇順。
`NonordinaryModal.tsx` の `RACE_DATE_ORDER_BY_ID` を使って並べ替える。

`すべて` は `race_id: null` として扱う。

---

## 7. レースUI

ブラウザ標準の `<select>` はCSSで非表示にし、独自の `RaceSelect` を表示する。

```css
.nonordinary-modal .select-input {
  display: none;
}
```

独自UIの仕様:

- ボタン部分に現在のレース名を表示
- CSSの矢印で開閉状態を表す
- メニューは `position: absolute`
- `max-height: min(34vh, 220px)`
- リストを開いてもモーダル全体のレイアウトを押し広げない
- 外側クリックで閉じる
- 選択後は即座に閉じる

---

## 8. 「条件指定なし」の扱い

`none` は単なるワイルドカードではない。

選択型フィールドでは以下の意味になる。

```txt
その条件が書かれていない非凡も検索対象に含める
```

検索ロジック上は以下。

- ユーザーが何も選んでいない場合: そのフィールドでは絞り込まない
- `none` を含む場合: そのフィールドのルールが存在しない詳細も一致扱い
- `none` を含まない場合: そのフィールドのルールが存在しない詳細は不一致

---

## 9. レース指定時の内部展開

`race_id` は直接条件判定に使わない。

検索時に `bundle.races` からレースを引き、以下の検索コンテキストへ展開する。

```ts
interface SearchContext {
  race_id: string | null;
  race_name: string | null;
  racecourse: string | null;
  surface: string | null;
  distance: number | null;
  tactic: string[];
  going: string[];
  weather: string[];
}
```

レースが選ばれている場合のみ、以下を非凡ルールと照合する。

```txt
race_name
racecourse
surface
distance
```

レース未指定の場合、これらのレース由来フィールドでは絞り込まない。

---

## 10. 条件ルールの表記ゆれ

非凡バンドルには過去仕様との互換で表記ゆれがある。

検索側では以下を吸収する。

```txt
field:
  course -> racecourse
  track_condition -> going

operator:
  operator があれば使用
  なければ op を使用
  どちらもなければ raw

number:
  value_number / value_num
  min_number / min_num
  max_number / max_num
```

競馬場比較では、値の末尾にある `"競馬場"` を削って比較する。

---

## 11. 文字列ルール

文字列ルールは以下を扱う。

```txt
include
eq
equals
exclude
not_equals
raw
```

`raw` は候補から落とさないため `true` として扱う。

---

## 12. 数値ルール

数値ルールは主に距離判定に使う。

扱う演算子:

```txt
include
eq
equals
exclude
not_equals
range
range_include
range_exclude
gte
lte
raw
```

---

## 13. detail単位の判定

検索は能力単位ではなく、まず `ability_details` の1件ごとに判定する。

1つのdetailについて、以下をすべて満たしたら一致。

```txt
騎乗指示
馬場状態
天候
レース名
競馬場
芝/ダート
距離
```

1つの能力に複数detailがある場合、どれか1つでも一致すればその能力は検索結果に残る。

---

## 14. 検索結果

`searchNonordinaryAbilities()` は `MatchedNonordinaryAbility[]` を返す。

主な内容:

```ts
interface MatchedNonordinaryAbility {
  ability_id: string;
  ability_name: string;
  kana: string | null;
  description: string | null;
  source_url: string;
  matched_details: MatchedNonordinaryDetail[];
  source_stallion_ids: string[];
  source_stallions: MatchedSourceStallion[];
  warnings: string[];
}
```

`source_stallions[].horse` が `null` の場合、その種牡馬は `horselist.json` に存在しないためメイン結果には出せない。

---

## 15. メイン検索への反映

非凡モーダルの「検索する」を押すと、以下の処理を行う。

1. `searchNonordinaryAbilities(bundle, horses, draft)` を実行
2. 結果に含まれる `source_stallions` から、`horse` が存在するものだけを集める
3. `horse.HorseId` を重複除去する
4. `onApplyHorseIds(horseIds)` で呼び出し元へ返す
5. 検索ストアの `criteria.nonordinaryHorseIds` に保存する
6. メイン検索が `HorseId` インデックスで絞り込む

つまり、非凡検索の最終表示はモーダル内ではなくメインの馬カード一覧で行う。

---

## 16. `nonordinaryHorseIds` の意味

```txt
null
  非凡検索は未適用。

[]
  非凡検索は適用済み。ただし該当馬なし。

["2737142543", ...]
  非凡検索で該当した馬だけを表示する。
```

この区別により、「まだ検索していない」と「検索したが0件」を分けて扱える。

---

## 17. 結果ソート

非凡検索内部の結果は以下で並べる。

1. `kana` の日本語 localeCompare
2. `ability_name` の日本語 localeCompare

ただし、メイン表示へ反映した後の馬カード順は `filterHorseRecords.ts` の馬検索ソートに従う。

---

## 18. 有馬記念検索の注意点

有馬記念のようにレース名そのものが条件になる非凡がある。

そのため、レース選択時に距離・競馬場・芝/ダートだけへ分解して終わりにしてはいけない。

必ず `race_name` も照合対象に残す。

例:

```txt
race_id: 6557031492
race_name: 有馬記念
racecourse: 中山
surface: 芝
distance: 2500
```

この場合、`condition_rules.field = race_name` で `有馬記念` を持つ非凡も一致候補になる。

---

## 19. UI上の補足

- モーダルの見出し色はアプリ全体と同じ緑系に統一する。
- レースリストを開いてもカード間隔や下部ボタン位置を大きく押し下げない。
- 選択肢は大きすぎないサイズにする。
- `select` の標準矢印ではなく、CSSの矢印を使う。
