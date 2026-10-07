# R2 正本化 生成処理 設計書

版: 2026-10-07 第 2 版（§14 の未決事項を確定）
対象リポジトリ: dabimas-data（ダビ娘）
対象成果物: `json/horselist.json` / `json/factor.json` / `json/nonordinary_abilities_bundle.json` の利用側

関連資料:

- パイプライン側仕様: `C:\derby\data\pedigree_r2_pipeline\docs\stallion-master-weekly-integration-spec.md`（版 2026-09-22.9）
- 検証に使った R2 出力: `pedigree_r2_pipeline\runs\20261006T132619Z\output.zip`（dataset_version `2026-10-06T134646Z+raw.e7799a6df15e`）
- 試作変換スクリプト: セッションの scratchpad にある `r2_to_workbook.py`（本設計の実装時に正式化する）

---

## 1. 目的

これまでダビ娘のデータは、ダビマス全書（公式攻略サイト）を正本にしてきた。これを、ゲーム本体から取得して R2 に置いたデータ（以下 R2）を正本にする形へ切り替える。ダビマス全書は、R2 にない情報を補う側に回る。

あわせて、更新の頻度を次のように変える。

| 処理 | 頻度 | 入力 | 役割 |
|---|---|---|---|
| 日次生成 | 毎日 11:30（日本時間） | R2 | 馬一覧・能力値・血統・非凡と天性の詳細を作り、公開する |
| 週次取得 | 毎週金曜（現行どおり） | ダビマス全書 | 公式の馬 ID、非凡検索の条件データ、R2 にまだない馬を取り込む |

## 2. 決定事項

| No. | 項目 | 決定 |
|---|---|---|
| D1 | 正本 | R2 を正本とし、ダビマス全書は補完に使う |
| D2 | 日次の実行時刻 | 毎日 11:30（日本時間）。12:00 開始の馬は翌日の実行で出る |
| D3 | 公開判定の基準時刻 | 実際に動いた時刻ではなく、「その日の 11:30（日本時間）」に固定する |
| D4 | 公開日が仮の値（2030 年）の馬 | 他の馬と同じく日付で判定する。特別扱いはしない |
| D5 | レア度（究極）の判定 | 才能枠 5 かつ因子 3 つ → RareCd 8、才能枠 5 かつ因子 2 つ以下 → RareCd 7 |
| D6 | 特別レアリスト | 廃止する（D5 で置き換える） |
| D7 | 非凡検索 | R2 経路（非凡 ID で馬を引く）と公式経路（公式の馬 ID で馬を引く）の和集合 |
| D8 | 公式サイトが先行した馬 | R2 に該当馬がいなければ、ダビマス全書のデータで補う |
| D9 | R2 のみの馬の `HorseId` | `r` + 種牡馬 ID（牝馬は `rb` + 牝馬 ID） |
| D10 | 同名で絞り切れない馬の初回割り当て | 現行の `HorseId` を、`display_start_at` の古い順に R2 の候補へ割り当てる |

## 3. 全体の流れ

```text
[毎日 11:30 JST]                                   [毎週金曜]
 R2 公開 URL から 5 ファイル取得                     ダビマス全書を取得
   │                                                  │  workbook.json
   │                                                  │  site_metadata.json
   │                                                  │  nonordinary_abilities_bundle.json
   ▼                                                  ▼
 ① 入力検証（dataset_version 一致など）            ⑤ 公式馬 ↔ R2 種牡馬の紐付け
 ② 公開判定（11:30 で固定）                             → data/source/id_ledger.json を更新
 ③ R2 → 旧ソース形式に変換                          ⑥ 非凡の対応表を更新
 ④ 既存の generate_horselist で生成                     → data/source/ability_links.json
   │      ▲                                           │
   │      └── id_ledger.json / ability_links.json ────┘
   │          workbook.json（R2 にない馬の補完用）
   ▼
 前日と差分があればコミット → main への push で Pages デプロイ
```

日次生成は、週次で更新された台帳（⑤⑥）を読むだけにする。週次処理の実行中に日次処理が台帳を書き換えることはない。

## 4. 入力

### 4.1 R2（日次）

パイプラインが公開している URL から取得する。URL は GitHub の Secrets / Variables に置く。

| ファイル | 用途 | 必須 |
|---|---|---|
| `stallion_master.game.json` | 種牡馬・能力値・公開日 | ○ |
| `broodmare_master.game.json` | 牝馬・牝馬グレード | ○ |
| `pedigree_master.json` | 血統（父母）・系統・因子 | ○ |
| `pedigree_master.game.json` | node ごとの因子・subname | ○ |
| `ability_master.game.json` | 非凡・天性の名前・説明・詳細・レベル MAX | ○ |

`ability_conditions.raw.game.json` などの raw ファイルは使わない（紐付けが未確認のため）。

### 4.2 ダビマス全書（週次）

現行の `update-horse-data.yml` が作っている次の 3 ファイルを、引き続き週次で更新する。

- `data/source/workbook.json`
- `data/source/site_metadata.json`
- `json/nonordinary_abilities_bundle.json`

`workbook.json` の `special_rare` シートは D6 により使わなくなる。

## 5. 入力検証（停止条件）

次のいずれかに当たった場合は、生成を中止し、前日の成果物をそのまま残す。

1. 5 ファイルの `dataset_version` が一致しない
2. 種牡馬・牝馬の `node_id` / `pedigree_id` が血統データに存在しない
3. `nonordinary_ability_id` / `sub_ability_id`（0 以外）が `ability_master` に存在しない
4. 因子 ID（`pedigree_effect_ids`）に 1〜14 以外の値がある
5. 公開対象の種牡馬数が前日より 1% を超えて減った（誤った入力の検知）

次は中止せず、監査ログに記録する。

- 血統 15 枠のうち、祖先の母が null で辿れない枠（2026-10-07 の R2 で 0 件。§13 参照）
- 名前が同じ種牡馬が複数いて、公式の馬 ID と一意に紐付かないもの

## 6. 公開判定

`stallion_master.game.json` の `time_policy`（`display_start_at <= 現在時刻` なら表示対象）に従う。ただし「現在時刻」は、実行日の 11:30（日本時間）に固定する。

```text
cutoff = 実行日の 11:30 JST（= 02:30 UTC）
対象 = display_start_at が null  または  display_start_at <= cutoff   （種牡馬・牝馬とも）
```

- `display_start_at` が null の種牡馬（734 頭。初期からいる馬）は常に対象とする。
- 牝馬も同じ規則で判定する。R2 の `broodmare_master.game.json` は `schema_version: 6` から `display_start_at` を持つ。2026-10-08 に受け取ったサンプルでは、507 頭中 135 頭に日時が入り、7 頭が 2030 年（未公開）だった。それ以前の版では値がなく、全頭が公開扱いになる。
- 非凡・血統には公開日がないので、判定しない（公開された馬に付いて出る）。
- 手動で再実行するときは、`--as-of 2026-10-13` のように基準日を指定できるようにする。省略時は実行日の 11:30。
- **除外は、配合理論の計算より前に行う。** `horselist.json` には奇跡の母父候補など他の馬を参照する計算がある。表示だけ外すと、公開前の馬が候補として出てしまう。

判定例（10/13 の実行、cutoff = 2026-10-13 11:30 JST）:

| 馬 | display_start_at（日本時間） | 判定 |
|---|---|---|
| ダノンレジェンド-央瓏- など 3 頭 | 2026-10-13 0:00 | 対象 |
| アドミラルドレイク-瞬闘- など 3 頭 | 2026-10-13 12:00 | 対象外（10/14 の実行で対象） |
| マカヒキ など 5 頭 | 2030-01-01 0:00 | 対象外 |

## 7. R2 → 旧ソース形式への変換

既存の `generate_horselist.py` は、ダビマス全書の 112 列の行データ（`all` シート）を入力にしている。変換処理は R2 をこの形に変換し、生成ロジック自体（血統表・因子カウント・配合理論）はそのまま使う。

新規モジュール: `tools/horse_data/r2_source.py`

### 7.1 種牡馬の列対応

| 列 | 内容 | R2 の値 |
|---|---|---|
| COL_GENDER | 性別 | `"0"` |
| COL_SERIAL_NUMBER | 通し番号 | ID 台帳（§8） |
| COL_HORSE_ID | 馬 ID | ID 台帳（§8） |
| COL_RARE | レア | `rarity`（1〜5） |
| COL_HORSE_NAME | 馬名 | `name` |
| COL_PARENT_LINE | 自身の系統 | 父系を遡り、最初に `child_sire_line` を持つ血統の `child_sire_line.name` |
| COL_FACTOR_NAME_1〜3 | 自身の因子 | node の `pedigree_effect_ids`。空なら `pedigree_master` 側。最大 3 つ |
| COL_ICON | 左上アイコン | `header_badge.asset_key` |
| COL_DISTANCE_MIN | 距離 | `distance.min`〜`distance.max` |
| COL_GROWTH | 成長 | `growth` |
| COL_DIRT | ダート | `dirt`（△/〇/◎ → 1/2/3） |
| COL_HEALTH ほか 5 列 | 健康・気性・実績・底力・安定 | `health` / `temperament` / `achievement` / `potential` / `stability`（A/B/C → 1/2/3） |
| COL_RUNNING_STYLE | 脚質 | `running_style` |
| COL_ABILITY | 非凡名 | `ability_master` の `name` |
| COL_NAME_T〜 | 血統 15 枠の馬名 | `father_pedigree_id` / `mother_pedigree_id` を辿る。名前は `pedigree_name`、なければ `canonical_name` |
| COL_PARENT_LINE_T〜 | 15 枠の親系統 | 各祖先の父系を遡った `parent_sire_line.name` |
| COL_SON_T〜 | 15 枠の子系統 | 同 `child_sire_line.name` |
| COL_FACTOR_T1〜 | 15 枠の因子 | 各祖先の基本 node（`<pedigree_id>-00`）の `pedigree_effect_ids` |

15 枠の辿り方（`t` = 父、`h` = 母。馬から見て左から順に辿る）:
`t, tt, ttt, tttt, ttht, tht, thtt, thht, ht, htt, httt, htht, hht, hhtt, hhht`

因子の並び順は、R2 の `pedigree_effect_ids` の順（ID 昇順）とする。ダビマス全書とは表示順が異なる場合があるが、因子カウントと配合理論の結果は変わらない。

### 7.2 牝馬の列対応

| 列 | R2 の値 |
|---|---|
| COL_GENDER | `"1"` |
| COL_RARE / COL_ICON | `broodmare_grade.exchange_ticket_eligible` が false のとき、RARE に 1、ICON に `list_icn_cat_sale_{X:05,W:06,V:07,U:08,Y:09}.png`。true のときは両方空（→ RareCd `Z`「券」） |
| その他 | 馬名・系統・血統 15 枠は種牡馬と同じ |

検証では、牝馬のグレード分布が現行とほぼ一致した（Z: 現行 174 / R2 175、X: 41 / 47 など。差はR2側の新しい牝馬による）。

### 7.3 レア度の判定（D5・D6）

`generate_horselist.compute_rare_cd` を次のとおり変更する。

```text
種牡馬（Gender = "0"）:
  rarity が 5 でない        → rarity をそのまま返す
  アイコン 14              → "6"
  才能枠 5 かつ 因子 3 つ    → "8"（究極）
  才能枠 5 かつ 因子 2 つ以下 → "7"（究極）
  上記以外                 → "5"
```

- 才能枠は `stallion_master.game.json` の `talent_slot_count`、因子数は §7.1 の自身の因子の数。
- 変換時に才能枠を渡す列がないので、`all` シートの空き列（COL 22 など未使用列）を「才能枠」に割り当てる。ダビマス全書由来の行（§9.3）にはこの列がないため、従来のアイコン判定（12 → 8、11 → 7）を残す。
- `special_rare` シートと `build_special_rare_sets` は削除する。

検証結果（公式とR2が一意に紐付いた 2341 頭）:

| 条件 | 頭数 | 現行の RareCd |
|---|---|---|
| アイコン 12（才能枠 5・因子 3） | 629 | 全員 8 |
| アイコン 11（才能枠 5・因子 2 以下） | 222 | 全員 7 |
| アイコン 14（才能枠 4） | 64 | 全員 6 |
| 特別レアリストの 8 | 20 | 新規則でも全員 8 |
| 特別レアリストの 7 | 11 | 新規則でも全員 7 |

新規則で**究極に変わる馬が 15 頭**ある（コラボ系アイコンで才能枠 5 なのに、現行はレア 5）。特別レアリストの更新漏れと判断し、新規則の判定を採用する。

| 馬 | 新しい RareCd |
|---|---|
| スターアルタイル-瓏覇- / -瓏闘- / -翔燕- / -天煌- / -央天- | 8 |
| スターアルタイル-覇煌- | 7 |
| ティンガーラ-翔迅- / -央漸- | 8 |
| ティンガーラ2021 | 7 |
| ナッツクラッカー-翔燕- / チョコドリーム-央天- / ホワイトクリーム-翔燕- | 8 |
| ラブリィカヌレ-翔瑚- / フィナンシェハート-央獅- / ステラリユニオン-翔漸- | 8 |

### 7.4 非凡・天性のカード

`site_metadata.json` と同じ形のデータを R2 から作り、`--site-metadata` に渡す。キーは ID 台帳の `HorseId`。

| 項目 | R2 の値 |
|---|---|
| 非凡 | `nonordinary_ability_id` が指す能力 |
| 天性 | `sub_ability_id`（0 以外）が指す能力（`ability_type` が `innate`） |
| `name` / `description` | `name` / `description` |
| `detailUrl` | 公式の能力ページ URL が分かれば入れる。なければ空 |
| `detailTabs` | 下表 |

タブの作り方（公式サイトの表示に合わせる）:

| R2 の状態 | タブ |
|---|---|
| `level_max` がある | 「レベル 1」（`details`）と「レベル MAX」（`level_max.details`） |
| `details` が 2 件以上 | 「その1」「その2」… |
| それ以外 | 「詳細」 |

各タブの `effects` / `conditions` / `targets` / `probability` は、改行で分割し、行頭の全角・半角空白を除く。`probability` の行頭には「・」を付ける。

検証結果: 公式と名前で照合できた 1216 件のうち 1209 件で、4 項目すべてが一致した。残りは同名で版違いの非凡（運否天賦・快進撃）と、レベル別の確率表記の違い（公式は「60%〜70%」の範囲、R2 はレベルごとの値）のみ。

## 8. ID 台帳

### 8.1 必要な理由

`HorseId` は、埋め込み先のダビふぁくが「s/b + HorseId」でお気に入りなどを保存するキーになっている（`src/features/embed/model/embedMode.ts`）。ID が変わると、利用者のお気に入りが外れる。R2 の種牡馬 ID はダビマス全書の 10 桁 ID とは別物なので、対応を台帳で固定する。

### 8.2 台帳ファイル

`data/source/id_ledger.json`

```json
{
  "version": 1,
  "stallions": {
    "<game_stallion_id>": {"HorseId": "3315497239", "SerialNumber": "00001", "source": "official_link"}
  },
  "broodmares": {
    "<game_broodmare_id>": {"HorseId": "...", "SerialNumber": "...", "source": "..."}
  }
}
```

規則:

1. 一度割り当てた `HorseId` と `SerialNumber` は変えない。
2. 初回移行時、および週次処理で、公式の馬と R2 の馬を §8.3 の方法で紐付ける。一意に決まったものだけ、公式の 10 桁 ID を割り当てる（`source: official_link`）。
3. 公式に該当がない R2 の馬は、`r` + 種牡馬 ID の形で割り当てる（例: `r101250`。牝馬は `rb` + 牝馬 ID）。10 桁の数字は推測で作らない。
4. 2 の後で公式に同じ馬が載っても、`HorseId` は差し替えない。公式 ID は `legacy_ids` として併記し、非凡検索の公式経路（§10）だけに使う。
5. `SerialNumber` は性別ごとに、新しい馬に最大値 + 1 を割り当てる。

### 8.3 公式の馬と R2 の馬の紐付け

パイプライン側 `src/official_products.py` の `link_official_horses` と同じ方法で、次の順に候補を絞る。

1. 馬名（全角・半角、空白を正規化して比較）
2. レア度（公式の RareCd 6〜8 は 5 として比較）
3. 非凡の名前・説明文・効果の文面

検証結果（公式の種牡馬 2480 頭）:

| 結果 | 頭数 |
|---|---|
| 名前だけで一意 | 2167 |
| 名前 + レア度で一意 | 120 |
| 名前 + レア度 + 非凡で一意 | 54 |
| 絞り切れない | 139 |

絞り切れない 139 頭は、R2 側に名前・レア度・非凡がすべて同じ馬が複数いる場合（例: アイネスフウジンのレア 5・非凡なしが 3 頭）。これらは同じ馬の再販売と考えられる。

- 初回移行では、現行の `HorseId` を `display_start_at` の古い順に R2 の候補へ割り当てる。
  - 現行側の並び順は `SerialNumber` の小さい順とする。
  - R2 側で `display_start_at` が null の馬は最も古いものとして扱い、同じ日時どうしは `game_stallion_id` の小さい順とする。
  - 現行の頭数より R2 の候補が多い場合、残りは規則 3 で割り当てる。
- 割り当て結果は台帳に残し、以後は変えない。

## 9. ダビマス全書（週次）の役割

### 9.1 台帳の更新

§8.3 で新しく紐付いた馬を台帳に追加する。既存の割り当ては変えない。

### 9.2 非凡の対応表

`data/source/ability_links.json` に、公式の非凡 ID と R2 の非凡 ID の対応を出力する。

- 名前と説明文（全角・半角、空白を正規化）で照合する。
- 同名・同説明で複数ある場合は、効果・条件の文面で絞る。
- 文面で絞れない運否天賦と快進撃（各 2 版）は、`data/source/ability_links_override.json` に手で対応を書く。

検証結果: R2 の非凡 1238 種のうち 1210 種が一意に対応した。24 種は公式にまだない非凡（Velocity など）。

### 9.3 R2 にない馬の補完（D8）

公式の馬のうち、§8.3 で R2 に候補が 1 頭もいない馬は、ダビマス全書の行をそのまま `all` シートに加える。

- R2 に同名の馬がいて、公開日が未来のため除外されている場合は、補完しない（R2 の公開日を優先する）。
- R2 に候補がいるが絞り切れない場合も、補完しない（二重登録を防ぐ）。
- 補完した行は、次の日次生成で R2 に現れた時点で、自動的に R2 の行に置き換わる（台帳で同じ `HorseId` が引き継がれる）。

現時点では R2 の方が先行しており、補完対象は 0 頭。

## 10. 非凡検索

### 10.1 現状の問題

非凡検索（`src/features/nonordinary/lib/searchNonordinaryAbilities.ts`）は、bundle の `ability_stallions[].stallion_id`（公式の 10 桁 ID）で `horselist.json` の馬を探している。R2 にしかない馬や、台帳で `r` から始まる ID になった馬は見つからない。

### 10.2 変更内容

`horselist.json` の各馬に、R2 の非凡 ID を持たせる。

```text
record.card.abilityGameId = "10254"   // nonordinary_ability_id。なければ null
```

bundle に `ability_game_links`（§9.2 の対応表）を加える。

```text
bundle.ability_game_links = [{ "ability_id": "8810303245", "game_ability_id": "10254" }, ...]
```

検索で非凡に一致した後、馬を次の 2 経路で集め、`HorseId` で重複を除く。

1. **R2 経路:** 公式の非凡 ID → `ability_game_links` → R2 の非凡 ID → `card.abilityGameId` が一致する馬
2. **公式経路:** 公式の非凡 ID → `ability_stallions[].stallion_id` → `HorseId` または台帳の `legacy_ids` が一致する馬

検証結果: R2 経路だけで、公式で馬が紐付く 1214 種のうち 1196 種は同じ頭数、14 種は R2 の方が多く（同名の別版も拾える）、少ないものはなかった。届かない 4 種は §9.2 の手動対応で解消する。

### 10.3 残る制約

R2 にしかない非凡（現時点で 24 種）は、公式の条件データがないため非凡検索に出ない。カードの非凡詳細は表示される。R2 の条件データ（`ability_conditions.raw.game.json`）の紐付けが確認されたら、別途対応する。

## 11. ワークフロー

### 11.1 日次（新規）`.github/workflows/generate-from-r2.yml`

```yaml
on:
  schedule:
    - cron: "30 2 * * *"   # 11:30 JST
  workflow_dispatch:
    inputs:
      as_of:               # 基準日の上書き（省略時は実行日）
```

手順:

1. R2 の 5 ファイルを取得する
2. §5 の入力検証
3. `python -m tools.horse_data.generate_horselist --r2-dir <取得先> --as-of <基準日>` で生成
4. テスト（`python -m pytest`、`npx tsx --test tests/*.test.ts`）。失敗したらコミットしない
5. `VITE_BASE_PATH=/dabimas-data/dist/`、`VITE_DEPLOY_MODE=artifact-root` で `dist/` をビルド
6. `json/horselist.json`、`json/factor.json`、`dist/` に差分がなければ終了
7. 差分があればコミットして main に push

公開は GitHub Pages の「main ブランチ配信」（`build_type: legacy`）で、公開 URL は `/dabimas-data/dist/`。アプリはコミットされた `dist/json/` を読むので、`dist/` のコミットが必須。ボットの push でも Pages の再構築は動く。`deploy-pages.yml`（Actions 経由の配信）は使わない。

`concurrency` を週次と共通のグループにして、日次と週次が同時に main を更新しないようにする。

### 11.2 週次（既存）`update-horse-data.yml` の変更

- ダビマス全書の取得（`scrape_source`）と `nonordinary_abilities_bundle.json` の生成は現行どおり。
- `generate_horselist` の実行をやめ、§9.1 と §9.2 の台帳更新に置き換える。
- 最後に日次ワークフローを `workflow_dispatch` で起動し、更新した台帳で生成し直す。

## 12. 実装タスク

| No. | 対象 | 内容 |
|---|---|---|
| T1 | `tools/horse_data/r2_source.py`（新規） | R2 → `all` シート変換（§7.1〜7.2）、公開判定（§6）、入力検証（§5） |
| T2 | `tools/horse_data/r2_source.py` | 非凡・天性カードの生成（§7.4） |
| T3 | `tools/horse_data/generate_horselist.py` | `--r2-dir` / `--as-of` 引数の追加、`compute_rare_cd` の変更、`special_rare` の削除（§7.3）、`card.abilityGameId` の追加 |
| T4 | `tools/horse_data/id_ledger.py`（新規） | 台帳の読み書き、紐付け（§8） |
| T5 | `tools/horse_data/ability_links.py`（新規） | 非凡の対応表（§9.2） |
| T6 | `tools/nonordinary_data/generate_nonordinary_bundle.py` | bundle に `ability_game_links` を追加 |
| T7 | `src/features/nonordinary/lib/searchNonordinaryAbilities.ts` ほか型定義 | 2 経路での馬の取得（§10.2） |
| T8 | `.github/workflows/` | 日次の追加、週次の変更（§11） |
| T9 | テスト | 公開判定の境界、レア判定、台帳の不変性、同じ入力・基準日での出力の一致 |

初回移行（台帳の作成）は T4 の完成後に 1 回だけ手動で行い、結果の台帳をレビューしてからコミットする。

## 13. パイプライン側（R2）への依頼事項

1. ~~**祖先の母が null の血統を補ってほしい。** 血統表に空欄が出る。~~
   **解消済み**（R2 run `20261007T121737Z`、dataset_version `2026-10-07T123420Z+raw.0ecfb7053e97`）。下表の 8 頭すべてに母が登録され、血統表に空欄がある馬は 0 頭になった。シャーロッツヴィル-覇煌- の母母母父はダビマス全書と同じ Sky-rocket。

   | 種牡馬 | 母が null の祖先 |
   |---|---|
   | シャーロッツヴィル-覇煌- | Empire Glory（ダビマス全書では母母母父 Sky-rocket） |
   | ビッグゲーム-霆煉- | Tetratema、Dolabella |
   | ルアール-覇煌- | Teleferique、Cannelle |
   | アドミラルドレイク-瞬闘- | Sunstar、Maid of the Mist、Concertina |

2. **パイプライン側の仕様書（`stallion-master-weekly-integration-spec.md`）と本設計の差を確認してほしい。**

   | パイプライン側の記述 | 本設計 |
   |---|---|
   | 公式攻略ページは欠損の補完元にしない（§1） | R2 にない馬はダビマス全書で補う（§9.3） |
   | 基準時刻は `batch_started_at`（§3） | 実行日の 11:30 JST に固定（§6） |
   | `rarity_raw` などから header badge を補完しない（§5） | 才能枠と因子数から RareCd 7/8 を決める（§7.3）。header badge 自体は変えない |
   | 10 桁 ID を推測生成しない（§4） | 同じ。R2 のみの馬は `r` + ID（§8.2） |

3. （任意）ゲーム内部に「究極」を直接示すフラグがあれば、`header_badge.raw` に出してほしい。§7.3 の規則の裏付けになる。

## 14. 確認済み事項（2026-10-07）

初版で未決としていた 3 点は、次のとおり確定した。

| No. | 内容 | 決定 |
|---|---|---|
| U1 | R2 のみの馬の `HorseId` 形式 | `r` + 種牡馬 ID（牝馬は `rb` + 牝馬 ID）とする（§8.2 規則 3） |
| U2 | サイレンススズカ（ダビマス全書にはあるが、R2 では公開日 2030 年） | 一覧から消えてよい。D4 のとおり日付で除外する |
| U3 | 同名で絞り切れない 139 頭の初回割り当て | 現行の `HorseId` を、`display_start_at` の古い順に R2 の候補へ割り当てる（§8.3） |
