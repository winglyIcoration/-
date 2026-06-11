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

「✨ お題を完全におまかせ」は外部AI APIを使わず、アプリ内のローカル生成器でお題・制約・占い師ヒントを作ります。
通信、APIキー、無料枠制限に依存しないため、GitHub Pages上で安定して動きます。
生成された内容はゲーム開始後の参加者カードにだけ表示され、結果発表までマスター画面には表示されません。

## ローカルテスト

```bash
node tests/core.test.js
node --check game-core.js
node --check app.js
```
