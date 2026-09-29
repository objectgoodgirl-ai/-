# Firebase Google 登入設定

## 已完成

- Firebase 專案：`hongyuan-funeral-ops-tw`
- 網頁應用程式：`弘遠殯葬營運管理系統 Web`
- Firebase Authentication：Google 登入已啟用
- 初始系統管理員：`objectgoodgirl@gmail.com`

## 登入與權限規則

Google 登入負責識別使用者；帳號是否啟用、系統角色與案件責任由 Firestore 控管。

- 初始老闆登入一次後，系統建立 `users/{uid}` 的老闆帳號。
- 老闆或經理建立 Gmail 邀請後，員工第一次用相同帳號登入會自動啟用。
- 只有老闆／經理能看見「帳號與案件權限」頁面。
- 只有案件主負責人，以及老闆／經理，能修改該案件。
- 成本、最低單價與利潤獨立放在 Firestore 私密子文件，只開放老闆。

資料結構與規則請見 [Firestore 權限管理](firestore-權限管理.md)。

## 部署前設定

Google 登入不能在 `file:///` 網址上使用。部署至 Vercel 或 Firebase Hosting 後，請到 Firebase Console 的 **Authentication → 設定 → 授權網域**，加入正式網站網域，例如：

- `your-project.vercel.app`
- 公司自有網域

Firebase Web Config 中的 API Key 是用於識別 Firebase 專案的公開設定，並非伺服器密鑰。服務帳戶金鑰、LINE Token、n8n Webhook Secret 等真正機密不可放入前端或 GitHub。
