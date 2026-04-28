# ダビマス全書「非凡な才能」取得仕様 追補：フロント検索条件・レースドロップダウン

作成日: 2026-04-25  
対象: ダビマス全書 `https://dabimas.jp/kouryaku/abilities/`  
対象範囲: **データ取得〜JSON出力のみ**  
フロント想定: **alasql + TypeScript**

---

## 1. この追補で決めること

この仕様は、既存の「非凡な才能」データ取得仕様に対して、以下を追加する。

- フロント側で表示する検索条件
- フロント側では表示しない検索条件
- ダビマス全書の才能検索画面にある「レース」ドロップダウンの選択肢
- alasqlで扱いやすいJSON形式
- 「条件指定なし」を含む複数選択の考え方
- レース選択時の内部判定方針

---

## 2. フロント側に表示する検索条件

フロント側では、以下の条件のみを表示する。

```txt
騎乗指示
レース
馬場状態
天候
```

画像イメージに合わせると、表示項目は次の通り。

```txt
騎乗指示
- 条件指定なし
- 逃げ
- 先行
- 差し
- 追込
- マーク

レース
- すべて
- フェブラリーステークス
- 高松宮記念
- ...
- 東京大賞典

馬場状態
- 条件指定なし
- 良
- 稍重
- 重
- 不良

天候
- 条件指定なし
- 晴
- 曇
- 雨
- 雪
```

---

## 3. フロント側に表示しない条件

以下はフロント画面には表示しない。

```txt
競馬場
コース
距離
```

ただし、データ側から完全に消してはいけない。

理由は、非凡な才能の発揮条件には以下のような条件が出るため。

```txt
東京競馬場
京都競馬場
芝レース
ダートレース
1200m
1600～2400m
```

そのため、フロントには表示しないが、内部判定用データとしては保持する。

---

## 4. レース選択時の内部展開

ユーザーがレースを選択した場合、フロントは `race_id` を検索条件として持つ。

その後、検索処理側で `race_id` から `races` テーブルを参照し、内部的に以下へ展開する。

```txt
race_name
racecourse
surface
distance
```

例:

```json
{
  "race_id": "7265243177",
  "race_name": "ジャパンカップ",
  "racecourse": "東京",
  "surface": "芝",
  "distance": 2400
}
```

フロント画面には `東京 / 芝 / 2400m` を出さなくてもよい。  
ただし、非凡条件との照合には使う。

### 4.1 `race_id` は直接照合に使わない

重要: `race_id` は、**フロントの選択値**および**レースマスター参照キー**としてのみ使う。

非凡な才能の発揮条件との照合では、`race_id` そのものを条件にしない。

```txt
NG:
  condition_rules.field = race_id
  race_id = 5854123610 で非凡を直接検索する

OK:
  race_id から races テーブルを引く
  race_name / racecourse / surface / distance に展開する
  展開後の値で condition_rules と照合する
```

例: フロントで「フェブラリーステークス」を選択した場合。

```json
{
  "race_id": "5854123610",
  "race_name": "フェブラリーステークス"
}
```

検索処理では `races` テーブルを参照し、内部的に次のような検索コンテキストへ展開する。

```json
{
  "race_name": "フェブラリーステークス",
  "racecourse": "東京",
  "surface": "ダート",
  "distance": 1600
}
```

そのうえで、非凡側の `condition_rules` に対して以下を判定する。

```txt
race_name  が一致するか
racecourse が一致するか
surface    が一致するか
distance   が範囲内か
```

つまり、ユーザーは「フェブラリーステークス」を選ぶだけだが、内部では「フェブラリーステークス / 東京 / ダート / 1600m」として扱う。

### 4.2 レース名条件も必ず残す

レース選択時は、競馬場・コース・距離だけに展開して終わりにしない。

非凡な才能の発揮条件には、以下のように**レース名そのもの**が条件として出る可能性がある。

```txt
フェブラリーステークス
ドバイワールドカップ
帝王賞
凱旋門賞
ドバイワールドカップ以外
帝王賞以外
```

そのため、検索コンテキストには必ず `race_name` も含める。

```ts
export interface SearchContextRace {
  race_id: string | null;
  race_name: string | null;
  racecourse: string | null;
  surface: '芝' | 'ダート' | null;
  distance: number | null;
}
```

`race_id` は保持してよいが、これは結果表示・デバッグ・元レース参照用であり、非凡条件の直接照合キーではない。

---

## 5. レースドロップダウンの考え方

ここで扱うレースは、ダビマス全書の `/kouryaku/races/` に載っている全レースではない。

対象は、**ダビマス全書の才能検索画面にある「レース」ドロップダウンの選択肢**とする。

つまり、以下のように考える。

```txt
全レース一覧
  ≠ 才能検索画面のレース選択肢
```

この仕様では、才能検索画面側のドロップダウンを正とする。

---

## 6. レースドロップダウン候補

### 6.1 表示順

表示順は、ダビマス全書の才能検索画面にある `select > option` の順番を正とする。

### 6.2 選択肢一覧

`すべて` は実レースではなく、レース未指定を意味する特別値として扱う。

```json
[
  { "sort_order": 0, "race_id": null, "race_name": "すべて", "is_all": true },

  { "sort_order": 1, "race_id": "5854123610", "race_name": "フェブラリーステークス", "is_all": false },
  { "sort_order": 2, "race_id": "8214958362", "race_name": "高松宮記念", "is_all": false },
  { "sort_order": 3, "race_id": "0264175318", "race_name": "アルクォズスプリント", "is_all": false },
  { "sort_order": 4, "race_id": "3614530287", "race_name": "ドバイターフ", "is_all": false },
  { "sort_order": 5, "race_id": "3452701876", "race_name": "ドバイシーマクラシック", "is_all": false },
  { "sort_order": 6, "race_id": "8407065213", "race_name": "ドバイゴールデンシャヒーン", "is_all": false },
  { "sort_order": 7, "race_id": "6587031462", "race_name": "ドバイワールドカップ", "is_all": false },
  { "sort_order": 8, "race_id": "1804725356", "race_name": "大阪杯", "is_all": false },
  { "sort_order": 9, "race_id": "3452921386", "race_name": "桜花賞", "is_all": false },
  { "sort_order": 10, "race_id": "2264185315", "race_name": "皐月賞", "is_all": false },
  { "sort_order": 11, "race_id": "2214957369", "race_name": "クイーンエリザベス２世カップ", "is_all": false },
  { "sort_order": 12, "race_id": "1364823356", "race_name": "天皇賞(春)", "is_all": false },
  { "sort_order": 13, "race_id": "2315498266", "race_name": "ＮＨＫマイルカップ", "is_all": false },
  { "sort_order": 14, "race_id": "5612364288", "race_name": "ヴィクトリアマイル", "is_all": false },
  { "sort_order": 15, "race_id": "6558631422", "race_name": "オークス", "is_all": false },
  { "sort_order": 16, "race_id": "6315458266", "race_name": "日本ダービー", "is_all": false },
  { "sort_order": 17, "race_id": "6315468265", "race_name": "安田記念", "is_all": false },
  { "sort_order": 18, "race_id": "2865141533", "race_name": "宝塚記念", "is_all": false },
  { "sort_order": 19, "race_id": "0614539227", "race_name": "帝王賞", "is_all": false },
  { "sort_order": 20, "race_id": "4217621593", "race_name": "ジャパンダートダービー", "is_all": false },
  { "sort_order": 21, "race_id": "4218691513", "race_name": "スプリンターズステークス", "is_all": false },
  { "sort_order": 22, "race_id": "6548831412", "race_name": "凱旋門賞", "is_all": false },
  { "sort_order": 23, "race_id": "1384821356", "race_name": "秋華賞", "is_all": false },
  { "sort_order": 24, "race_id": "4962561838", "race_name": "菊花賞", "is_all": false },
  { "sort_order": 25, "race_id": "6315438268", "race_name": "天皇賞(秋)", "is_all": false },
  { "sort_order": 26, "race_id": "7467539712", "race_name": "エリザベス女王杯", "is_all": false },
  { "sort_order": 27, "race_id": "6547731432", "race_name": "マイルチャンピオンシップ", "is_all": false },
  { "sort_order": 28, "race_id": "7265243177", "race_name": "ジャパンカップ", "is_all": false },
  { "sort_order": 29, "race_id": "4217693503", "race_name": "チャンピオンズカップ", "is_all": false },
  { "sort_order": 30, "race_id": "6407265213", "race_name": "阪神ジュベナイルフィリーズ", "is_all": false },
  { "sort_order": 31, "race_id": "7765243190", "race_name": "香港スプリント", "is_all": false },
  { "sort_order": 32, "race_id": "6507931452", "race_name": "香港マイル", "is_all": false },
  { "sort_order": 33, "race_id": "2614539207", "race_name": "香港カップ", "is_all": false },
  { "sort_order": 34, "race_id": "5912364078", "race_name": "香港ヴァーズ", "is_all": false },
  { "sort_order": 35, "race_id": "4217675503", "race_name": "朝日杯フューチュリティステークス", "is_all": false },
  { "sort_order": 36, "race_id": "7865243108", "race_name": "ホープフルステークス", "is_all": false },
  { "sort_order": 37, "race_id": "6557031492", "race_name": "有馬記念", "is_all": false },
  { "sort_order": 38, "race_id": "5912364276", "race_name": "東京大賞典", "is_all": false }
]
```

---

## 7. 実装時の取得方針

### 7.1 固定リストを手書きしない

上記のレース候補は仕様上の初期値として使える。  
ただし、実装では固定リストにせず、可能なら毎回または更新時にダビマス全書の検索画面から取得する。

理由は、将来ドロップダウンの中身が変わる可能性があるため。

### 7.2 Playwrightで取得する

Python実装の場合、Playwrightで以下を取得する。

```python
from playwright.sync_api import sync_playwright

def collect_race_options():
    url = "https://dabimas.jp/kouryaku/abilities/"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url, wait_until="networkidle")

        # 「さらに絞り込む」などでselectが非表示の場合は、必要に応じてクリックする
        # page.click("text=さらに絞り込む")

        options = page.locator("select option").evaluate_all("""
        options => options.map((option, index) => ({
            sort_order: index,
            race_id: option.value || null,
            race_name: option.textContent.trim(),
            is_all: option.value === "" || option.textContent.trim() === "すべて"
        }))
        """)

        browser.close()
        return options
```

注意: `select` が複数ある場合は、レース選択用の `select` に絞り込む。  
実装時には、`select` の周辺テキストや親要素を確認してセレクタを固定する。

---

## 8. フロント条件のJSON

フロント検索条件は、以下の形で持つ。

```ts
export type RaceId = string | null;

export type TacticValue =
  | 'none'
  | 'nige'
  | 'senko'
  | 'sashi'
  | 'oikomi'
  | 'mark';

export type GoingValue =
  | 'none'
  | '良'
  | '稍重'
  | '重'
  | '不良';

export type WeatherValue =
  | 'none'
  | '晴'
  | '曇'
  | '雨'
  | '雪';

export interface SearchInput {
  race_id: RaceId;

  /**
   * 複数選択可能。
   * 'none' は「条件指定なし」を意味する。
   */
  tactics: TacticValue[];

  /**
   * 複数選択可能。
   * 'none' は「条件指定なし」を意味する。
   */
  going: GoingValue[];

  /**
   * 複数選択可能。
   * 'none' は「条件指定なし」を意味する。
   */
  weather: WeatherValue[];
}
```

例:

```json
{
  "race_id": "6557031492",
  "tactics": ["sashi", "oikomi", "none"],
  "going": ["良", "稍重", "none"],
  "weather": ["晴", "曇", "none"]
}
```

---

## 9. 「条件指定なし」の意味

`条件指定なし` は、単純なワイルドカードではなく、**その項目に条件が書かれていない非凡も検索対象に含める**という意味で扱う。

例:

```txt
馬場状態: 良 + 条件指定なし
```

この場合にヒットさせるもの。

```txt
馬場状態が良の非凡
馬場状態の指定がない非凡
```

ヒットさせないもの。

```txt
馬場状態が稍重のみの非凡
馬場状態が重のみの非凡
馬場状態が不良のみの非凡
馬場状態が良以外の非凡
```

ただし、ユーザーが `良` ではなく `稍重` を選んだ場合は、`良以外` 条件はヒット候補になる。

---

## 10. 否定条件の扱い

以下のような条件に対応するため、条件ルールは `include / exclude` を持つ。

```txt
良以外
東京競馬場以外
ドバイワールドカップ以外
逃げ以外
```

alasql向けの `condition_rules` は、以下のようなフラット形式にする。

```json
{
  "ability_id": "1234567890",
  "detail_id": "1234567890:detail:1",
  "condition_group_id": "1234567890:detail:1:condition:1",
  "field": "going",
  "operator": "exclude",
  "value_text": "良",
  "value_number": null,
  "min_number": null,
  "max_number": null
}
```

---

## 11. フィールド定義

### 11.1 condition_rules.field

```ts
export type ConditionField =
  | 'race_name'
  | 'racecourse'
  | 'surface'
  | 'distance'
  | 'tactic'
  | 'going'
  | 'weather'
  | 'horse_condition'
  | 'jockey'
  | 'special';
```

### 11.2 condition_rules.operator

```ts
export type ConditionOperator =
  | 'include'
  | 'exclude'
  | 'range_include'
  | 'range_exclude'
  | 'gte'
  | 'lte'
  | 'eq'
  | 'raw';
```

---

## 12. 騎乗指示の表示名と内部値

フロント表示は、ゲーム画面に合わせて以下にする。

```json
[
  { "value": "none", "label": "条件指定なし" },
  { "value": "nige", "label": "逃げ" },
  { "value": "senko", "label": "先行" },
  { "value": "sashi", "label": "差し" },
  { "value": "oikomi", "label": "追込" },
  { "value": "mark", "label": "マーク" }
]
```

ただし、ダビマス全書や既存抽出コード上で `自在` のような表記が出る可能性がある。  
そのため、正規化時は以下のエイリアスを持つ。

```json
{
  "逃げ": "nige",
  "先行": "senko",
  "差し": "sashi",
  "追込": "oikomi",
  "マーク": "mark",
  "自在": "mark"
}
```

---

## 13. 馬場状態の表示名と内部値

```json
[
  { "value": "none", "label": "条件指定なし" },
  { "value": "良", "label": "良" },
  { "value": "稍重", "label": "稍重" },
  { "value": "重", "label": "重" },
  { "value": "不良", "label": "不良" }
]
```

---

## 14. 天候の表示名と内部値

```json
[
  { "value": "none", "label": "条件指定なし" },
  { "value": "晴", "label": "晴" },
  { "value": "曇", "label": "曇" },
  { "value": "雨", "label": "雨" },
  { "value": "雪", "label": "雪" }
]
```

---

## 15. alasql向けテーブル構成

### 15.1 `race_filter_options`

才能検索画面のレースドロップダウン候補。

```ts
export interface RaceFilterOption {
  sort_order: number;
  race_id: string | null;
  race_name: string;
  is_all: boolean;
}
```

### 15.2 `races`

レースの詳細マスター。

```ts
export interface Race {
  race_id: string;
  race_name: string;
  racecourse: string | null;
  surface: '芝' | 'ダート' | null;
  distance: number | null;
  raw_course: string | null;
  source_url: string | null;
}
```

`race_filter_options` にはあるが、`races` の詳細取得に失敗した場合は、`race_id` と `race_name` だけでも保持する。

### 15.3 `abilities`

```ts
export interface Ability {
  ability_id: string;
  ability_name: string;
  kana: string | null;
  ability_type: '非凡な才能' | '特化非凡' | string;
  description: string | null;
  source_url: string;
}
```

### 15.4 `ability_stallions`

非凡な才能と、その入手経路にある種牡馬IDの対応。

```ts
export interface AbilityStallion {
  ability_id: string;
  stallion_id: string;
  stallion_name: string;
  source: 'ability_obtain_route' | 'stallion_page_validation';
}
```

### 15.5 `ability_details`

```ts
export interface AbilityDetail {
  detail_id: string;
  ability_id: string;
  detail_order: number;
  detail_label: string;
  effect_raw: string | null;
  condition_raw: string | null;
  target_raw: string | null;
  probability_raw: string | null;
  probability_percent: number | null;
}
```

### 15.6 `condition_rules`

```ts
export interface ConditionRule {
  rule_id: string;
  ability_id: string;
  detail_id: string;
  condition_group_id: string;
  field: ConditionField;
  operator: ConditionOperator;
  value_text: string | null;
  value_number: number | null;
  min_number: number | null;
  max_number: number | null;
  raw_text: string;
}
```

---

## 16. 出力JSONバンドル

最終出力は、alasqlに流し込みやすいようにフラットな配列を束ねた形にする。

```json
{
  "meta": {
    "generated_at": "2026-04-25T00:00:00+09:00",
    "source": "dabimas.jp/kouryaku/abilities",
    "schema_version": "1.2.0"
  },
  "race_filter_options": [],
  "races": [],
  "abilities": [],
  "stallions": [],
  "ability_stallions": [],
  "ability_details": [],
  "condition_rules": [],
  "parse_warnings": []
}
```

---

## 17. alasql投入例

```ts
import alasql from 'alasql';
import bundle from './nonordinary_abilities_bundle.json';

alasql('CREATE TABLE race_filter_options');
alasql('CREATE TABLE races');
alasql('CREATE TABLE abilities');
alasql('CREATE TABLE ability_stallions');
alasql('CREATE TABLE ability_details');
alasql('CREATE TABLE condition_rules');

alasql.tables.race_filter_options.data = bundle.race_filter_options;
alasql.tables.races.data = bundle.races;
alasql.tables.abilities.data = bundle.abilities;
alasql.tables.ability_stallions.data = bundle.ability_stallions;
alasql.tables.ability_details.data = bundle.ability_details;
alasql.tables.condition_rules.data = bundle.condition_rules;
```

---

## 18. 検索入力例

```ts
const input: SearchInput = {
  race_id: '6557031492',
  tactics: ['sashi', 'oikomi', 'none'],
  going: ['良', 'none'],
  weather: ['晴', '曇', 'none']
};
```

---

## 19. レース選択時の検索準備

`input.race_id` は、まず `races` テーブルを参照するために使う。

```ts
const selectedRace = input.race_id
  ? alasql('SELECT * FROM races WHERE race_id = ?', [input.race_id])[0]
  : null;
```

`selectedRace` がある場合、検索用の内部コンテキストを作る。

```ts
export interface SearchContext {
  race_id: string | null;
  race_name: string | null;
  racecourse: string | null;
  surface: '芝' | 'ダート' | null;
  distance: number | null;
  tactics: TacticValue[];
  going: GoingValue[];
  weather: WeatherValue[];
}

export function buildSearchContext(input: SearchInput): SearchContext {
  const selectedRace = input.race_id
    ? alasql('SELECT * FROM races WHERE race_id = ?', [input.race_id])[0]
    : null;

  return {
    race_id: input.race_id,

    // ここから下が非凡条件との照合に使う値。
    // race_id 自体は直接照合しない。
    race_name: selectedRace?.race_name ?? null,
    racecourse: selectedRace?.racecourse ?? null,
    surface: selectedRace?.surface ?? null,
    distance: selectedRace?.distance ?? null,

    tactics: input.tactics,
    going: input.going,
    weather: input.weather,
  };
}
```

`selectedRace` がある場合、以下を照合条件に使う。

```txt
race_name
racecourse
surface
distance
```

### 19.1 フェブラリーステークスの展開例

入力:

```json
{
  "race_id": "5854123610",
  "tactics": ["sashi", "none"],
  "going": ["良", "none"],
  "weather": ["晴", "曇", "none"]
}
```

`races` テーブル:

```json
{
  "race_id": "5854123610",
  "race_name": "フェブラリーステークス",
  "racecourse": "東京",
  "surface": "ダート",
  "distance": 1600,
  "raw_course": "1600m(ダート)",
  "source_url": "https://dabimas.jp/kouryaku/races/5854123610.html"
}
```

内部検索コンテキスト:

```json
{
  "race_id": "5854123610",
  "race_name": "フェブラリーステークス",
  "racecourse": "東京",
  "surface": "ダート",
  "distance": 1600,
  "tactics": ["sashi", "none"],
  "going": ["良", "none"],
  "weather": ["晴", "曇", "none"]
}
```

この内部検索コンテキストを、非凡側の `condition_rules` と照合する。

```txt
race_id では直接検索しない。
フェブラリーステークス / 東京 / ダート / 1600m として検索する。
```

### 19.2 condition_rules 側の照合例

非凡条件が「東京競馬場」の場合:

```json
{
  "field": "racecourse",
  "operator": "include",
  "value_text": "東京",
  "value_number": null,
  "min_number": null,
  "max_number": null
}
```

検索コンテキストの `racecourse` が `東京` なので一致。

非凡条件が「ダートレース」の場合:

```json
{
  "field": "surface",
  "operator": "include",
  "value_text": "ダート",
  "value_number": null,
  "min_number": null,
  "max_number": null
}
```

検索コンテキストの `surface` が `ダート` なので一致。

非凡条件が「1400～1800m」の場合:

```json
{
  "field": "distance",
  "operator": "range_include",
  "value_text": null,
  "value_number": null,
  "min_number": 1400,
  "max_number": 1800
}
```

検索コンテキストの `distance` が `1600` なので一致。

非凡条件が「フェブラリーステークス」の場合:

```json
{
  "field": "race_name",
  "operator": "include",
  "value_text": "フェブラリーステークス",
  "value_number": null,
  "min_number": null,
  "max_number": null
}
```

検索コンテキストの `race_name` が `フェブラリーステークス` なので一致。

---

## 20. 条件照合はTypeScript側関数推奨

alasqlだけで全条件を判定しようとすると、`include / exclude / range` の組み合わせが複雑になる。  
そのため、alasqlは候補抽出とJOINに使い、最終判定はTypeScript関数で行う。

推奨方針:

```txt
alasql
  → abilities / details / rules をJOINして候補を取る

TypeScript
  → 1 detailごとに条件を判定する
  → 条件グループ単位で AND/OR を処理する
```

---

## 21. detail単位の判定方針

1つの `ability` に複数の `detail` がある場合がある。

例:

```txt
才能詳細：その1
才能詳細：その2
条件1
条件2
```

そのため、検索結果は能力単位だけでなく、どの `detail_id` が該当したかを返す。

```ts
export interface AbilitySearchResult {
  ability_id: string;
  ability_name: string;
  matched_details: {
    detail_id: string;
    detail_label: string;
    effect_raw: string | null;
    condition_raw: string | null;
    probability_percent: number | null;
  }[];
  stallions: {
    stallion_id: string;
    stallion_name: string;
  }[];
}
```

---

## 22. 「すべて」選択時の扱い

`race_id: null` の場合、レース名・競馬場・コース・距離による絞り込みは行わない。

ただし、ユーザーが馬場状態・天候・騎乗指示を選んでいる場合は、それらで絞り込む。

```json
{
  "race_id": null,
  "tactics": ["sashi", "none"],
  "going": ["良", "none"],
  "weather": ["晴", "none"]
}
```

---

## 23. レースドロップダウンの取得結果を保存する

取得したドロップダウン候補は以下へ保存する。

```txt
data/raw/official_search/race_filter_options.json
```

形式:

```json
[
  {
    "sort_order": 1,
    "race_id": "5854123610",
    "race_name": "フェブラリーステークス",
    "is_all": false
  }
]
```

---

## 24. レース詳細マスターの取得

`race_filter_options` で得た `race_id` を使い、以下のURLを取得する。

```txt
https://dabimas.jp/kouryaku/races/{race_id}.html
```

取得できる場合は、以下を `races` に保存する。

```txt
race_id
race_name
racecourse
surface
distance
raw_course
source_url
```

取得に失敗した場合は、`race_id` と `race_name` だけ保持し、`parse_warnings` に記録する。

---

## 25. 取得処理の推奨順

```txt
01. abilities検索画面を開く
02. レースドロップダウン候補を取得する
03. race_filter_options.json に保存する
04. race_id ごとに races/{race_id}.html を取得する
05. races テーブルを作成する
06. 非凡な才能ID一覧を取得する
07. 非凡詳細ページを保存する
08. 入手経路から種牡馬IDを取得する
09. 発揮条件を condition_rules に正規化する
10. nonordinary_abilities_bundle.json を出力する
```

---

## 26. 更新チェック

ダビマス全書側の検索画面が変わる可能性があるため、以下は更新チェック対象にする。

```txt
race_filter_options
ability_type options
tactic options
going options
weather options
```

特に `race_filter_options` は、固定値ではなく取得結果を保存・比較する。

差分検出例:

```txt
前回にない race_id が追加された
前回あった race_id が消えた
同じ race_id の race_name が変わった
表示順が変わった
```

差分があった場合は `validation_report.json` に出す。

---

## 27. 参考URL

```txt
ダビマス全書 才能一覧
https://dabimas.jp/kouryaku/abilities/

ダビマス全書 レース詳細URL形式
https://dabimas.jp/kouryaku/races/{race_id}.html
```

---

## 28. 重要な注意

この仕様で最も大事なのは、以下の分離。

```txt
フロントに見せる条件
  → 騎乗指示 / レース / 馬場状態 / 天候

内部で判定に使う条件
  → レース名 / 競馬場 / コース / 距離 / 騎乗指示 / 馬場状態 / 天候
```

さらに重要な分離は以下。

```txt
race_id
  → フロント選択値 / races参照キー / デバッグ用

race_name / racecourse / surface / distance
  → 非凡条件との照合に使う実体条件
```

つまり、ユーザーにはシンプルな条件だけ見せる。  
検索精度に必要な条件は、データ側で保持して裏側で使う。  
レース選択時は `race_id` で直接非凡を探さず、必ずレースマスターへ展開してから照合する。
