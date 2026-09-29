# Firebase Google 登入設定

## 已完成

- Firebase 專案：`hongyuan-funeral-ops-tw`
- 網頁應用程式：`弘遠殯葬營運管理系統 Web`
- Firebase Authentication：Google 登入已啟用
- 初始系統管理員：`objectgoodgirl@gmail.com`

## 目前登入規則

原型網站已接入 Firebase Google 登入。為避免未核准帳號直接看到營運資料，現階段僅初始系統管理員可進入系統。其他 Google 帳號會顯示待核准訊息。

下一階段建立 Firestore 後，應以 `users/{uid}` 儲存帳號、角色、啟用狀態與核准人，並由 Firestore Security Rules 強制驗證權限。不得把前端名單當成正式權限機制。

## 部署前設定

Google 登入不能在 `file:///` 網址上使用。部署至 Vercel 或 Firebase Hosting 後，請到 Firebase Console 的 **Authentication → 設定 → 授權網域**，加入正式網站網域，例如：

- `your-project.vercel.app`
- 公司自有網域

Firebase Web Config 中的 API Key 是用於識別 Firebase 專案的公開設定，並非伺服器密鑰。服務帳戶金鑰、LINE Token、n8n Webhook Secret 等真正機密不可放入前端或 GitHub。
