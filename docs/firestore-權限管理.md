# Firestore 權限與帳號管理

## 雲端資料結構

| 路徑 | 用途 | 可讀取者 | 可寫入者 |
| --- | --- | --- | --- |
| `users/{uid}` | Google 登入者、角色、啟用狀態 | 本人、老闆、經理 | 本人只能改顯示資料；老闆可調整角色與狀態 |
| `invitations/{email}` | 預先核准的 Gmail、預設角色、邀請狀態 | 該 Gmail、老闆、經理 | 老闆、經理 |
| `cases/{caseId}` | 案件主負責人、協作人員 UID | 老闆、經理、主負責人、協作人員 | 老闆、經理；主負責人不可改責任名單 |
| `cases/{caseId}/private/finance` | 成本、最低單價、利潤 | 老闆 | 老闆 |
| `auditLogs/{logId}` | 稽核紀錄 | 老闆、經理 | 後續由 Cloud Function 寫入 |
| `quotes/{quoteId}` | 報價版本、服務項目、訂金與期限 | 所有已啟用帳號 | 老闆、經理、該案件主負責人 |
| `quotes/{quoteId}/private/finance` | 成本、最低單價、利潤資料 | 老闆 | 老闆 |
| `staffProfiles/{staffId}` | 員工職務、技能與輪班範本 | 所有已啟用帳號 | 老闆、經理 |
| `assignments/{assignmentId}` | 案件派工、確認狀態與衝突設定 | 所有已啟用帳號 | 老闆、經理 |
| `leaves/{leaveId}` | 請假申請與核准結果 | 所有已啟用帳號 | 老闆、經理 |
| `tasks/{taskId}` | SOP 待辦與完成狀態 | 所有已啟用帳號 | 老闆、經理 |
| `rosterOverrides/{date|staffId}` | 每日班表調整 | 所有已啟用帳號 | 老闆、經理 |
| `settings/dispatch` | 輪班週期、交通緩衝與工作預設時間 | 所有已啟用帳號 | 老闆、經理 |

> 成本、最低單價與利潤不能與一般案件欄位放在同一份文件。Firestore 安全規則以文件為單位授權，無法在讀取同一份文件時安全隱藏個別欄位。

## 帳號開通流程

1. 老闆或經理在「帳號與案件權限」輸入員工姓名、Google 帳號及預設角色。
2. 系統在 `invitations/{email}` 建立啟用中的邀請。
3. 員工以相同 Google 帳號登入。
4. 系統建立 `users/{uid}`，並套用邀請角色。
5. 老闆可調整既有帳號角色或停用帳號。
6. 老闆或經理為案件指定一位主負責人與多位協作人員。
7. 第一次以老闆或經理登入新版網站時，系統會將既有示範案件、員工、派工、班表、請假與待辦寫入 Firestore；之後團隊成員讀到的是同一份雲端資料。

## 角色

| 角色 | 權限 |
| --- | --- |
| `owner` | 全部資料與財務資料；可調整帳號角色、啟用狀態與案件分工。 |
| `manager` | 建立員工邀請、管理案件分工與營運資料；不可讀取財務子文件。 |
| `supervisor` | 後續可擴充班表與人員核准權限。 |
| `case_lead` | 修改被指派給自己的案件內容；不可轉交案件或調整協作名單。 |
| `employee` | 查看團隊案件與工作；不得修改案件與派工。 |

## 初始化順序

1. 在 Firebase Console 建立 **Cloud Firestore Standard 版**，位置選擇 `asia-east1 (Taiwan)`。
2. 在 Cloud Firestore 的「規則」頁貼上並發布 [firestore.rules](../firebase/firestore.rules)。
3. 使用 `objectgoodgirl@gmail.com` 登入正式網站一次，系統會建立第一位老闆帳號。
4. 開啟「帳號與案件權限」，建立第一位員工邀請。
5. 員工用受邀 Gmail 登入後，回到權限頁設定角色與案件分工。

## 部署檔案

- [firebase.json](../firebase.json) 指向 Firestore 規則與索引檔。
- [.firebaserc](../.firebaserc) 已綁定 Firebase 專案 `hongyuan-funeral-ops-tw`。
- [firestore.indexes.json](../firebase/firestore.indexes.json) 目前沒有複合索引需求。

## 後續擴充

- 使用 Cloud Functions 寫入不可偽造的稽核紀錄。
- 以 Cloud Functions 處理案件交接、低於最低單價的核准，以及 LINE／n8n 通知。
- 讓主負責人可直接更新自己案件的派工與待辦，同時保留主管核准流程。
