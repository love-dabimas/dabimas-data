# ダビマス全書「非凡な才能」データ取得仕様

作成日: 2026-04-25  
対象: ダビマス全書 `https://dabimas.jp/kouryaku/abilities/`  
目的: ダビマス全書の画面・詳細ページを正として、「非凡な才能」と、それを持つ種牡馬IDを機械的に取得し、自作検索システム用JSONとして出力する。

---

## 1. この仕様でやること / やらないこと

### やること

- ダビマス全書から「非凡な才能」の能力IDを取得する。
- 各能力詳細ページから、以下を取得する。
  - 能力ID
  - 能力名
  - かな
  - 説明
  - 入手経路
  - 入手経路に紐づく種牡馬ID
  - 発揮効果
  - 発揮条件
  - 発揮対象
  - 発揮確率
- 発揮条件を検索しやすい形に正規化する。
- `alasql + TypeScript` で扱いやすいJSON形式にする。
- 取得元HTMLと生テキストを保存し、後からパーサーを修正できるようにする。

### やらないこと

- フロント画面の実装。
- UIデザイン。
- ダビマス全書の検索仕様そのものの完全再現。
- 発揮効果の強さ比較・ゲーム内効果量の数値化。
- すべての自然文条件の完全な機械判定。

---

## 2. 基本方針

ダビマス全書の検索条件の内部仕様は公開されていない前提で進める。

そのため、次の方針にする。

```txt
ダビマス全書の検索ロジックを推測して再現する
```

ではなく、

```txt
ダビマス全書上で「非凡な才能」として表示される能力を取得し、
詳細ページを全件保存し、
自前で検索できるJSON DBを作る
```

という構成にする。

---

## 3. データ取得の全体フロー

```txt
01. abilities一覧ページを開く
02. 画面上で「非凡な才能」に絞り込む
03. 検索結果に表示された /kouryaku/abilities/{ability_id}.html を全件取得する
04. 各能力詳細ページHTMLをローカル保存する
05. 能力詳細ページから名前・説明・入手経路・才能詳細を抽出する
06. 入手経路リンクから /kouryaku/stallions/{stallion_id}.html を抽出する
07. 必要に応じて種牡馬ページも取得し、非凡な才能欄と相互検証する
08. 発揮条件を正規化する
09. alasqlで扱いやすいフラットJSONとして出力する
```

---

## 4. 推奨実装構成

Pythonで取得・整形し、フロント側は生成済みJSONを読む構成を推奨する。

```txt
dabimas_nonordinary_fetcher/
├─ data/
│  ├─ raw/
│  │  ├─ ability_pages/
│  │  │  ├─ 7132546838.html
│  │  │  └─ ...
│  │  ├─ stallion_pages/
│  │  │  ├─ 1074828353.html
│  │  │  └─ ...
│  │  └─ official_search/
│  │     └─ nonordinary_ability_ids.json
│  ├─ parsed/
│  │  └─ nonordinary_abilities_raw.json
│  ├─ normalized/
│  │  └─ nonordinary_abilities_bundle.json
│  └─ logs/
│     ├─ parse_warnings.json
│     └─ validation_report.json
├─ scripts/
│  ├─ 01_collect_nonordinary_ids.py
│  ├─ 02_download_ability_pages.py
│  ├─ 03_parse_ability_pages.py
│  ├─ 04_download_stallion_pages.py
│  ├─ 05_normalize_conditions.py
│  └─ 06_build_alasql_bundle.py
├─ src/
│  ├─ fetcher.py
│  ├─ parser.py
│  ├─ normalizer.py
│  ├─ validator.py
│  └─ models.py
└─ README.md
```

---

## 5. 取得対象URL形式

### 能力詳細ページ

```txt
https://dabimas.jp/kouryaku/abilities/{ability_id}.html
```

例:

```txt
https://dabimas.jp/kouryaku/abilities/7132546838.html
```

### 種牡馬詳細ページ

```txt
https://dabimas.jp/kouryaku/stallions/{stallion_id}.html
```

例:

```txt
https://dabimas.jp/kouryaku/stallions/1074828353.html
```

---

## 6. 非凡な才能IDの取得方法

### 優先方式: Playwrightで公式画面を操作する

検索仕様が不明なため、最初はPlaywrightで画面操作する。

```txt
1. https://dabimas.jp/kouryaku/abilities/ を開く
2. 才能種別で「非凡な才能」を選択する
3. 検索ボタンを押す
4. 結果に表示された能力詳細リンクを全件取得する
5. ページネーションがある場合は次ページを辿る
6. /kouryaku/abilities/{ability_id}.html の ability_id を保存する
```

保存先:

```txt
data/raw/official_search/nonordinary_ability_ids.json
```

出力例:

```json
{
  "source_url": "https://dabimas.jp/kouryaku/abilities/",
  "filter": "非凡な才能",
  "collected_at": "2026-04-25T00:00:00+09:00",
  "ability_ids": [
    "7132546838",
    "8311613245",
    "6548431452"
  ]
}
```

### 補助方式: HTMLや通信から検索パラメータを調査する

開発者ツールのNetworkで、検索条件変更時にクエリパラメータやAPI通信が存在する場合は、それを使ってもよい。

ただし、公開仕様ではないため、実装では次を守る。

```txt
- 取得URLまたはPOSTデータをログに保存する
- 取得結果の件数を保存する
- Playwright取得結果との差分検証をできるようにする
```

---

## 7. 能力詳細ページから取得する項目

能力詳細ページから以下を取得する。

```txt
## 才能詳細
かな
能力名
#### 説明
説明文
#### 入手経路
種牡馬リンク
#### 才能詳細
発揮効果
発揮条件
発揮対象
発揮確率
```

ただし、才能詳細は複数ある場合がある。

例:

```txt
#### 才能詳細
#### 才能詳細：その1
#### 才能詳細：その2
#### 才能詳細：レベル 1
#### 才能詳細：レベル MAX
```

そのため、詳細情報は必ず配列で保持する。

---

## 8. 種牡馬IDの取得方法

能力詳細ページの「入手経路」セクションにあるリンクから種牡馬IDを抽出する。

対象リンク形式:

```txt
/kouryaku/stallions/{stallion_id}.html
```

正規表現:

```regex
/kouryaku/stallions/(\d+)\.html
```

### 例

能力:

```txt
https://dabimas.jp/kouryaku/abilities/7132546838.html
```

入手経路:

```txt
マヤノトップガン1997
```

リンク:

```txt
/kouryaku/stallions/1074828353.html
```

抽出結果:

```json
{
  "ability_id": "7132546838",
  "ability_name": "虎視眈々",
  "stallion_id": "1074828353",
  "stallion_name": "マヤノトップガン1997"
}
```

---

## 9. 相互検証

データの信頼性を上げるため、可能であれば種牡馬ページも取得して照合する。

### 検証内容

能力ページ側:

```txt
能力詳細ページの入手経路に stallion_id があるか
```

種牡馬ページ側:

```txt
種牡馬詳細ページの「非凡な才能」欄に ability_id または ability_name があるか
```

### 検証結果の例

```json
{
  "ability_id": "7132546838",
  "ability_name": "虎視眈々",
  "stallion_id": "1074828353",
  "stallion_name": "マヤノトップガン1997",
  "ability_page_has_stallion": true,
  "stallion_page_has_ability": true,
  "status": "ok"
}
```

不一致の場合:

```json
{
  "ability_id": "9999999999",
  "ability_name": "サンプル",
  "stallion_id": "1111111111",
  "stallion_name": "サンプル種牡馬",
  "ability_page_has_stallion": true,
  "stallion_page_has_ability": false,
  "status": "warning",
  "message": "能力ページの入手経路には存在するが、種牡馬ページの非凡な才能欄で確認できなかった"
}
```

---

## 10. rawデータは必ず残す

正規化ミスに備えて、以下を保存する。

```txt
- 取得元HTML
- ページ本文のテキスト
- 発揮効果 raw
- 発揮条件 raw
- 発揮対象 raw
- 発揮確率 raw
```

理由:

```txt
- 条件表記の揺れがある
- 「条件1」「条件2」などの段階条件がある
- 「才能詳細：その1」「その2」のような複数パターンがある
- 後からパーサーを修正できるようにするため
```

---

## 11. alasql向けJSON設計

フロント側が `alasql + TypeScript` の場合、巨大な入れ子JSONだけにするとJOINや絞り込みが面倒になる。

そのため、最終出力は **1つのbundle JSONの中に、複数のフラットテーブルを持つ形式** にする。

推奨ファイル:

```txt
data/normalized/nonordinary_abilities_bundle.json
```

---

## 12. 最終JSON全体構造

```json
{
  "meta": {
    "schema_version": "1.0.0",
    "generated_at": "2026-04-25T00:00:00+09:00",
    "source": "dabimas.jp/kouryaku/abilities",
    "source_policy": "official_search_result_is_authoritative",
    "ability_type": "非凡な才能"
  },
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

---

## 13. abilities テーブル

能力本体のテーブル。

### カラム

| カラム | 型 | 内容 |
|---|---|---|
| ability_id | string | 能力ID |
| ability_name | string | 能力名 |
| kana | string | かな |
| ability_type | string | `非凡な才能` 固定 |
| description | string | 説明文 |
| url | string | 能力詳細URL |
| source_status | string | `official_search_result` など |
| raw_text_hash | string | 本文hash |

### 例

```json
{
  "ability_id": "7132546838",
  "ability_name": "虎視眈々",
  "kana": "こしたんたん",
  "ability_type": "非凡な才能",
  "description": "虎視眈々と好機を睨み\n最後の直線で全てをかける\n鋭い末脚を発揮できる非凡な才能",
  "url": "https://dabimas.jp/kouryaku/abilities/7132546838.html",
  "source_status": "official_search_result",
  "raw_text_hash": "sha256:..."
}
```

---

## 14. stallions テーブル

種牡馬本体のテーブル。

### カラム

| カラム | 型 | 内容 |
|---|---|---|
| stallion_id | string | 種牡馬ID |
| stallion_name | string | 種牡馬名 |
| url | string | 種牡馬詳細URL |
| source | string | `ability_obtain_route` など |

### 例

```json
{
  "stallion_id": "1074828353",
  "stallion_name": "マヤノトップガン1997",
  "url": "https://dabimas.jp/kouryaku/stallions/1074828353.html",
  "source": "ability_obtain_route"
}
```

---

## 15. ability_stallions テーブル

能力と種牡馬の中間テーブル。

1つの非凡を複数の種牡馬が持つ可能性、または将来の仕様変更に備えて中間テーブルにする。

### カラム

| カラム | 型 | 内容 |
|---|---|---|
| ability_id | string | 能力ID |
| stallion_id | string | 種牡馬ID |
| source | string | `ability_obtain_route` |
| verified_by_stallion_page | boolean | 種牡馬ページで検証できたか |

### 例

```json
{
  "ability_id": "7132546838",
  "stallion_id": "1074828353",
  "source": "ability_obtain_route",
  "verified_by_stallion_page": true
}
```

---

## 16. ability_details テーブル

才能詳細単位のテーブル。

1つの能力に複数の詳細があるため、能力本体とは分ける。

### カラム

| カラム | 型 | 内容 |
|---|---|---|
| detail_id | string | `{ability_id}_d{連番}` |
| ability_id | string | 能力ID |
| detail_index | number | 1始まりの連番 |
| detail_label | string | `才能詳細` / `才能詳細：その1` など |
| effect_raw | string | 発揮効果の生テキスト |
| condition_raw | string | 発揮条件の生テキスト |
| target_raw | string | 発揮対象の生テキスト |
| probability_raw | string | 発揮確率の生テキスト |
| probability_percent | number/null | 数値化できる場合の確率 |

### 例

```json
{
  "detail_id": "7132546838_d01",
  "ability_id": "7132546838",
  "detail_index": 1,
  "detail_label": "才能詳細",
  "effect_raw": "ゴールまで500m以内で、とても長い時間、脚が少し速くなり、その後、とても長い時間、脚が速くなる",
  "condition_raw": "馬場状態が良\n3000～3200m\n京都競馬場\n芝レース\n騎乗指示：差し",
  "target_raw": "自分",
  "probability_raw": "80%",
  "probability_percent": 80
}
```

---

## 17. ability_effects テーブル

効果1・効果2などを分けたい場合のテーブル。

### カラム

| カラム | 型 | 内容 |
|---|---|---|
| effect_id | string | `{detail_id}_e{連番}` |
| detail_id | string | 詳細ID |
| effect_no | number | 効果番号 |
| effect_raw | string | 効果本文 |
| requires_group_nos | number[] | 発揮に必要な条件グループ番号 |

### 例: 条件1を満たすと効果1、条件1と2を満たすと効果2

```json
{
  "effect_id": "8311613245_d01_e01",
  "detail_id": "8311613245_d01",
  "effect_no": 1,
  "effect_raw": "常時、脚が少し速くなり、スタミナが少し増える",
  "requires_group_nos": [1]
}
```

```json
{
  "effect_id": "8311613245_d01_e02",
  "detail_id": "8311613245_d01",
  "effect_no": 2,
  "effect_raw": "最後の直線で、やや長い時間、脚が速くなる",
  "requires_group_nos": [1, 2]
}
```

---

## 18. condition_groups テーブル

条件1・条件2などのグループを表す。

### カラム

| カラム | 型 | 内容 |
|---|---|---|
| group_id | string | `{detail_id}_g{連番}` |
| detail_id | string | 詳細ID |
| group_no | number | 条件番号。通常条件は1扱い |
| group_label | string | `条件1` / `条件2` / `通常条件` |
| group_raw | string | その条件グループの生テキスト |

### 例

```json
{
  "group_id": "8311613245_d01_g01",
  "detail_id": "8311613245_d01",
  "group_no": 1,
  "group_label": "条件1",
  "group_raw": "1600～2500m\n中山競馬場、東京競馬場、中京競馬場、大井競馬場\nコンディションが好調以上"
}
```

```json
{
  "group_id": "8311613245_d01_g02",
  "detail_id": "8311613245_d01",
  "group_no": 2,
  "group_label": "条件2",
  "group_raw": "騎乗指示：差し"
}
```

---

## 19. condition_rules テーブル

alasqlで一番使うことになる検索用テーブル。

条件を1ルール1行で持つ。

### カラム

| カラム | 型 | 内容 |
|---|---|---|
| rule_id | string | `{group_id}_r{連番}` |
| ability_id | string | 能力ID。JOIN簡略化用に冗長保持 |
| detail_id | string | 詳細ID |
| group_id | string | 条件グループID |
| group_no | number | 条件番号 |
| field | string | 条件種別 |
| op | string | 演算子 |
| value_text | string/null | 文字列値 |
| value_num | number/null | 数値値 |
| min_num | number/null | 範囲最小 |
| max_num | number/null | 範囲最大 |
| raw | string | 元の条件テキスト |
| parse_status | string | `parsed` / `raw_only` / `warning` |

### field 候補

| field | 内容 |
|---|---|
| going | 馬場状態 |
| distance | 距離 |
| course | 競馬場 |
| surface | 芝/ダート |
| tactic | 騎乗指示 |
| horse_condition | コンディション |
| race_name | レース名 |
| jockey | 騎手 |
| target | 発揮対象 |
| probability | 発揮確率 |
| special | その他未分類条件 |

### op 候補

| op | 意味 |
|---|---|
| include | 指定値を含む |
| exclude | 指定値を除外する |
| equals | 等しい |
| not_equals | 等しくない |
| range | 数値範囲内 |
| gte | 以上 |
| lte | 以下 |
| raw | 未分類の生条件 |

---

## 20. condition_rules の例

### 馬場状態が良

```json
{
  "rule_id": "7132546838_d01_g01_r01",
  "ability_id": "7132546838",
  "detail_id": "7132546838_d01",
  "group_id": "7132546838_d01_g01",
  "group_no": 1,
  "field": "going",
  "op": "include",
  "value_text": "良",
  "value_num": null,
  "min_num": null,
  "max_num": null,
  "raw": "馬場状態が良",
  "parse_status": "parsed"
}
```

### 馬場状態が良以外

```json
{
  "rule_id": "sample_d01_g01_r01",
  "ability_id": "sample",
  "detail_id": "sample_d01",
  "group_id": "sample_d01_g01",
  "group_no": 1,
  "field": "going",
  "op": "exclude",
  "value_text": "良",
  "value_num": null,
  "min_num": null,
  "max_num": null,
  "raw": "馬場状態が良以外",
  "parse_status": "parsed"
}
```

### 3000～3200m

```json
{
  "rule_id": "7132546838_d01_g01_r02",
  "ability_id": "7132546838",
  "detail_id": "7132546838_d01",
  "group_id": "7132546838_d01_g01",
  "group_no": 1,
  "field": "distance",
  "op": "range",
  "value_text": null,
  "value_num": null,
  "min_num": 3000,
  "max_num": 3200,
  "raw": "3000～3200m",
  "parse_status": "parsed"
}
```

### 京都競馬場

```json
{
  "rule_id": "7132546838_d01_g01_r03",
  "ability_id": "7132546838",
  "detail_id": "7132546838_d01",
  "group_id": "7132546838_d01_g01",
  "group_no": 1,
  "field": "course",
  "op": "include",
  "value_text": "京都競馬場",
  "value_num": null,
  "min_num": null,
  "max_num": null,
  "raw": "京都競馬場",
  "parse_status": "parsed"
}
```

### 騎乗指示：差し

```json
{
  "rule_id": "7132546838_d01_g01_r05",
  "ability_id": "7132546838",
  "detail_id": "7132546838_d01",
  "group_id": "7132546838_d01_g01",
  "group_no": 1,
  "field": "tactic",
  "op": "include",
  "value_text": "差し",
  "value_num": null,
  "min_num": null,
  "max_num": null,
  "raw": "騎乗指示：差し",
  "parse_status": "parsed"
}
```

### コンディションが好調以上

```json
{
  "rule_id": "8311613245_d01_g01_r03",
  "ability_id": "8311613245",
  "detail_id": "8311613245_d01",
  "group_id": "8311613245_d01_g01",
  "group_no": 1,
  "field": "horse_condition",
  "op": "gte",
  "value_text": "好調",
  "value_num": null,
  "min_num": null,
  "max_num": null,
  "raw": "コンディションが好調以上",
  "parse_status": "parsed"
}
```

### ドバイシーマクラシック

```json
{
  "rule_id": "6548431452_d01_g01_r01",
  "ability_id": "6548431452",
  "detail_id": "6548431452_d01",
  "group_id": "6548431452_d01_g01",
  "group_no": 1,
  "field": "race_name",
  "op": "include",
  "value_text": "ドバイシーマクラシック",
  "value_num": null,
  "min_num": null,
  "max_num": null,
  "raw": "ドバイシーマクラシック",
  "parse_status": "parsed"
}
```

---

## 21. なぜフラットテーブルにするか

alasqlでは、次のような絞り込みがしやすくなる。

```sql
SELECT *
FROM ? AS r
WHERE r.field = 'course'
  AND r.op = 'include'
  AND r.value_text = '京都競馬場'
```

中間テーブルがあるため、能力名や種牡馬IDにもJOINしやすい。

```sql
SELECT a.ability_id, a.ability_name, s.stallion_id, s.stallion_name
FROM ? AS a
JOIN ? AS ast ON a.ability_id = ast.ability_id
JOIN ? AS s ON ast.stallion_id = s.stallion_id
```

---

## 22. TypeScript型定義案

```ts
export type RuleField =
  | 'going'
  | 'distance'
  | 'course'
  | 'surface'
  | 'tactic'
  | 'horse_condition'
  | 'race_name'
  | 'jockey'
  | 'target'
  | 'probability'
  | 'special';

export type RuleOp =
  | 'include'
  | 'exclude'
  | 'equals'
  | 'not_equals'
  | 'range'
  | 'gte'
  | 'lte'
  | 'raw';

export interface NonordinaryBundle {
  meta: BundleMeta;
  abilities: AbilityRow[];
  stallions: StallionRow[];
  ability_stallions: AbilityStallionRow[];
  ability_details: AbilityDetailRow[];
  ability_effects: AbilityEffectRow[];
  condition_groups: ConditionGroupRow[];
  condition_rules: ConditionRuleRow[];
  parse_warnings: ParseWarningRow[];
}

export interface BundleMeta {
  schema_version: string;
  generated_at: string;
  source: string;
  source_policy: string;
  ability_type: string;
}

export interface AbilityRow {
  ability_id: string;
  ability_name: string;
  kana: string | null;
  ability_type: '非凡な才能';
  description: string;
  url: string;
  source_status: string;
  raw_text_hash: string | null;
}

export interface StallionRow {
  stallion_id: string;
  stallion_name: string;
  url: string;
  source: string;
}

export interface AbilityStallionRow {
  ability_id: string;
  stallion_id: string;
  source: string;
  verified_by_stallion_page: boolean | null;
}

export interface AbilityDetailRow {
  detail_id: string;
  ability_id: string;
  detail_index: number;
  detail_label: string;
  effect_raw: string;
  condition_raw: string;
  target_raw: string;
  probability_raw: string;
  probability_percent: number | null;
}

export interface AbilityEffectRow {
  effect_id: string;
  detail_id: string;
  effect_no: number;
  effect_raw: string;
  requires_group_nos: number[];
}

export interface ConditionGroupRow {
  group_id: string;
  detail_id: string;
  group_no: number;
  group_label: string;
  group_raw: string;
}

export interface ConditionRuleRow {
  rule_id: string;
  ability_id: string;
  detail_id: string;
  group_id: string;
  group_no: number;
  field: RuleField;
  op: RuleOp;
  value_text: string | null;
  value_num: number | null;
  min_num: number | null;
  max_num: number | null;
  raw: string;
  parse_status: 'parsed' | 'raw_only' | 'warning';
}

export interface ParseWarningRow {
  ability_id: string;
  detail_id: string | null;
  raw: string;
  message: string;
}
```

---

## 23. 検索条件の正規化ルール

### 馬場状態

対象表記:

```txt
馬場状態が良
馬場状態が良以外
良馬場
良馬場以外
馬場状態が稍重
馬場状態が重
馬場状態が不良
```

正規化:

| 元テキスト | field | op | value_text |
|---|---|---|---|
| 馬場状態が良 | going | include | 良 |
| 馬場状態が良以外 | going | exclude | 良 |
| 良馬場 | going | include | 良 |
| 良馬場以外 | going | exclude | 良 |

### 距離

対象表記:

```txt
3000～3200m
1600～2500m
2000m
1200、1600、2000m
```

正規化:

| 元テキスト | field | op | min_num | max_num |
|---|---|---:|---:|---:|
| 3000～3200m | distance | range | 3000 | 3200 |
| 2000m | distance | range | 2000 | 2000 |

複数距離の場合は複数行に展開する。

### 競馬場

対象表記:

```txt
京都競馬場
中山競馬場、東京競馬場、中京競馬場、大井競馬場
```

複数競馬場は複数行に展開する。

```json
[
  { "field": "course", "op": "include", "value_text": "中山競馬場" },
  { "field": "course", "op": "include", "value_text": "東京競馬場" },
  { "field": "course", "op": "include", "value_text": "中京競馬場" },
  { "field": "course", "op": "include", "value_text": "大井競馬場" }
]
```

### 芝/ダート

| 元テキスト | field | op | value_text |
|---|---|---|---|
| 芝レース | surface | include | 芝 |
| ダートレース | surface | include | ダート |
| 芝以外 | surface | exclude | 芝 |
| ダート以外 | surface | exclude | ダート |

### 騎乗指示

| 元テキスト | field | op | value_text |
|---|---|---|---|
| 騎乗指示：逃げ | tactic | include | 逃げ |
| 騎乗指示：先行 | tactic | include | 先行 |
| 騎乗指示：差し | tactic | include | 差し |
| 騎乗指示：追込 | tactic | include | 追込 |
| 騎乗指示：差し以外 | tactic | exclude | 差し |

### コンディション

| 元テキスト | field | op | value_text |
|---|---|---|---|
| コンディションが好調以上 | horse_condition | gte | 好調 |
| コンディションが絶好調 | horse_condition | equals | 絶好調 |
| コンディションが絶好調以外 | horse_condition | not_equals | 絶好調 |

### レース名

レース名は距離・競馬場へ分解しない。

理由:

```txt
レース名指定は、そのレース限定条件である可能性が高い。
距離や競馬場だけに分解すると、別レースまでヒットする危険がある。
```

例:

```json
{
  "field": "race_name",
  "op": "include",
  "value_text": "ドバイシーマクラシック"
}
```

---

## 24. 条件のAND/OR解釈

### 同じfield内のincludeはOR

例:

```txt
中山競馬場、東京競馬場、中京競馬場、大井競馬場
```

これは以下と同じ。

```txt
中山競馬場 OR 東京競馬場 OR 中京競馬場 OR 大井競馬場
```

### 異なるfieldはAND

例:

```txt
2000～2400m
芝レース
騎乗指示：先行
```

これは以下と同じ。

```txt
距離が2000〜2400m
AND 芝
AND 先行
```

### 複数detailsはOR

```txt
才能詳細：その1 に一致
OR
才能詳細：その2 に一致
```

同じ能力内でも、どのdetailに一致したかは検索結果に残す。

### 条件1・条件2は段階条件

例:

```txt
効果1: 条件1を満たすと発揮
効果2: 条件1、2を満たすと発揮
```

この場合:

```txt
条件1だけ一致 → 効果1のみ候補
条件1と条件2が一致 → 効果1と効果2が候補
```

---

## 25. alasqlでの検索例

### 能力名から検索

```ts
const result = alasql(
  `SELECT * FROM ? WHERE ability_name LIKE ?`,
  [bundle.abilities, '%虎視眈々%']
);
```

### 種牡馬IDから、その種牡馬が持つ非凡を取得

```ts
const result = alasql(
  `SELECT a.ability_id, a.ability_name, s.stallion_id, s.stallion_name
   FROM ? AS ast
   JOIN ? AS a ON ast.ability_id = a.ability_id
   JOIN ? AS s ON ast.stallion_id = s.stallion_id
   WHERE s.stallion_id = ?`,
  [
    bundle.ability_stallions,
    bundle.abilities,
    bundle.stallions,
    '1074828353'
  ]
);
```

### 京都競馬場で発揮する可能性がある非凡を取得

```ts
const result = alasql(
  `SELECT DISTINCT a.ability_id, a.ability_name, d.detail_id, d.detail_label
   FROM ? AS r
   JOIN ? AS a ON r.ability_id = a.ability_id
   JOIN ? AS d ON r.detail_id = d.detail_id
   WHERE r.field = 'course'
     AND r.op = 'include'
     AND r.value_text = ?`,
  [
    bundle.condition_rules,
    bundle.abilities,
    bundle.ability_details,
    '京都競馬場'
  ]
);
```

### 「良以外」の条件を持つ非凡を取得

```ts
const result = alasql(
  `SELECT DISTINCT a.ability_id, a.ability_name, d.detail_id, d.detail_label
   FROM ? AS r
   JOIN ? AS a ON r.ability_id = a.ability_id
   JOIN ? AS d ON r.detail_id = d.detail_id
   WHERE r.field = 'going'
     AND r.op = 'exclude'
     AND r.value_text = '良'`,
  [
    bundle.condition_rules,
    bundle.abilities,
    bundle.ability_details
  ]
);
```

---

## 26. 実レース条件とのマッチングはTypeScript側関数推奨

alasqlだけで完全な条件一致判定を書くと複雑になる。

そのため、alasqlは候補抽出に使い、最終判定はTypeScript関数で行うのがよい。

### 入力例

```ts
export interface RaceSearchInput {
  race_name?: string | null;
  distance?: number | null;
  course?: string | null;
  surface?: '芝' | 'ダート' | null;
  going?: '良' | '稍重' | '重' | '不良' | null;
  tactic?: '逃げ' | '先行' | '差し' | '追込' | null;
  horse_condition?: '絶不調' | '不調' | '普通' | '好調' | '絶好調' | null;
  jockey?: string | null;
}
```

### ルール判定関数例

```ts
function matchRule(input: RaceSearchInput, rule: ConditionRuleRow): boolean {
  const v = getInputValue(input, rule.field);

  if (rule.op === 'raw') {
    // 未分類条件は自動一致にしない。
    // 候補としては残すが、最終結果では warning 扱いにする。
    return true;
  }

  if (v == null) {
    // 入力がない項目は絞り込み不能。
    // 厳密検索なら false、候補検索なら true にする。
    return true;
  }

  switch (rule.op) {
    case 'include':
    case 'equals':
      return String(v) === rule.value_text;

    case 'exclude':
    case 'not_equals':
      return String(v) !== rule.value_text;

    case 'range':
      if (typeof v !== 'number') return false;
      return rule.min_num != null && rule.max_num != null
        ? rule.min_num <= v && v <= rule.max_num
        : false;

    case 'gte':
      return compareRank(rule.field, String(v), String(rule.value_text)) >= 0;

    case 'lte':
      return compareRank(rule.field, String(v), String(rule.value_text)) <= 0;

    default:
      return false;
  }
}
```

### コンディション順位

```ts
const HORSE_CONDITION_RANK: Record<string, number> = {
  '絶不調': 1,
  '不調': 2,
  '普通': 3,
  '好調': 4,
  '絶好調': 5,
};
```

---

## 27. 最終検索結果の返却形式案

```ts
export interface MatchedNonordinaryAbility {
  ability_id: string;
  ability_name: string;
  detail_id: string;
  detail_label: string;
  matched_group_nos: number[];
  matched_effect_ids: string[];
  source_stallions: Array<{
    stallion_id: string;
    stallion_name: string;
  }>;
  warnings: string[];
}
```

返却例:

```json
{
  "ability_id": "7132546838",
  "ability_name": "虎視眈々",
  "detail_id": "7132546838_d01",
  "detail_label": "才能詳細",
  "matched_group_nos": [1],
  "matched_effect_ids": [],
  "source_stallions": [
    {
      "stallion_id": "1074828353",
      "stallion_name": "マヤノトップガン1997"
    }
  ],
  "warnings": []
}
```

---

## 28. パース時の注意点

### 1. 見出し文字列に依存しすぎない

`発揮効果`、`発揮条件`、`発揮対象`、`発揮確率` の順番を基本とするが、HTML構造変更に備えて本文rawを保存する。

### 2. 「条件1」「条件2」を壊さない

条件番号は意味を持つため、単純に1つの条件リストへ潰さない。

### 3. 複数競馬場は複数ruleへ展開する

1行に配列で持つより、alasqlでは複数行のほうが検索しやすい。

### 4. 未分類条件を捨てない

判定不能な条件は `field: special`, `op: raw`, `parse_status: raw_only` として保存する。

例:

```json
{
  "field": "special",
  "op": "raw",
  "value_text": null,
  "raw": "自分が一定の順位にいるか",
  "parse_status": "raw_only"
}
```

---

## 29. 取得頻度と負荷対策

```txt
- HTMLは必ずローカルキャッシュする
- 既に保存済みのHTMLは基本的に再取得しない
- 更新確認は1日1回程度にする
- 連続アクセスには必ずsleepを入れる
- User-Agentを明示する
- 取得エラー時は即リトライ連打しない
```

推奨sleep:

```txt
1ページごとに1〜3秒
```

---

## 30. エラー処理

### 取得エラー

```json
{
  "url": "https://dabimas.jp/kouryaku/abilities/7132546838.html",
  "status": "fetch_error",
  "http_status": 500,
  "message": "failed to fetch ability page"
}
```

### パースエラー

```json
{
  "ability_id": "7132546838",
  "status": "parse_warning",
  "message": "発揮確率を数値化できませんでした",
  "raw": "発揮確率 raw text"
}
```

### 検証エラー

```json
{
  "ability_id": "7132546838",
  "stallion_id": "1074828353",
  "status": "validation_warning",
  "message": "種牡馬ページ側で非凡な才能を確認できませんでした"
}
```

---

## 31. 最低限の実装完了条件

MVPとしては、以下を満たせばよい。

```txt
- 非凡な才能ID一覧を取得できる
- 能力詳細ページHTMLを保存できる
- ability_id / ability_name / kana / description を取れる
- 入手経路から stallion_id / stallion_name を取れる
- 発揮効果 / 発揮条件 / 発揮対象 / 発揮確率 のrawを取れる
- condition_rules に距離・競馬場・芝ダート・馬場・騎乗指示を展開できる
- nonordinary_abilities_bundle.json を出力できる
```

この段階では、未分類条件は `special/raw` でよい。

---

## 32. 推奨する実装順

```txt
1. まず1件の能力詳細ページを手動HTML保存してparserを作る
2. 入手経路からstallion_idを抜く
3. 発揮条件rawを抜く
4. condition_rulesへ展開する
5. 3件程度でテストする
   - 単純条件の例
   - 条件1/条件2がある例
   - 才能詳細：その1/その2がある例
6. Playwrightで非凡ID一覧を取る
7. 全件取得する
8. parse_warningsを見ながら正規化ルールを増やす
9. 種牡馬ページとの相互検証を追加する
10. alasql用bundleを出力する
```

---

## 33. 実装者への重要メモ

- `ability_id` と `stallion_id` は数値ではなく **string** として扱う。
- `detail_id`, `group_id`, `rule_id` は検索・JOINしやすいように安定したIDを生成する。
- raw文字列を消さない。
- 正規化できない条件を捨てない。
- 検索条件の「以外」は `exclude` / `not_equals` として保持する。
- レース名指定は距離や競馬場へ分解しない。
- `alasql` で完全な条件判定をやり切ろうとせず、最終マッチはTypeScript関数で行う。

---

## 34. 参考として確認したURL

```txt
https://dabimas.jp/kouryaku/abilities/
https://dabimas.jp/kouryaku/abilities/7132546838.html
https://dabimas.jp/kouryaku/stallions/1074828353.html
https://dabimas.jp/kouryaku/abilities/8311613245.html
https://dabimas.jp/kouryaku/abilities/6548431452.html
```

---

## 35. この仕様で得られる最終的な使い方

### 条件から非凡を探す

```txt
入力:
- 京都競馬場
- 芝
- 3000m
- 良
- 差し

出力:
- 条件に該当する非凡な才能
- その非凡を持っている種牡馬ID
- 発揮条件raw
- 発揮効果raw
```

### 種牡馬IDから持っている非凡を探す

```txt
入力:
- stallion_id = 1074828353

出力:
- 虎視眈々
- ability_id = 7132546838
```

### 「良以外」のような否定条件も検索できる

```txt
condition_rules で
field = going
op = exclude
value_text = 良
を検索する。
```

---

以上。
