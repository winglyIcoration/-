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

「お任せ(AI生成)」は外部AI APIを使わず、アプリ内のローカル生成器でお題・制約・占い師ヒントを作ります。
通信、APIキー、無料枠制限に依存しないため、GitHub Pages上で安定して動きます。
生成された内容はゲーム開始後の参加者カードにだけ表示され、結果発表までマスター画面には表示されません。

マスターも参加する設定を有効にすると、マスター端末にも自分用のカード、伏せ入力、開示、投票パネルが表示されます。

## 進行仕様

ゲーム開始後、まず全員にお題と役職カードを表示します。全員が「確認」を押すと、マスター画面に「ゲーム開始」ボタンが表示され、伏せ入力へ進みます。
占い師を入れる設定は参加者が4人以上のとき有効です。1週目は選ばれた本人にも村人として表示され、2週目開始時に占い師へ切り替わり、ヒントが表示されます。
伏せ入力時間は目安です。時間を過ぎても未送信者は入力できますが、警告が表示され、マスターは進行管理画面から強制的に開示フェーズへ進められます。

## ローカルテスト

```bash
node tests/core.test.js
node --check game-core.js
node --check app.js
```
