import { auth, db } from "./firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// 所有營運資料都由此模組寫入 Firestore。localStorage 僅保留為離線暫存，
// 不再是團隊共用資料的來源。
const CASE_SEED = [
  { caseId: "HY-2026-0928", deceasedName: "林○○ 先生", familyContact: "林小姐", ownerName: "王怡婷", stage: "儀式準備", nextStep: "確認禮廳檔期", expectedAt: "2026-09-30T10:00", status: "待確認" },
  { caseId: "HY-2026-0927", deceasedName: "陳○○ 女士", familyContact: "陳先生", ownerName: "張志明", stage: "服務執行", nextStep: "告別式流程執行", expectedAt: "2026-09-29T09:00", status: "進行中" },
  { caseId: "HY-2026-0926", deceasedName: "黃○○ 先生", familyContact: "黃小姐", ownerName: "李佩珊", stage: "報價洽談", nextStep: "追蹤報價回覆", expectedAt: "2026-09-28T15:00", status: "需追蹤" },
  { caseId: "HY-2026-0924", deceasedName: "吳○○ 先生", familyContact: "吳先生", ownerName: "王怡婷", stage: "待結案", nextStep: "核對尾款與文件", expectedAt: "2026-09-28T16:00", status: "待處理" },
  { caseId: "HY-2026-0922", deceasedName: "許○○ 女士", familyContact: "許先生", ownerName: "張志明", stage: "需求確認", nextStep: "安排接運時間", expectedAt: "2026-09-28T10:00", status: "進行中" },
];

let access = null;
let currentCases = [];
let started = false;
let remoteIds = { staff: new Set(), assignments: new Set(), leaves: new Set(), tasks: new Set(), overrides: new Set() };

function manager() {
  return access?.profile?.active && ["owner", "manager"].includes(access.profile.role);
}

function active() {
  return Boolean(access?.profile?.active && access?.user);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function dateText(value) {
  if (!value) return "未排定";
  const [date, time] = String(value).split("T");
  const [, month, day] = date.split("-");
  return `${month}/${day}${time ? ` ${time.slice(0, 5)}` : ""}`;
}

function statusClass(status) {
  if (String(status).includes("進行")) return "p-green";
  if (String(status).includes("需")) return "p-red";
  if (String(status).includes("待") || String(status).includes("確認")) return "p-gold";
  return "p-gray";
}

function canEdit(caseData) {
  return manager() || caseData.leadUid === access?.user?.uid;
}

function renderCases() {
  const body = document.querySelector("#caseTable tbody");
  if (!body) return;
  const sorted = [...currentCases].sort((a, b) => String(b.expectedAt || "").localeCompare(String(a.expectedAt || "")));
  body.innerHTML = sorted.length ? sorted.map((item) => {
    const actions = canEdit(item)
      ? `<span data-case-actions style="display:inline-flex;gap:4px"><button class="btn" style="padding:5px 9px" onclick="editCase(this)">編輯</button>${manager() ? `<button class="btn" style="padding:5px 9px;color:#a65f50" onclick="deleteCase(this)">刪除</button>` : ""}</span>`
      : `<span class="sub">僅主負責人可修改</span>`;
    return `<tr data-case-id="${escapeHtml(item.caseId)}" data-date="${escapeHtml(item.expectedAt?.slice(0, 10) || "")}" data-time="${escapeHtml(item.expectedAt?.slice(11, 16) || "")}" data-phone="${escapeHtml(item.phone || "")}" data-need="${escapeHtml(item.needSummary || "")}" data-source="${escapeHtml(item.source || "")}">
      <td><span class="caseid">${escapeHtml(item.caseId)}</span><span class="sub">${escapeHtml(item.deceasedName || item.displayName || "未命名")}</span></td>
      <td>${escapeHtml(item.familyContact || "未填寫")}</td><td>${escapeHtml(item.ownerName || "待指派")}</td>
      <td>${escapeHtml(item.stage || "需求確認")}</td><td>${escapeHtml(item.nextStep || "尚未安排")}</td>
      <td>${dateText(item.expectedAt)}</td><td><span class="pill ${statusClass(item.status)}">${escapeHtml(item.status || "待處理")}</span></td><td>${actions}</td></tr>`;
  }).join("") : `<tr><td colspan="8" class="sub">目前沒有案件資料。</td></tr>`;
}

function caseFromRow(row) {
  const cells = row.cells;
  const date = row.dataset.date || "";
  const time = row.dataset.time || "";
  return {
    caseId: row.dataset.caseId || cells[0]?.querySelector(".caseid")?.textContent?.trim(),
    deceasedName: cells[0]?.querySelector(".sub")?.textContent?.trim() || "",
    familyContact: cells[1]?.innerText.trim() || "",
    ownerName: cells[2]?.innerText.trim() || "",
    stage: cells[3]?.innerText.trim() || "需求確認",
    nextStep: cells[4]?.innerText.trim() || "尚未安排",
    expectedAt: date ? `${date}T${time || "00:00"}` : "",
    status: cells[6]?.querySelector(".pill")?.textContent?.trim() || "待處理",
    phone: row.dataset.phone || "",
    needSummary: row.dataset.need || "",
    source: row.dataset.source || "",
  };
}

async function seedCases() {
  if (!manager()) return;
  const snapshot = await getDocs(collection(db, "cases"));
  const existing = new Set(snapshot.docs.map((item) => item.id));
  const missing = CASE_SEED.filter((item) => !existing.has(item.caseId));
  if (!missing.length) return;
  const batch = writeBatch(db);
  missing.forEach((item) => batch.set(doc(db, "cases", item.caseId), {
    ...item,
    displayName: item.deceasedName,
    leadUid: access.user.uid,
    memberUids: [access.user.uid],
    createdByUid: access.user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  await batch.commit();
}

async function createOrUpdateCase(fields, existing = null) {
  if (!active()) return;
  const caseId = existing?.caseId || `HY-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  if (!existing && !manager()) throw new Error("只有老闆或經理可以建立案件");
  const previous = existing || {};
  const data = {
    ...fields,
    caseId,
    displayName: fields.deceasedName,
    leadUid: previous.leadUid || access.user.uid,
    memberUids: previous.memberUids?.length ? previous.memberUids : [access.user.uid],
    updatedByUid: access.user.uid,
    updatedByName: access.profile.displayName || access.user.email,
    updatedAt: serverTimestamp(),
  };
  if (!existing) {
    data.createdByUid = access.user.uid;
    data.createdAt = serverTimestamp();
  }
  await setDoc(doc(db, "cases", caseId), data, { merge: true });
}

function overrideCaseControls() {
  const originalInlineSave = window.saveInlineCase;
  window.saveInlineCase = async (row, button) => {
    const before = currentCases.find((item) => item.caseId === row.dataset.caseId || item.caseId === row.cells[0]?.querySelector(".caseid")?.textContent?.trim());
    if (!before || !canEdit(before)) {
      window.toast?.("只有此案件的主負責人或老闆／經理可以儲存修改");
      return;
    }
    originalInlineSave(row, button);
    try {
      await createOrUpdateCase(caseFromRow(row), before);
      window.toast?.("案件資料已同步至雲端");
    } catch (error) {
      console.error(error);
      window.toast?.("無法同步案件資料，請確認您的權限或網路連線");
    }
  };

  window.saveCase = async () => {
    const name = document.getElementById("mName")?.value.trim();
    if (!name) return window.toast?.("請先填寫往生者姓名");
    const rowIndex = document.getElementById("mRowIndex")?.value;
    const row = rowIndex !== "" && rowIndex !== undefined ? document.querySelectorAll("#caseTable tbody tr")[Number(rowIndex)] : null;
    const existingId = row?.dataset.caseId || row?.cells[0]?.querySelector(".caseid")?.textContent?.trim();
    const existing = currentCases.find((item) => item.caseId === existingId);
    if (existing && !canEdit(existing)) return window.toast?.("只有此案件的主負責人或老闆／經理可以儲存修改");
    const expectedDate = document.getElementById("mDate")?.value || "";
    const fields = {
      deceasedName: name,
      familyContact: document.getElementById("mContact")?.value.trim() || "未填寫",
      phone: document.getElementById("mPhone")?.value.trim() || "",
      ownerName: document.getElementById("mOwner")?.value.trim() || "待指派",
      stage: document.getElementById("mStage")?.value || "需求確認",
      nextStep: document.getElementById("mNext")?.value.trim() || "尚未安排",
      expectedAt: expectedDate ? `${expectedDate}T00:00` : "",
      needSummary: document.getElementById("mNeed")?.value.trim() || "",
      source: document.getElementById("mSource")?.value || "",
      status: existing?.status || "新案件",
    };
    try {
      await createOrUpdateCase(fields, existing);
      window.closeModal?.();
      window.toast?.(existing ? "案件資料已更新並同步雲端" : "案件已建立並同步雲端");
    } catch (error) {
      console.error(error);
      window.toast?.(error.message || "無法建立案件");
    }
  };

  window.deleteCase = async (button) => {
    const row = button.closest("tr");
    const caseId = row?.dataset.caseId || row?.cells[0]?.querySelector(".caseid")?.textContent?.trim();
    if (!manager()) return window.toast?.("案件刪除只開放老闆或經理處理");
    if (!window.confirm(`確定要刪除案件 ${caseId} 嗎？此操作無法復原。`)) return;
    try {
      const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js");
      await deleteDoc(doc(db, "cases", caseId));
      window.toast?.("案件已從雲端刪除");
    } catch (error) {
      console.error(error);
      window.toast?.("無法刪除案件，請確認您的權限");
    }
  };
}

function quoteForCloud(version) {
  const publicItems = version.items.map(({ cost, min, ...item }) => item);
  const privateItems = version.items.map(({ cost, min }) => ({ cost: Number(cost || 0), min: Number(min || 0) }));
  return { publicItems, privateItems };
}

async function saveQuoteVersion(version) {
  if (!active()) return;
  const { publicItems, privateItems } = quoteForCloud(version);
  const parsedCaseId = String(version.caseId || "").split(/[｜|/]/)[0].trim();
  const quoteRef = doc(db, "quotes", version.id);
  await setDoc(quoteRef, {
    quoteId: version.id,
    caseId: parsedCaseId || version.caseId || "未指定案件",
    editor: version.editor,
    editorUid: access.user.uid,
    createdAtClient: version.createdAt,
    items: publicItems,
    discount: Number(version.discount || 0),
    deposit: Number(version.deposit || 0),
    deadline: version.deadline || "",
    total: version.total || "$0",
    updatedAt: serverTimestamp(),
  });
  if (access.profile.role === "owner") {
    await setDoc(doc(db, "quotes", version.id, "private", "finance"), { items: privateItems, updatedAt: serverTimestamp() });
  }
}

async function publishCloudQuotes(snapshot) {
  const versions = await Promise.all(snapshot.docs.map(async (item) => {
    const quote = { id: item.id, ...item.data(), createdAt: item.data().createdAtClient || new Date().toISOString() };
    if (access?.profile?.role === "owner") {
      const finance = await getDoc(doc(db, "quotes", item.id, "private", "finance"));
      if (finance.exists()) quote.items = quote.items.map((line, index) => ({ ...line, ...finance.data().items?.[index] }));
    }
    return quote;
  }));
  versions.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  window.hyQuoteOperations?.replaceCloudVersions(versions);
}

function collectRemoteData() {
  return { employees: [], assignments: [], leaves: [], tasks: [], overrides: {}, settings: null };
}

const remote = collectRemoteData();
function applyRemoteData() {
  if (!remote.settings) return;
  window.hyPrototypeOperations?.set({
    employees: remote.employees,
    assignments: remote.assignments,
    leaves: remote.leaves,
    tasks: remote.tasks,
    overrides: remote.overrides,
    settings: remote.settings,
  });
}

function listenOperations() {
  onSnapshot(collection(db, "staffProfiles"), (snapshot) => {
    remoteIds.staff = new Set(snapshot.docs.map((item) => item.id));
    remote.employees = snapshot.docs.map((item) => decodeEmployee(item.id, item.data())); applyRemoteData();
  });
  onSnapshot(collection(db, "assignments"), (snapshot) => {
    remoteIds.assignments = new Set(snapshot.docs.map((item) => item.id));
    remote.assignments = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })); applyRemoteData();
  });
  onSnapshot(collection(db, "leaves"), (snapshot) => {
    remoteIds.leaves = new Set(snapshot.docs.map((item) => item.id));
    remote.leaves = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })); applyRemoteData();
  });
  onSnapshot(collection(db, "tasks"), (snapshot) => {
    remoteIds.tasks = new Set(snapshot.docs.map((item) => item.id));
    remote.tasks = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })); applyRemoteData();
  });
  onSnapshot(collection(db, "rosterOverrides"), (snapshot) => {
    remoteIds.overrides = new Set(snapshot.docs.map((item) => item.id));
    remote.overrides = Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data()])); applyRemoteData();
  });
  onSnapshot(doc(db, "settings", "dispatch"), (snapshot) => {
    remote.settings = snapshot.exists() ? snapshot.data() : null; applyRemoteData();
  });
}

async function seedOperations() {
  if (!manager() || (await getDoc(doc(db, "settings", "dispatch"))).exists()) return;
  await syncHrData(window.hyPrototypeOperations?.get());
}

async function syncCollection(batch, path, values, known) {
  const ids = new Set(values.map((value) => value.id));
  values.forEach(({ id, ...data }) => batch.set(doc(db, path, id), { ...data, updatedAt: serverTimestamp() }, { merge: true }));
  [...known].filter((id) => !ids.has(id)).forEach((id) => batch.delete(doc(db, path, id)));
}

function encodeEmployee(employee) {
  const { patterns, ...data } = employee;
  // Firestore 不接受陣列內再放陣列；輪班週次改為 map，讀回網站時再還原。
  const patternMap = Object.fromEntries((patterns || []).map((week, index) => [`week${index}`, week]));
  return { ...data, patterns: patternMap };
}

function decodeEmployee(id, data) {
  const patternSource = data.patterns || {};
  const patterns = Array.isArray(patternSource)
    ? patternSource
    : Object.entries(patternSource)
      .sort(([first], [second]) => first.localeCompare(second, undefined, { numeric: true }))
      .map(([, week]) => week);
  return { id, ...data, patterns };
}

async function syncHrData(data) {
  if (!data || !manager()) return;
  try {
    const batch = writeBatch(db);
    await syncCollection(batch, "staffProfiles", (data.employees || []).map(encodeEmployee), remoteIds.staff);
    await syncCollection(batch, "assignments", data.assignments || [], remoteIds.assignments);
    await syncCollection(batch, "leaves", data.leaves || [], remoteIds.leaves);
    await syncCollection(batch, "tasks", data.tasks || [], remoteIds.tasks);
    const overrides = Object.entries(data.overrides || {}).map(([id, value]) => ({ id, ...value }));
    await syncCollection(batch, "rosterOverrides", overrides, remoteIds.overrides);
    batch.set(doc(db, "settings", "dispatch"), { ...(data.settings || {}), updatedAt: serverTimestamp() }, { merge: true });
    await batch.commit();
  } catch (error) {
    console.error("無法同步派工資料：", error);
    window.toast?.("派工資料尚未同步，請確認登入權限與網路連線");
  }
}

function start(accessState) {
  if (started || !accessState?.profile?.active) return;
  access = accessState;
  started = true;
  overrideCaseControls();
  onSnapshot(collection(db, "cases"), async (snapshot) => {
    currentCases = snapshot.docs.map((item) => ({ caseId: item.id, ...item.data() }));
    renderCases();
    try { await seedCases(); } catch (error) { console.warn("案件初始資料尚未建立：", error); }
  }, (error) => console.error("案件同步失敗：", error));
  onSnapshot(collection(db, "quotes"), publishCloudQuotes, (error) => console.error("報價同步失敗：", error));
  listenOperations();
  seedOperations().catch((error) => console.warn("派工初始資料尚未建立：", error));
}

window.hyFirestoreData = { saveQuoteVersion, syncHrData };
window.addEventListener("hy-access-ready", (event) => start(event.detail));
if (auth.currentUser && window.hyAccess) start(window.hyAccess);
