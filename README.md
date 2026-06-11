# 制約ワードウルフ

マスター端末で部屋を作り、参加者が部屋コードで入室する同期型の制約ワードウルフです。

## 必要なもの

- GitHub Pages
- Firebase Authentication 匿名ログイン
- Cloud Firestore

## Firebase設定

1. FirebaseでWebアプリを作成します。
2. Authenticationで「匿名」を有効化します。
3. Cloud Firestoreを作成します。
4. `firebase-config.example.js` を参考に、`firebase-config.js` の `window.CWW_FIREBASE_CONFIG = null;` をFirebase Web configへ置き換えます。
5. Firestore Rulesには `firebase.rules` の内容を設定してください。

Firestore Rulesに貼るのは、次のような `rules_version = '2';` から始まるコードだけです。
Realtime Database用のJSON形式、たとえば `{ "rules": { ".read": true, ".write": true } }` は使いません。

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/{appId}/public/data/rooms/{roomCode} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Firebase Web configはブラウザアプリ用の公開設定です。秘密鍵ではありません。

## お題の自動生成

「お任せ(ローカル生成)」は外部AI APIを使わず、アプリ内のローカル生成器でお題・制約・占い師ヒントを作ります。
通信、APIキー、無料枠制限に依存しないため、GitHub Pages上で安定して動きます。
生成レベルは「普通」「ちょい知識」「マニアック」から選べます。お題だけ指定することもでき、空欄の場合はお題も自動生成します。
生成された内容はゲーム開始後の参加者カードにだけ表示されます。

「お任せ(外部AI / Gemini)」では、マスターがGemini APIキーとモデル名を入力して、ゲーム開始時にお題・制約・占い師ヒントを生成できます。
既定モデルは安定版の `gemini-2.5-flash` です。指定モデルが存在しない、または `generateContent` に未対応の場合は、別のFlash系モデルへ自動再試行します。
APIキーはFirestoreの部屋データには保存せず、マスター端末のセッション中だけ使います。
APIエラー、通信失敗、JSONパース失敗時はローカル生成へ即時フォールバックします。

マスターも参加する設定を有効にすると、マスター端末にも自分用のカード、伏せ入力、開示、投票パネルが表示されます。

## 進行仕様

ゲーム開始後、まず全員にお題と役職カードを表示します。全員が「確認」を押すと、マスター画面に「ゲーム開始」ボタンが表示され、N週目の30秒思考時間へ進みます。
思考時間が終わると伏せ入力画面に切り替わります。送信済みの参加者は待機表示になり、マスターは未送信者がいても強制的に開示フェーズへ進められます。
占い師を入れる設定は参加者が4人以上のとき有効です。1週目は選ばれた本人にも村人として表示され、2週目開始時に占い師へ切り替わり、ヒントが表示されます。
1週目の通常投票だけ「投票しない」を選べます。スキップが最多の場合、誰も容疑者にならず次週へ進みます。
前回の部屋コードと名前は端末内に保存され、ホーム画面から再入室できます。保存情報は「削除」で消せます。

## ローカルテスト

```bash
node tests/core.test.js
node --check game-core.js
node --check app.js
```
