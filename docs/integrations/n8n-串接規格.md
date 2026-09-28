# 弘遠股份有限公司｜LINE、Gmail 與 n8n 串接規格

## 建議架構

```text
前端網頁 ⇄ 系統後端／資料庫 ⇄ n8n ⇄ LINE Messaging API／Gmail
                         ↑
              LINE Webhook（員工回覆）
```

- **系統後端與資料庫**：保存案件、員工、派工、確認狀態、權限及通知紀錄。正式多人使用不可只靠瀏覽器本機資料。
- **n8n**：接收系統事件、編排通知、定時檢查逾時，並把通知結果回報系統。
- **LINE 官方帳號**：傳送派工、班表異動、確認提醒；員工回覆後由 Webhook 收到事件。
- **Google 登入**：由系統使用 Google Identity Services／OAuth 驗證員工身分；不要把 n8n 當成網站登入或權限系統。
- **Gmail**：可用於主管電子郵件通知或寄送摘要；不取代 Google 登入。

LINE 官方文件說明，Messaging API 透過 HTTPS Webhook 接收事件並以 push／reply API 傳送訊息；接收 Webhook 時必須驗證簽章，避免偽造請求。[LINE Webhook 文件](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)、[LINE 訊息 API](https://developers.line.biz/en/reference/messaging-api/)。Google 也將登入驗證與 API 授權分開說明，登入宜用 Google Sign-In 流程。[Google Identity 文件](https://developers.google.com/identity/oauth2/web/guides/overview)。

## n8n 工作流程

| 工作流程 | 觸發條件 | n8n 處理 | 系統應記錄 |
|---|---|---|---|
| 派工通知 | 案件負責人儲存派工 | 對每位被指派員工發送個人 LINE 確認訊息 | 通知時間、對象、LINE 回傳訊息 ID、送達／失敗狀態 |
| 員工確認 | LINE Webhook 收到確認／無法出勤 | 驗證 Webhook、核對一次性確認代碼、回寫該員工的派工狀態 | 回覆內容、回覆時間、對應派工版本 |
| 逾時提醒主管 | 派工通知送出 30 分鐘仍未確認 | 定時查詢未確認派工，通知主管／主負責人 | 提醒時間、主管、處理狀態 |
| 派工異動重通知 | 日期、時段、工作或人員變更 | 將新版本通知所有受影響員工，舊確認標記為失效 | 變更前後資料、版本、重新確認狀態 |
| 班表異動 | 管理者發布班表或臨時調整 | 通知受影響員工；必要時通知主管 | 班表版本及每位員工確認狀態 |
| 請假結果 | 主管核准／退回 | 通知員工；核准時同步提醒相關派工需重新安排 | 審核人、結果、通知狀態 |
| 案件交接 | 主管核准轉交 | 通知新主負責人確認接手，並通知原團隊 | 原／新負責人、核准人、交接確認 |
| 通知失敗處理 | LINE／Gmail API 回傳錯誤 | 重試有限次數；仍失敗則建立待處理紀錄並通知管理者 | 錯誤碼、重試次數、最後結果 |

## 派工通知與確認資料格式

系統後端可用 HTTPS POST 呼叫 n8n Webhook。以下是建議事件格式，實際網址由部署後設定：

```json
{
  "event": "assignment.published",
  "eventId": "evt_01J...",
  "assignmentId": "as_01J...",
  "caseId": "HY-2026-0928",
  "caseLabel": "王○○告別式",
  "task": "告別式流程執行",
  "startsAt": "2026-10-03T08:00:00+08:00",
  "location": "服務地點",
  "revision": 2,
  "employees": [
    {"employeeId": "emp_01", "lineUserId": "U...", "name": "員工甲"}
  ],
  "confirmationToken": "one-time-random-token",
  "callbackUrl": "https://app.example.tw/api/line/assignment-confirmation"
}
```

訊息至少包含案件代碼或適當遮蔽的稱呼、工作內容、日期時間、集合地點、回覆期限，以及「確認／無法出勤」操作。確認代碼應不可猜測、具期限、只能使用一次，且不要把家屬完整個資放進通知內容。

## 權限與安全規則

1. 前端不得存放 LINE Channel Access Token、Google Client Secret、n8n API Key 或資料庫密碼。
2. n8n Webhook 使用 HTTPS；系統呼叫 n8n 時加入共享簽章或 Bearer Token，並驗證事件 ID 避免重複處理。
3. LINE Webhook 必須依官方規格驗證 `X-Line-Signature`。建議由後端驗證原始 request body 後，再交由 n8n 處理，以免轉送過程改變簽章資料。
4. LINE 回覆的確認只更新該員工、該派工版本的狀態；排班衝突阻擋仍由系統後端判定，不能只靠 n8n。
5. 全體員工可看團隊班表；案件家屬資料依案件關係限制；只有老闆可看成本、利潤及最低單價。
6. Google OAuth 登入成功後，仍要在系統資料庫核對員工帳號是否啟用，以及其角色／案件權限。Google 電子郵件相同不代表自動取得主管權限。
7. 通知與登入事件保留稽核紀錄；避免把完整個資、存取權杖或秘密寫進 n8n 執行紀錄。

## 正式串接前需要準備

- 將系統部署至正式網域，並啟用 HTTPS。
- 選定後端與資料庫；確認案件、員工、派工、班表及通知紀錄的資料模型。
- 建立可從網際網路連線的 n8n 環境，設定 Webhook URL、備份、存取權限與憑證儲存。
- 建立 LINE 官方帳號並啟用 Messaging API；取得 Channel ID／Secret／Access Token，並設定 Webhook URL。
- 建立 Google Cloud 專案及 OAuth 用戶端；設定正式網域、授權來源與登入回呼網址。
- 員工需先將 LINE 官方帳號加為好友並完成 LINE 帳號綁定，系統才能將通知送到正確員工。
- 設定 Gmail 寄件帳號與最小必要 OAuth 權限（如有寄信需求）。

## 建置順序

1. **先建後端與資料庫**：讓案件、員工、角色、派工、版本與通知狀態能多人共用。
2. **先完成 LINE 綁定與派工確認**：測試個別派送、確認、無法出勤、30 分鐘逾時提醒。
3. **加入異動重通知與通知失敗處理**：異動後舊確認失效；每次送出有紀錄與重試結果。
4. **加入 Google 登入與角色核對**：主負責人、主管、老闆採資料庫授權，不能只依賴前端切換角色。
5. **最後加入 Gmail 摘要通知及正式環境監控**。

## 驗收條件

- 每位被指派員工都收到個別通知，且可獨立確認。
- 30 分鐘未確認時，系統有主管提醒及可追蹤紀錄。
- 派工異動會讓舊確認失效並要求受影響員工重新確認。
- 同一 Webhook 重送不會重複建立確認紀錄或重複改派工狀態。
- LINE／Gmail 發送失敗可查原因、重試，並呈現在系統內。
- Google 登入後依系統角色限制資料；主負責人只修改負責案件，主管核准交接，成本利潤僅老闆可見。

> 目前網頁原型尚無後端、資料庫、LINE 官方帳號或 Google OAuth 設定；本文件是正式開發與 n8n 設定的實作規格，不代表服務已完成連線。
