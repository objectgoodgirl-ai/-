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
| `apps/web` | 使用者操作的前端網站與登入頁面 |
| `apps/api` | 後端 API、權限檢查、LINE／n8n 回呼驗證 |
| `functions` | Firebase Cloud Functions 或 Vercel Serverless Functions |
| `docs` | 需求、權限、資料模型與串接文件 |
| `docs/integrations` | LINE、Gmail、n8n、Firebase 等外部服務串接規格 |
| `n8n/workflows` | 可匯入 n8n 的工作流程 JSON |
| `firebase` | Firestore 安全規則、索引與部署設定 |
| `scripts` | 維護與資料處理腳本 |

## 開發順序

1. Firebase Authentication 的 Google 登入與員工角色資料。
2. Firestore 資料模型及安全規則。
3. 案件、派工、班表及員工確認頁面。
4. LINE 官方帳號與 n8n 派工通知、30 分鐘逾時提醒。
5. 報價版本、簽約後家屬同意與 PDF 列印。

## 角色

| 角色 | 主要權限 |
| --- | --- |
| 老闆 | 全系統、成本、利潤、最低單價、核准 |
| 經理／主管 | 案件交接、請假與排班核准、異常處理 |
| 主負責人 | 檢視全案、修改自己負責案件、派工與追蹤 |
| 員工 | 查看團隊班表、確認本人派工、更新指定工作完成狀態 |

> 正式權限必須由後端與 Firestore Security Rules 驗證；不可只用前端按鈕隱藏。
