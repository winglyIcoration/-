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

Firebase Web configはブラウザアプリ用の公開設定です。秘密鍵ではありません。

## ローカルテスト

```bash
node tests/core.test.js
node --check game-core.js
node --check app.js
```
