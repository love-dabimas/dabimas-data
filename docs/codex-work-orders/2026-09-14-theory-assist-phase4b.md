# 作業指示書: 自家製馬を混ぜ、理論チップで絞り込む（配合理論補助 Phase 4b・ダビ娘側）

- status: 依頼中
- 作成日: 2026-09-14
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 対象リポジトリ: **`dabimas-data`（ダビ娘）**。このリポジトリで作業する
- 枝: **`theory-assist-phase4`**（`release/2026-11` から作成済み。作業前に checkout すること）
- 上位仕様: 隣のリポジトリにある
  `C:/derby/dabimasFactor_new/docs/haigou-theory-assist-design.md` の §3.3 / §4.5 / §5 / §1.6
- 対になる指示書: ダビふぁく側の Phase 4a
  （`C:/derby/dabimasFactor_new/docs/codex-work-orders/2026-09-14-theory-assist-phase4a.md`）。
  **メッセージ仕様で切ってあるので、相手の実装を待たずに進められる。**
  確認は、決まった形のメッセージを流すだけの検証用ページで行う（下の「受け入れ基準」）。

---

## いちばん大事な制約（Phase 3 と同じ）

### 公開中のダビ娘の見た目を、1ピクセルも変えないこと

ダビ娘は `https://love-dabimas.github.io/dabimas-data/dist/` で公開中で、
**ダビふぁくとは関係なく使っている利用者がいる。**

したがって今回足すもの（自家製馬・理論チップ）は**すべて埋め込みのときだけ**効かせる。

- **TSX での出し分け** … `IS_EMBEDDED` / `IS_PICKER`（`src/features/embed/model/embedMode.ts`）。
- **CSS での出し分け** … `<html>` に付く `.embed-mode` / `.embed-mode--picker` で囲い、
  **`src/styles/embed.css` に書く。** `src/styles/app.css` や `legacy.css` の既存ルールを書き換えない。

`IS_EMBEDDED` は iframe の中にいることとクエリの両方を見ているので、単体の URL に
`?embed=1` を付けて直接開いても `"none"` のままである。Phase 3 の検収では、
変更前後で単体のカード `outerHTML` が完全一致することを確認した。**今回も同じ水準を保つこと。**

### 11月まで公開しない

**`main` にマージしない。push もしない。`dist/` を手で触らない・コミットしない。**
毎週金曜18時の GitHub Actions が `main` をビルドして `dist/` を push するので、
`main` に入れた時点で本番に出る。

---

## 背景

ダビふぁくの「配合理論補助」は、繁殖牝馬を起点に代ごとに種牡馬を選ぶ画面である。
その種牡馬選びにダビ娘のピッカーを使う。Phase 3 でカードの項目は絞り終わっている。

Phase 4b で足すのは次の2つ。

1. **自家製馬**（利用者がダビふぁくで作った、実際には走っていない仮想の馬）を
   ダビ娘の一覧に混ぜる。能力値は存在しないので「ー」で描く。
2. **配合理論での絞り込み。** 「いまの繁殖牝馬と組んだときに成立する理論」で候補を絞る。

---

## 1. 受け取るメッセージを足す（`src/features/embed/model/messages.ts`）

`MessageFromParent` に2つ足す。判定は既存の `readMessageFromParent` に足す
（`event.origin` と `event.source` を見る規則は変えない）。

```ts
| { type: "dabimas:custom-horses"; v: number; horses: CustomHorsePayload[] }
| { type: "dabimas:theory-map"; v: number; mareKey: string;
    chips: TheoryChip[]; entries: [string, number][] }
```

形は設計書 §3.3 のとおり。要点。

- `CustomHorsePayload` … `key` / `gender` / `name` / `category` / `categoryHt` /
  `paternalT` / `paternalHt` / `paternalJik` / `paternalMig` / `factors` / `pedigree`。
  `pedigree` は15行で、並びは既存の `PedigreeEntry` と同じ。
- `TheoryChip` … `{ key: string; label: string; bit: number; pending: boolean }`。
  **`key` の意味をダビ娘が解釈しない。** ラベルを出してビットで絞るだけにする。
  理論の定義は親が持つ。増減しても直すのは親だけ、という切り方にしてある。
- `entries` … `[horseKey, ビットの論理和]`。**載っていないキーは「どの理論も成立しない」。**
  1頭が複数のチップに該当しうる（奇跡は完璧が前提）ので、単一の値ではなく論理和である。

送る側が届いたことを確認できるよう、**ダビ娘 → 親に `dabimas:candidates` を1つ足す。**

```ts
{ type: "dabimas:candidates"; v: number; rows: [string, string, string, string, string][] }
//  [horseKey, Paternal_t, Paternal_ht, Paternal_jik, Paternal_mig]
```

- 検索データを読み終えた直後に**1回だけ**送る。以後一覧は変わらないので送り直さない。
- **マスターの馬だけ**を送る。自家製馬は親がもともと持っている。
- 2,979行になる。構造化複製で数msのはずだが、実測して完了報告に書くこと。

## 2. 自家製馬を一覧に混ぜる

`dabimas:custom-horses` を受け取ったら `HorseRecord` を組み立て、埋め込みのときだけ
検索対象に足す。組み立ては新しいファイル
**`src/features/embed/lib/buildCustomHorseRecord.ts`** に置く（純粋関数）。

| `HorseRecord` の欄 | 入れる値 |
| --- | --- |
| `HorseId` | `key` から性別を除いた部分（`"ch_a1b2-0"` → `"ch_a1b2"`） |
| `Gender` | `gender` |
| `SerialNumber` | 一意ならよい。並び順は下記 |
| `RareCd` / `FactorFlg` | 空文字 |
| `Category` / `Category_ht` | `category` / `categoryHt` |
| `Paternal_*` | そのまま |
| `Ped_All` | `pedigree` から、マスターと同じ `[位置名前]` の形で組む |
| `card.stats` の9項目 | すべて `"ー"` |
| `card.abilityData` / `temperamentData` / `theory` | `null` / `undefined` |
| `card.factorCounts` | すべて 0 |
| `card.pedigree` | `pedigree` をそのまま |
| `card.rareBadgeLabel` | `"ー"`（バッジの枠は残す） |

- **並び順は各性別の末尾。** マスターの並び（`RareCd` 降順ほか）に自家製馬を
  割り込ませる根拠が無いため。使ってみて先頭のほうがよければ後で変える。
- **自家製と分かるバッジを出す。** 馬名の隣に「自」。埋め込みのときだけ。
- `Ped_All` を組むのは、既存のキーワード検索・先祖名検索が `Ped_All` を見ているため。
  ここが空だと自家製馬だけ検索に掛からない。**マスターの `Ped_All` を1件読んで、
  同じ区切り・同じ位置名にすること。**
- ❤（お気に入り）は自家製馬に出さない。`supportedKeys` に入らないので既存の作りで消えるはず。
  消えることを確認する。

## 3. 理論チップで絞り込む

### 3.1 いまある `criteria.theory` と混ぜないこと

既存の理論の絞り込み（`AncestorModal.tsx` の `perfect` / `superPerfect` / `miracle` /
`shiho`）は、**その馬が単体で持っている素質**である。今回のチップは
**いまの繁殖牝馬と組んだときに成立する理論**で、まったく別物である。

既存のほうは**そのまま残す**（Phase 3 の指示書でもそう決めている）。
新しいほうは別の状態として持つ。名前も別にする（例 `pairTheory`）。

### 3.2 チップの見た目と動き

結果一覧の上に、埋め込みのときだけ1行出す。

- チップは親から届いた `chips` の順に出す。ラベルは `chip.label`。
- **1つだけ選べる。** もう一度押すと外れる（絞り込みなしに戻る）。
- 各チップに**該当頭数**を出す。数え方は
  **「理論以外の条件で絞った結果」∩「そのビットを持つ馬」**。
  選択中のチップで絞ったあとの数を使うと、他のチップが全部0になってしまう。
- `pending: true` のチップは**操作不可**にし、計算中と分かる見た目にする。
  **計算していないものを「0件」と表示してはいけない。**（設計書 §4.5）
- `mareKey` が違う表が届いたら、選択中のチップを外して数え直す。
  母が変わったのに前の母の結果で絞られたままにしない。

### 3.3 0件のとき

**素直に0件と出す。** 次点の提案も自動切り替えもしない。

> 該当なし／完璧な配合になる種牡馬はいませんでした。

繁殖牝馬 499 頭のうち 387 頭は完璧に該当する種牡馬が1頭も居ない（設計書 §1.5）ので、
0件は例外ではなく普通に起きる。**0件でもチップは押したままにでき、外せば戻る。**

---

## 制約

- React 19 ＋ TypeScript ＋ Vite ＋ zustand。**新しいライブラリを足さない。**
- `npm run build` は `tsc --noEmit` を含む。型エラーを残さない。
- 埋め込み用のスタイルは `src/styles/embed.css` に書く。`app.css` / `legacy.css` を書き換えない。
- 既存のメッセージ（`dabimas:hello` / `favorites` / `favorite-toggle` /
  `favorites-only` / `select` / `reset-pick`）の形を変えない。
- **ダビふぁく側（`C:/derby/dabimasFactor_new`）のファイルに触らない。**
- 週次のデータ取得ワークフローに触らない。
- コミットメッセージは日本語。**push はしない。`main` にマージしない。**

## スコープ外（やらないこと）

- 至高の計算をしない。親が `pending: true` で送ってくるので、操作不可にするだけ。
- 危険な配合を除く処理をしない（Phase 5）。
- 自家製馬の能力値を推定して埋めない。無いものは「ー」のままにする。
- カードの項目を Phase 3 から変えない。足すのは「自」バッジだけ。
- 周辺のリファクタリングをしない。気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

---

## 受け入れ基準

1. `npm run build` が成功する（型エラーが無いこと）。

2. `npm run verify:parity` が **16件すべて成功**する。
   （2026-09-14 に旧側の正規表現の誤りを直したので、いまは全件通るのが正しい状態である。）

3. **単体の見た目が変わっていないこと。ここが最重要。**
   iframe に入れずに直接開いたカードと検索画面を、変更前（`release/2026-11`）と比べる。

   a. カードの `outerHTML` が変更前後で**一致**すること。同じ検索語で結果カードを
      取り出して比べる。Phase 3 の検収ではこの方法で3枚とも一致を確認した。

   b. `?embed=1` を付けて直接開いても `.embed-mode` が付かず、単体と同じであること。

   c. 理論チップが出ていないこと。自家製馬が混ざっていないこと。

4. **検証用ページを作って、埋め込みの動きを確認する。**
   `tests/theory-assist-phase3.html` にならって `tests/theory-assist-phase4.html` を作る。
   iframe に `?picker=1` を出し、**親の役をこのページが演じる**
   （`dabimas:hello` を受けたら `dabimas:favorites` と `dabimas:custom-horses` を返し、
   `dabimas:candidates` を受けたら `dabimas:theory-map` を返す）。
   自家製馬とマップの中身はページに直書きでよい。次を示すこと。

   a. 自家製馬がカードとして出る。9項目が「ー」、血統表が15行、面白・見事が出る、
      「自」バッジが付く、❤ が出ない。

   b. 自家製馬の名前・血統表の祖先名でキーワード検索して見つかる。

   c. チップが `chips` の順に出て、頭数が付く。至高だけ操作不可。

   d. 完璧のチップを押すと、`entries` で完璧のビットを持つ馬だけになる。
      奇跡のビットも持つ馬が**完璧のほうにも残る**こと（論理和で持つ意味がここにある）。

   e. レアなどで別に絞ってからチップの数字を見ると、絞ったあとの数になっている。

   f. 該当0のチップを押すと、0件のメッセージが出る。もう一度押すと戻る。

   g. `mareKey` の違う `dabimas:theory-map` を送ると、選択中のチップが外れる。

   h. 親が受け取った `dabimas:candidates` が 2,979 行で、5つ組になっている。
      送信から受信までの所要時間を測って完了報告に書く。

5. 375px 幅で横スクロールが出ないこと。チップが読める大きさで並ぶこと。

6. `?picker=1` の選択・解除（Phase 3 で入れた暗転と「選択を解除する」）が
   自家製馬のカードでも動き、`dabimas:select` の `horseId` が `ch_` 付きで親に届くこと。

3〜6 で確認した内容を、完了報告に具体的に書くこと（スクリーンショットが撮れるなら添える）。

---

## 検証コマンド

```
npm run build
npm run verify:parity
npm run dev     # 画面の確認用
```

画面の確認は、ブラウザーのウィンドウが**表示されている状態**で行うこと。
隠れていると `requestAnimationFrame` が止まり、カードの高さの再計測が走らないため、
血統表を開いても伸びないように見える（Phase 3 の検収で踏んだ）。

---

## 完了報告（Codex が記入する）

### 変更ファイル一覧

### 設計判断

### 実行した検証と結果

### 残課題・気づき
