# dabimasData 再構築仕様書（ソースコード照合版）

改訂日: 2026-04-02  
対象: `https://yanaifarm.github.io/dabimasData/index.html` 相当の再構築  
想定実装: **React + TypeScript + Vite**  
重要方針: **公開情報ではなく、このリポジトリにある実装を正として互換要件を定義する**

---

## 0. この版の位置づけ

この文書は、もともとの「公開情報からの推測」を、**実際のソースコード読解結果で置き換えた版**である。

今回の調査対象に含めた主なファイルは次の通り。

- `index.html`
- `serach-horse.js`
- `pagectrl.js`
- `static/style.css`
- `static/horselist.js`
- `json/factor.json`
- `generate_horselist.py`
- `Module1.bas`
- `service-worker.js`
- `manifest.json`

結論だけ先に書くと、現行は次のような構成で動いている。

- **React ではない**
- **静的 HTML + jQuery + Vue 2 + Vuetify 2 + AlaSQL**
- **検索対象は正規化 JSON ではなく、HTML 断片を大量に埋め込んだ 35 フィールドのフラット配列**
- **種牡馬/牝馬は独立した検索モードというより、同じ検索条件で同時に作られる結果タブ**
- **詳細は別画面ではなく、検索結果の各ヒットに最初から全展開される**

したがって、再構築時に守るべき最優先事項は次の順になる。

1. **検索条件の意味互換**
2. **結果件数と並び順の互換**
3. **現行 UI の操作順と空状態の互換**
4. **データ生成パイプラインの整理**
5. **見た目と内部実装の近代化**

---

## 1. 現行実装の確定スタック

| レイヤ | 現行実装 | 備考 |
| --- | --- | --- |
| 画面シェル | `index.html` + `static/style.css` | 単一 HTML。viewport は `width=750` 固定寄り |
| UI ロジック | `serach-horse.js` | Vue 2 / Vuetify 2 と素の DOM 操作が混在 |
| イベント束ね | `pagectrl.js` | checkbox / keyword / accordion のイベント登録 |
| 検索エンジン | `alasql` | `horse` 配列に SQL 文字列を直接当てる |
| 実行時データ | `static/horselist.js` | `index.html` が読み込む本番データ |
| 祖先候補データ | `json/factor.json` | Vuetify autocomplete 用 |
| 生成スクリプト | `generate_horselist.py` | `.xlsm` から `horse=[...]` を生成 |
| 旧生成ロジック | `Module1.bas` | VBA 版の元実装。Python はその移植に近い |
| PWA | `manifest.json` + `service-worker.js` | ただし設定に legacy が残る |

依存ライブラリはローカルバンドルではなく CDN 読み込みが多い。

- jQuery
- Vue 2.x
- Vuetify 2.x
- AlaSQL
- Material Design Icons
- Google Analytics

---

## 2. 現行 UI と操作の実態

### 2-1. 初期表示

初期表示で行っていることはかなり単純で、**全件一覧は出さない**。

- `initShow(0)` でヘッダー、条件タブ、空の結果タブ、フッターを描画する
- 結果部分は `種牡馬` / `牝馬` のタブだけ出る
- 条件を何も入れない限り検索結果は 0 件扱い

つまり現行 UX は「ページを開くと空」「条件を入れて初めて一覧が出る」方式である。

### 2-2. 画面上部

画面上部には次がある。

- キーワード入力
- リロードによるリセットボタン
- 条件タブ群
  - `父`
  - `母父`
  - `見事`
  - `１薄`
  - `レア`

ここで重要なのは、**レアは補助条件であり単独検索条件としては扱われていない**こと。  
後述する通り、現行ロジックではレアだけ選んでも結果は 0 件になる。

### 2-3. 祖先絞込モーダル

`検索` ボタンではなく、`祖先絞込` ボタンで Vuetify のダイアログを開く実装になっている。  
このダイアログには次がある。

- 自身の子系統指定
- 母父の子系統指定
- 祖先指定
- 祖先位置指定
  - `自分自身`
  - `父`
  - `父父`
  - `母父`
  - `１薄`
  - `見事`
  - `上記以外`

ここでの仕様上の注意点:

- `祖先指定` だけでは検索条件にならない
- **祖先名 + 祖先位置** の組み合わせで初めて効く
- モーダル内検索は Enter 即時ではなく、下部ボタン押下で発火する

### 2-4. 種牡馬 / 牝馬タブの意味

元の仕様書では「種牡馬モード / 牝馬モード」を強く前提にしていたが、現行コードを見る限り実体はそれより弱い。

現行は次の流れで動く。

1. 同じ検索条件で `Gender = "0"` と `Gender = "1"` の SQL を両方作る
2. 種牡馬結果配列と牝馬結果配列を**同時に**作る
3. それを CSS タブで切り替えて見せる

つまり、現行トップページの「種牡馬 / 牝馬」は**独立した検索モード**というより、  
**同一条件に対する二系統の結果表示タブ**である。

再構築 Phase 1 では、ここを勝手に「モード切替ストア」に読み替えないほうが安全である。

### 2-5. 結果表示

現行の結果表示は「一覧 + 詳細パネル」ではない。  
1 ヒットごとに次がそのまま並ぶ。

- ヘッダ情報 (`HeaderDetail`)
- 血統表テーブル (`Ped_t` 〜 `Ped_hhht`)

要するに、**検索結果の各カードが最初から詳細表示状態**である。

さらに表示は次の特徴を持つ。

- 1 回に 30 件ずつ追加
- `IntersectionObserver` による無限スクロール
- 牡馬側 / 牝馬側の先頭 30 件は初回検索でどちらも HTML 生成
- 以降の追加読込は、現在見えているタブ側だけ進む

### 2-6. 入力イベント

現行の反映タイミングは UI 要素ごとに少し違う。

- キーワード: `input` ではなく `change`
- checkbox: `change` ごとに即時反映
- 祖先絞込モーダル: ボタン押下で反映
- リセット: `location.reload()`

また、検索条件確認アコーディオンに表示されるのは次だけで、**レア条件は表示されない**。

- 父
- 母父
- 見事
- １薄
- 因子（実体は祖先指定）
- 自身の子系統
- 母父の子系統

---

## 3. 検索条件の正確な意味

現行コードは `filterHorse()` で SQL を組み立てる。  
この時の条件意味は次の通り。

| UI 入力 | 実際の判定先 | 現行の意味 |
| --- | --- | --- |
| `父` | `Paternal_t in (...)` | 自身の父系統コード一致 |
| `母父` | `Paternal_ht in (...)` | 母父系統コード一致 |
| `見事` | `Paternal_mig REGEXP "^...$"` | 選択コードをすべて含む lookahead AND |
| `１薄` | `Paternal_jik REGEXP "^...$"` | 選択コードをすべて含む lookahead AND |
| `キーワード` | `Ped_All REGEXP "^(?=.*keyword).*$"` | `Ped_All` 全文に対する部分一致正規表現 |
| `自身の子系統` | `Category REGEXP ...` | 結果馬自身の子系統文字列 |
| `母父の子系統` | `Category_ht REGEXP ...` | 結果馬の母父の子系統文字列 |
| `祖先指定 + 位置指定` | `Ped_All REGEXP ...` | `[自身Horse]` 等のトークンに対する検索 |
| `レア` | `RareCd in (...)` | 性別別 query にだけ追加される補助条件 |

### 3-1. 祖先指定の詳細

祖先指定は名前そのものを専用カラムで持っていない。  
`Ped_All` に埋め込まれたトークンに対して正規表現を当てる。

例:

- `[自身ディープインパクト]`
- `[１父サンデーサイレンス]`
- `[父父Halo]`
- `[母父キングカメハメハ]`
- `[１薄カロ]`
- `[見事Le Fabuleux]`
- `[以外Northern Dancer]`

ただし、**実装上はこのトークンを literal にエスケープしていない**。  
`filterSqlFactor()` は `[父父Halo]` のような文字列をそのまま `REGEXP` に渡しており、
実際の legacy UI では「トークン一致」ではなく、**未エスケープ regex として評価された結果**になっている。

つまり source code 上の実挙動は、意図としてはトークン検索に見えるが、
互換再実装では **この legacy regex 挙動を優先して合わせる** 必要がある。

そのため、再構築でも以下のどちらかが必要になる。

1. `Ped_All` と同等の検索インデックスを持つ
2. それと完全に同じ legacy regex 挙動になる構造化インデックスを持つ

### 3-2. レア条件の注意点

`レア` は SQL の `where Gender = ...` 側に追加されるだけで、  
`sql_filter` 側には入らない。

この結果、現行では次が起きる。

- **レアだけ選んでも 0 件**
- 父 / 母父 / 見事 / １薄 / キーワード / 子系統 / 祖先指定のいずれかが必要

また初期状態のレア checkbox は次が ON。

- `8`
- `7`
- `6`
- `5`
- `4`
- `Z`
- `Y`
- `X`

初期状態で OFF のもの:

- `3`
- `2`
- `1`
- `W`
- `V`
- `U`

つまり現行は「低レアを最初から絞っている」挙動であり、これも互換対象になる。

### 3-3. 条件なし時

条件が 1 つも入らない場合、現行コードは意図的に次を入れる。

```sql
AND 1 = 0
```

したがって「初期表示で全件」「条件なし検索で全件」は**現行互換ではない**。

---

## 4. 結果の並び順と表示ロジック

現行 SQL の並び順は固定で、ユーザーソート UI は存在しない。

```sql
order by Gender ASC, FactorFlg DESC, RareCd DESC, SerialNumber ASC
```

ただし検索は種牡馬 query / 牝馬 query を分けて実行しているため、実質は各タブ内で次の順に近い。

1. `FactorFlg DESC`
2. `RareCd DESC`
3. `SerialNumber ASC`

ここでの注意点:

- `RareCd` は数値と英字が混在する文字列
- 牝馬側の希少度順は**専用の rank 関数ではなく文字列順**
- 現行互換を取るなら、この素朴な並び順も再現対象

---

## 5. 現行データモデル

`index.html` が実際に読むのは `static/horselist.js` の `horse=[...]` 配列で、  
1 レコードは **35 フィールドのフラットオブジェクト**である。

```ts
interface HorseRawRecord {
  SerialNumber: string
  Gender: '0' | '1'
  HorseId: string
  FactorFlg: '0' | '1'
  FactorName: string
  RareCd: string
  HeaderDetail: string
  Category: string
  Category_ht: string
  Paternal_t: string
  Paternal_tht: string
  Paternal_ht: string
  Paternal_hht: string
  Paternal_ttht: string
  Paternal_thht: string
  Paternal_htht: string
  Paternal_hhht: string
  Ped_t: string
  Ped_tt: string
  Ped_ttt: string
  Ped_tttt: string
  Ped_ttht: string
  Ped_tht: string
  Ped_thtt: string
  Ped_thht: string
  Ped_ht: string
  Ped_htt: string
  Ped_httt: string
  Ped_htht: string
  Ped_hht: string
  Ped_hhtt: string
  Ped_hhht: string
  Paternal_jik: string
  Paternal_mig: string
  Ped_All: string
}
```

### 5-1. フィールドの性格

この 35 フィールドは大きく 4 系統に分かれる。

1. 識別
   - `SerialNumber`
   - `Gender`
   - `HorseId`
2. 検索補助
   - `FactorFlg`
   - `FactorName`
   - `RareCd`
   - `Category`
   - `Category_ht`
   - `Paternal_*`
   - `Paternal_jik`
   - `Paternal_mig`
   - `Ped_All`
3. 表示 HTML
   - `HeaderDetail`
   - `Ped_t` 〜 `Ped_hhht`
4. 表示兼検索の埋め込み文字列
   - `Ped_All`

つまり現行は、**データと表示 HTML が分離されていない**。

### 5-2. 2026-04-02 時点で Python 生成から確認できた件数

`generate_horselist.py` をローカル `.xlsm` に対して実行した結果、生成件数は次だった。

- 総件数: `2713`
- 種牡馬 (`Gender = "0"`): `2229`
- 牝馬 (`Gender = "1"`): `484`

### 5-3. 主要コード体系

親系統コードは 15 種。

- `Ec`
- `Fa`
- `Ha`
- `He`
- `Hi`
- `Ma`
- `Na`
- `Ne`
- `Ns`
- `Ph`
- `Ro`
- `St`
- `Sw`
- `Te`
- `To`

`Category` は 54 種、`Category_ht` は 58 種あり、  
子系統名は短縮コードではなく日本語文字列で保存される。

---

## 6. データ生成パイプライン

現行 repo には、同じ方向を向いた 2 系統の生成ロジックがある。

### 6-1. 旧ソース

- `Module1.bas`
- Excel マクロで `horselist.js` を吐く

### 6-2. 現行 Python

- `generate_horselist.py`
- `.xlsm` を `openpyxl` で読む
- `horse=[...]` 形式の JS テキストを出力する

Python 側は VBA のタグ構成とフィールド名をかなり忠実に引き継いでいる。  
再構築では、この Python を**移行前の真実源泉候補**として扱うのが自然である。

### 6-3. 現在の repo 内不整合

実装読解で、次のズレが見つかった。

#### A. 実行時データと生成データが一致していない

- `index.html` が読むのは `static/horselist.js`
- Python のデフォルト出力先は `horselist.js`
- repo には `generated_horselist.js` もある

しかも `static/horselist.js` と Python 生成結果は一致していない。

- `static/horselist.js`: `2624` 件
- `generate_horselist.py` の生成結果: `2713` 件

この差分は 1 フィールドの軽微な差ではなく、**件数レベルで別データ**になっている。  
再構築に入る前に、まず「どちらを正とするか」を決める必要がある。

#### B. 祖先候補データも二重化している

祖先候補データは次の 2 系統がある。

- 現行トップページが使う: `json/factor.json`
- legacy detail ページが使う: `static/factor.js`

件数も違う。

- `json/factor.json`: `210` 件
- `static/factor.js`: `228` 件

トップページ再構築では、**`json/factor.json` を現行実装の正**として扱うべきである。

#### C. 子系統候補が hard-code で、データ全量を網羅していない

`serach-horse.js` の `lines` 配列は hard-code 53 件だが、データ側の実在値はそれより多い。

UI 候補に無いもの:

- 自身の子系統で欠落: `ファラリス系`
- 母父の子系統で欠落:
  - `スインフォード系`
  - `セントサイモン系`
  - `ソヴリンパス系`
  - `ファラリス系`
  - `ヘロド系`

再構築ではこの hard-code を廃止し、**データから選択肢を導出**すること。

---

## 7. legacy / 未接続コードの扱い

この repo には現行トップページで使っていないコードがかなり残っている。

### 7-1. `detail.html` / `dialog.html`

ファイルはあるが、現行トップページの検索結果はすでに詳細全展開であり、  
実際の導線は繋がっていない。

### 7-2. `pagectrl.js` の詳細遷移系

`pagectrl.js` には次の呼び出しが残っている。

- `detailShow(...)`
- `backShow()`
- `dispHibon(...)`

しかし、これらの関数本体は repo 内に存在しない。  
つまりこれは**現行トップページの実動要件ではなく、取り残された legacy**である。

### 7-3. 非凡 (`telent.js`) 系

- `static/telent.js`
- `disp_hibon`
- `tab-head`

などは旧 detail ページ系の文脈で残っているが、`index.html` の動線には接続されていない。

### 7-4. PWA まわり

PWA も完全には整理されていない。

- `manifest.json` は存在する
- `manifest.webmanifest` への `<link>` はあるが、ファイル自体は repo に無い
- Service Worker は absolute path 前提で登録している
- precache 対象は shell 寄りで、horse data 自体は明示的には列挙していない

再構築では PWA を残してよいが、**現行の broken / legacy 設定をそのまま移植しない**こと。

---

## 8. 再構築で守るべき非交渉条件

元の仕様書で守りたい方向性自体は正しいが、現行コードを踏まえると以下に言い換えるのが正しい。

### 8-1. 絶対に変えてはいけないもの

- 父 / 母父 / 見事 / １薄 / レア / キーワード / 子系統 / 祖先指定の**意味**
- 条件なしでは結果を出さないという挙動
- デフォルトで高レア寄りに絞っている挙動
- 祖先位置トークンの意味
  - `自身`
  - `１父`
  - `父父`
  - `母父`
  - `１薄`
  - `見事`
  - `以外`
- 結果タブが `種牡馬` と `牝馬` に分かれていること
- 結果 1 件ごとに血統表まで見えること

### 8-2. 変えてよいもの

- 色、余白、タイポグラフィ
- fixed width レイアウトからレスポンシブへの変更
- Vue 2 / jQuery / AlaSQL からの脱却
- HTML 断片埋め込みデータの正規化
- 無限スクロールの実装方式
- PWA 実装の整理

### 8-3. 現行のまま再現してはいけないもの

- hard-code 子系統候補
- 実行時データと生成データの二重管理
- `detailShow` など未実装関数前提のコード
- `manifest.webmanifest` のような未存在ファイル参照
- `id == "1"` を前提にした死んだモード判定

---

## 9. 再構築方針の修正版

### 9-1. Phase 1 は「見た目刷新」より「検索互換」

Phase 1 でやるべきことは、先に新 UI を作ることではない。  
まず次を固めること。

1. **canonical data source を決める**
2. **現行検索ロジックをテスト可能な純関数へ落とす**
3. **現行件数と一致するゴールデンテストを作る**

### 9-2. 結果 UI は最初から一覧+詳細分離にしない

現行は「結果が出た時点で詳細が見えている」ので、  
Phase 1 で summary list + side panel に変えると UX がかなり変わる。

そのため、移行初期は次のどちらかが安全。

1. 現行同様、ヒットごとに詳細ブロックを展開
2. summary list にするなら、**同時に 1 クリックで血統表が見える互換 UI** を先に設計する

### 9-3. 種牡馬 / 牝馬は「表示タブ」として扱う

少なくとも現行トップページ互換を目指す間は、

- `mode = stallion | broodmare`

という単純な 1 値ストアに落とし込むより、

- **同一条件から 2 結果セットを同時に計算し、表示タブで切り替える**

実装を先に作るほうが安全である。

後で本当に独立モードへ変えたいなら、互換検証後に別判断とする。

### 9-4. 構造化データへの変換は必須

ただし現行の `HeaderDetail` / `Ped_*` HTML をそのまま将来データモデルに残すべきではない。  
再構築では次の 2 層に分ける。

1. **raw compatibility layer**
   - 現行 35 フィールドをそのまま読める層
2. **normalized domain layer**
   - React 側が使う構造化モデル

最終的な UI は normalized layer を使う。  
ただし移行途中の検証には raw layer を残してよい。

---

## 10. 推奨する再構築データモデル

現行互換を保ちつつ再構築しやすくするなら、最低でも次の構造は必要。

```ts
type Gender = '0' | '1'

interface HorseNormalized {
  serialNumber: string
  gender: Gender
  horseId: string
  rareCode: string
  factorFlag: boolean
  factorNames: string[]
  selfChildLine: string | null
  damSireChildLine: string | null
  parentLineCodes: {
    sire: string | null
    sireOneThin: string | null
    damSire: string | null
    damSireOneThin: string | null
    migoto: string[]
  }
  pedigreeNodes: PedigreeNode[]
  searchTokens: string[]
  rawHtml?: {
    headerDetail: string
    pedigreeRows: string[]
  }
}

interface PedigreeNode {
  slot:
    | 'self'
    | 'sire'
    | 'sire_sire'
    | 'sire_sire_sire'
    | 'sire_sire_damSire'
    | 'sire_damSire'
    | 'sire_damSire_sire'
    | 'sire_damSire_damSire'
    | 'damSire'
    | 'damSire_sire'
    | 'damSire_sire_sire'
    | 'damSire_sire_damSire'
    | 'damSire_damSire'
    | 'damSire_damSire_sire'
    | 'damSire_damSire_damSire'
  horseName: string | null
  childLineName: string | null
  parentLineCode: string | null
  factorNames: string[]
  searchLabel:
    | '自身'
    | '１父'
    | '父父'
    | '母父'
    | '１薄'
    | '見事'
    | '以外'
}
```

### 10-1. なぜ `searchTokens` が必要か

現行は `Ped_All` にすべてを押し込んで検索している。  
再構築では文字列連結をやめてもよいが、少なくとも次と同じ判定は必要。

- 祖先名検索
- キーワード検索
- `以外` を含む位置検索

そのため、`searchTokens` のような形で **現行 `Ped_All` と同義の検索用 index** を持つのが安全。

---

## 11. 修正版テスト仕様

再構築の正しさは見た目ではなく、まず検索互換で判定する。

### 11-1. 最低限のゴールデンテスト

1. 条件なし
   - 結果 0 件
2. レアだけ
   - 結果 0 件
3. キーワードだけ
   - 現行と同件数
4. 父系統だけ
   - 現行と同件数
5. 母父系統だけ
   - 現行と同件数
6. 見事 2 条件
   - `Paternal_mig` の AND と同件数
7. １薄 2 条件
   - `Paternal_jik` の AND と同件数
8. 自身の子系統だけ
   - 現行と同件数
9. 母父の子系統だけ
   - 現行と同件数
10. 祖先名だけ
   - 単独では効かない
11. 祖先名 + `父父`
   - 現行と同件数
12. 同一条件で種牡馬 / 牝馬の両タブ件数
   - 現行と一致

### 11-2. 表示テスト

表示面で最低限見るべきこと:

- 結果 1 件ごとに血統表が読める
- ハイライトが父 / 母父 / 見事 / １薄 / 因子に対して入る
- タブ件数が正しい
- 初回 30 件表示、追加入力で壊れない

---

## 12. 最終判断

このリポジトリを前提にした正しい再構築方針は、元の版より少し厳密に言うと次になる。

- **内部は現代化してよい**
- **見た目も刷新してよい**
- **ただし検索条件の意味と結果の出方は、今あるコードに合わせる**

特に重要なのは次の 3 点。

1. 現行は「空で始まり、条件を入れて初めて結果が出る」
2. 現行は「種牡馬 / 牝馬を同時に計算し、結果タブで見せる」
3. 現行は「一覧の中に詳細が最初から展開される」

元の仕様書で最も危なかったのは、

- 公開情報ベースで「独立モード」
- 「一覧 + 詳細パネル」
- 「JSON 正規化済みデータがある前提」

をやや強く置いていたことだった。

この repo を読む限り、再構築は **React 化そのもの** が本題ではない。  
本題は、**VBA/HTML 断片ベースで肥大化した検索ツールを、検索互換を保ったまま構造化し直すこと**である。

---

## 付録A: 現行で active なファイル

- `index.html`
- `serach-horse.js`
- `pagectrl.js`
- `static/style.css`
- `static/horselist.js`
- `json/factor.json`
- `manifest.json`
- `service-worker.js`

## 付録B: 現行で legacy 扱いにすべきファイル

- `detail.html`
- `dialog.html`
- `static/factor.js`
- `static/telent.js`
- `Module1.bas` の画面側ロジック断片

## 付録C: 再構築開始前に先に決めること

1. canonical data source は `static/horselist.js` か `generate_horselist.py` 出力か
2. 祖先候補データは `json/factor.json` を正とするか
3. Phase 1 で結果 UI を「現行同様の全展開」にするか
4. 子系統候補は完全データ導出に切り替えるか
