# 📍 行きたいところ投票

URLを共有するだけで、みんなで「行きたいところ」を出し合って投票できるWebツール（ログイン不要）。

- 行きたいところ（名前・URL・メモ）をカードで表示し、票数の多い順に並べる
- カードをタップすると URL・メモ・コメントを表示する
- 投票は1人1箇所まで。もう一度押すと取り消し、別の場所を押すと投票先を変更できる
- 投票者の名前を表示する
- 誰かが投票やコメントをすると、全員の画面にすぐ反映される（Firebase）

## 構成

| ファイル | 役割 |
|---|---|
| `index.html` / `style.css` | 画面 |
| `app.js` | 画面の表示と操作の処理 |
| `store.js` | データ保存（Firestore 版／お試し版） |
| `firebase-config.js` | Firebase の接続設定 |
| `firestore.rules` | Firestore のセキュリティルール |

### データ構造（Firestore）

```
events/{eventId}                    { title, createdAt }
events/{eventId}/places/{placeId}   { name, url, memo, addedBy, createdAt, comments: [{by, text, at}] }
events/{eventId}/votes/{投票者名}    { placeId, at }
```

投票は「投票者名」をIDにした文書で持つ。1人につき1文書しか作れないため、自然に「1人1箇所」になる。

## お試しモード

`firebase-config.js` が空のままだと、データはブラウザ内（localStorage）にだけ保存される。画面の確認用。

```bash
python3 -m http.server 8000   # このフォルダで実行し、http://localhost:8000 を開く
```

※ ES Modules を使うため、HTMLファイルをダブルクリックで直接開いても動かない。必ずHTTPサーバー経由で開く。

## Firebase のセットアップ

1. https://console.firebase.google.com で「プロジェクトを追加」（Google アナリティクスは不要）
2. 左メニュー「構築 > Firestore Database」→「データベースを作成」
   - ロケーション：`asia-northeast1`（東京）
   - 「本番環境モード」で開始
3. Firestore の「ルール」タブに `firestore.rules` の内容を貼り付けて「公開」
4. プロジェクトの設定（⚙）→「マイアプリ」→ ウェブ（`</>`）を追加し、表示された `firebaseConfig` の中身を `firebase-config.js` に貼り付ける
   - この値は公開しても問題ない（アクセス制限はセキュリティルールで行う）

## GitHub Pages で公開

リポジトリの Settings → Pages → Source を「Deploy from a branch」、Branch を `main` / `/ (root)` にする。
数分で `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開される。

## 注意

- URLを知っている人は誰でも候補の追加・削除・投票ができる（身内で使う前提）
- 同じ名前を入力すると同じ人として扱われる
