// アフィリエイトリンクの設定（もしもアフィリエイト）。
//
// 設定方法:
//   1. もしもアフィリエイトで提携したプロモーション（例：楽天トラベル）の「広告リンク」画面で、
//      テキストリンクを1本作る（リンク先はトップページなど何でもよい）。
//   2. 生成されたリンクのURL（https://af.moshimo.com/af/c/click?a_id=...&url=... の形）を
//      下の sampleLink に貼る。
//   → アプリが sampleLink の「url=」の部分だけを、各候補地の検索ページに差し替えて使う。
//
// sampleLink が空の項目は表示されない。
// targetUrl の {q} には候補地の名前（URLエンコード済み）が入る。
export const affiliateLinks = [
  {
    label: "🏨 周辺の宿を探す（楽天トラベル）",
    sampleLink: "",
    targetUrl: "https://kw.travel.rakuten.co.jp/keyword/Search.do?f_query={q}",
  },
];
