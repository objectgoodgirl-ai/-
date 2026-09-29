# 弘遠殯葬營運管理系統

弘遠股份有限公司使用的殯葬案件、派工、班表、報價、SOP 與訓練管理系統。

## GitHub 命名

- 儲存庫名稱：`hongyuan-funeral-operations`
- GitHub 類別（Topics）：`funeral-management`、`case-management`、`workforce-scheduling`、`quotation`、`firebase`、`n8n`、`line-messaging`
- 正式系統名稱：**弘遠殯葬營運管理系統**
- 英文名稱：**Hongyuan Funeral Operations System**

## 專案結構

| 資料夾 | 用途 |
| --- | --- |
| `apps/web` | 使用者操作的前端網站、Google 登入與帳號權限頁面 |
| `apps/api` | 後端 API、權限檢查、LINE／n8n 回呼驗證 |
| `functions` | Firebase Cloud Functions 或 Vercel Serverless Functions |
| `docs` | 需求、權限、資料模型與串接文件 |
| `docs/integrations` | LINE、Gmail、n8n、Firebase 等外部服務串接規格 |
| `n8n/workflows` | 可匯入 n8n 的工作流程 JSON |
| `firebase` | Firestore 安全規則、索引與部署設定 |
| `scripts` | 維護與資料處理腳本 |

## 已完成

- Firebase Authentication 的 Google 登入。
- Vercel 正式網站部署。
- Firestore 權限設定檔：員工邀請、角色、案件主負責人與協作人員。
- 網站「帳號與案件權限」管理頁。

## 啟用流程

1. 在 Firebase 建立 Cloud Firestore Standard 版，資料位置選 `asia-east1 (Taiwan)`。
2. 發布 [Firestore 規則](firebase/firestore.rules)。
3. 初始老闆以 `objectgoodgirl@gmail.com` 登入網站一次。
4. 進入「帳號與案件權限」建立員工 Gmail 邀請。
5. 員工登入後，在同頁設定案件主負責人與協作人員。

完整資料結構請見 [Firestore 權限管理](docs/firestore-權限管理.md)。

## 開發順序

1. 將案件、派工、班表與報價由瀏覽器示範資料移轉到 Firestore。
2. 以 Cloud Functions 實作稽核紀錄、案件交接、低於底價的核准。
3. LINE 官方帳號與 n8n 派工通知、30 分鐘逾時提醒。
4. 報價版本、簽約後家屬同意與 PDF 列印。

## 角色

| 角色 | 主要權限 |
| --- | --- |
| 老闆 | 全系統、成本、利潤、最低單價、帳號角色、核准 |
| 經理 | 員工邀請、案件交接、請假與排班核准、異常處理 |
| 主管 | 班表、人員安排、進度追蹤 |
| 主負責人 | 檢視全案、修改自己負責案件、派工與追蹤 |
| 員工 | 查看本人派工、確認工作、更新指定工作完成狀態 |

> 權限會由 Firestore Security Rules 驗證；不可只用前端按鈕隱藏。
