# ダビマス全書「非凡な才能」データ仕様

更新日: 2026-04-29
対象実装: `tools/nonordinary_data/generate_nonordinary_bundle.py`
出力先: `json/nonordinary_abilities_bundle.json`

---

## 1. 目的

ダビマス全書の才能一覧ページを正として、アプリ内の非凡検索で使うJSONバンドルを生成する。

このバンドルは以下に使う。

- 非凡検索モーダルのレース選択肢
- レース・騎乗指示・馬場状態・天候による非凡検索
- 非凡を持つ種牡馬IDの取得
- 馬カードの非凡詳細補完

---

## 2. 入力

取得元URL:

```txt
https://dabimas.jp/kouryaku/abilities/
```

ローカルキャッシュ:

```txt
data/nonordinary/raw/official_search/abilities.html
```

通常実行ではキャッシュがあればそれを読む。
`--refresh` 指定時は公式ページを取得し直してキャッシュを更新する。

---

## 3. 実行方法

```powershell
python tools/nonordinary_data/generate_nonordinary_bundle.py
```

公式ページを取り直す場合:

```powershell
python tools/nonordinary_data/generate_nonordinary_bundle.py --refresh
```

パスを明示する場合:

```powershell
python tools/nonordinary_data/generate_nonordinary_bundle.py `
  --refresh `
  --source-html ./data/nonordinary/raw/official_search/abilities.html `
  --output ./json/nonordinary_abilities_bundle.json
```

---

## 4. 非凡として採用する能力種別

公式ページのVueデータにある `ability_conditions` を解析する。

現在、非凡検索バンドルへ含める `ability_type` は以下。

```python
ABILITY_TYPES_NONORDINARY = {1, 2}
```

`ability_type = 1` だけに限定しない。
`イクイノックス-央天-` のように、非凡として扱うべき能力が `ability_type = 2` で出るため。

`ability_type = 3` は天性側のデータとして出るため、このバンドルには含めない。

出力JSON上の `ability_type` 表示は、アプリ側の扱いやすさを優先して `"非凡な才能"` に統一する。

---

## 5. 出力全体

出力は1つのJSONに複数のフラットテーブルを入れる。

```json
{
  "meta": {},
  "race_filter_options": [],
  "races": [],
  "abilities": [],
  "stallions": [],
  "ability_stallions": [],
  "ability_details": [],
  "ability_effects": [],
  "condition_groups": [],
  "condition_rules": [],
  "parse_warnings": []
}
```

`meta.schema_version` は現在 `1.2.0`。

---

## 6. `race_filter_options`

非凡検索モーダルのレース候補。

公式HTML内の以下から取得する。

```css
select[v-model="race"]
```

形式:

```ts
interface RaceFilterOption {
  sort_order: number;
  race_id: string | null;
  race_name: string;
  is_all: boolean;
}
```

`is_all: true` は `"すべて"` を表し、`race_id` は `null`。

フロント表示では、公式の `sort_order` ではなく開催日の昇順へ並べ替える。
並べ替えは `NonordinaryModal.tsx` の `RACE_DATE_ORDER_BY_ID` を使う。

---

## 7. `races`

レースIDから、検索照合に使う実体条件を引くためのマスター。

形式:

```ts
interface RaceRow {
  race_id: string;
  race_name: string;
  racecourse: string | null;
  surface: "芝" | "ダート" | string | null;
  distance: number | null;
  raw_course: string | null;
  source_url: string | null;
}
```

`race_id` は直接の検索条件にはしない。
検索時は `race_id` から `races` を引き、以下へ展開する。

```txt
race_name
racecourse
surface
distance
```

---

## 8. `abilities`

非凡な才能の基本情報。

```ts
interface AbilityRow {
  ability_id: string;
  ability_name: string;
  kana: string | null;
  ability_type: string;
  description: string | null;
  url: string;
  source_url?: string;
  source_status: string;
  raw_text_hash: string | null;
}
```

`ability_id` は文字列として扱う。
数値化すると先頭ゼロやID比較の扱いが壊れる可能性がある。

---

## 9. `stallions` と `ability_stallions`

`stallions` は種牡馬マスター。

```ts
interface StallionRow {
  stallion_id: string;
  stallion_name: string;
  url: string;
  source: string;
}
```

`ability_stallions` は、能力と種牡馬の対応テーブル。

```ts
interface AbilityStallionRow {
  ability_id: string;
  stallion_id: string;
  stallion_name?: string;
  source: string;
  verified_by_stallion_page: boolean | null;
}
```

アプリの非凡検索では、この対応から `stallion_id` を取得し、`horselist.json` の `HorseId` と照合して表示可能な馬IDを作る。

---

## 10. `ability_details`

才能詳細1件ぶんのテーブル。

```ts
interface AbilityDetailRow {
  detail_id: string;
  ability_id: string;
  detail_index?: number;
  detail_order?: number;
  detail_label: string;
  effect_raw: string | null;
  condition_raw: string | null;
  target_raw: string | null;
  probability_raw: string | null;
  probability_percent: number | null;
}
```

1つの非凡が「その1」「その2」や「レベル1」「レベルMAX」を持つ場合、複数行に分ける。

`effect_raw`, `condition_raw`, `target_raw`, `probability_raw` は表示にも使うため、正規化後も消さない。

---

## 11. `ability_effects`

発揮効果のテーブル。

```ts
interface AbilityEffectRow {
  effect_id: string;
  detail_id: string;
  effect_no: number;
  effect_raw: string;
  requires_group_nos: number[];
}
```

現行データでは主に詳細ごとに1行を持つ。
将来、効果1・効果2単位で分ける余地を残している。

---

## 12. `condition_groups`

発揮条件のまとまり。

```ts
interface ConditionGroupRow {
  group_id?: string;
  condition_group_id?: string;
  detail_id: string;
  group_no: number;
  group_label: string;
  group_raw: string;
}
```

`group_id` と `condition_group_id` は互換のため両方を持つ場合がある。

---

## 13. `condition_rules`

検索判定で使う1ルール1行のテーブル。

```ts
interface ConditionRuleRow {
  rule_id: string;
  ability_id: string;
  detail_id: string;
  condition_group_id?: string;
  group_id?: string;
  group_no?: number;
  field: string;
  operator?: string;
  op?: string;
  value_text: string | null;
  value_number?: number | null;
  value_num?: number | null;
  min_number?: number | null;
  min_num?: number | null;
  max_number?: number | null;
  max_num?: number | null;
  raw_text?: string;
  raw?: string;
  parse_status?: string;
}
```

`operator` / `op`、`value_number` / `value_num` などは、過去仕様との互換のため表記ゆれを許容する。
検索側は `searchNonordinaryAbilities.ts` で両方を読めるようにしている。

---

## 14. 正規化する条件

現在の検索判定で使う主な `field` は以下。

```txt
race_name
course
racecourse
surface
distance
tactic
going
track_condition
weather
horse_condition
special
```

検索側では以下の表記ゆれを吸収する。

```txt
course -> racecourse
track_condition -> going
```

競馬場名は比較時に末尾の `"競馬場"` を取り除く。

例:

```txt
中山競馬場 -> 中山
```

---

## 15. レース条件

レース指定は `race_id` を直接 `condition_rules` と照合しない。

検索時は以下の順で処理する。

1. 入力の `race_id` から `races` を引く
2. `race_name`, `racecourse`, `surface`, `distance` を取り出す
3. `condition_rules` の該当フィールドと比較する

この仕様により、有馬記念のようにレース名そのものが条件に出る非凡も拾える。

---

## 16. `parse_warnings`

パース時に読み取りきれなかった条件や注意点を保持する。

```ts
interface ParseWarningRow {
  ability_id: string;
  detail_id: string | null;
  raw: string;
  message: string;
}
```

未分類条件は捨てず、表示や将来の改善に使える形で残す。

---

## 17. 定期更新

このバンドルは `.github/workflows/update-horse-data.yml` の週次実行対象。

ワークフローでは以下で実行する。

```bash
python tools/nonordinary_data/generate_nonordinary_bundle.py \
  --refresh \
  --source-html ./data/nonordinary/raw/official_search/abilities.html \
  --output ./json/nonordinary_abilities_bundle.json
```

更新対象として以下もコミットされる。

```txt
data/nonordinary/raw/official_search/abilities.html
json/nonordinary_abilities_bundle.json
dist
```

---

## 18. 注意点

- `ability_id` と `stallion_id` は必ず文字列で扱う。
- `ability_type = 2` の非凡を落とさない。
- 天性にあたる `ability_type = 3` は非凡バンドルに入れない。
- rawテキストは表示と再パースに使うので消さない。
- `race_id` は参照キーであり、直接照合キーではない。
- 公式ページの構造変更に備え、`parse_warnings` を確認する。
