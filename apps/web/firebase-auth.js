import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// Firebase 的網頁設定可安全放在前端；資料權限由 firestore.rules 控管。
const firebaseConfig = {
  apiKey: "AIzaSyAGStTrZnrh8VVPzsyTw0EkV5ZAw76Fh80",
  authDomain: "hongyuan-funeral-ops-tw.firebaseapp.com",
  projectId: "hongyuan-funeral-ops-tw",
  storageBucket: "hongyuan-funeral-ops-tw.firebasestorage.app",
  messagingSenderId: "476812183361",
  appId: "1:476812183361:web:c07ce68401cd3e763103c0",
};

const INITIAL_OWNER_EMAIL = "objectgoodgirl@gmail.com";
const CASES = [
  ["HY-2026-0928", "林○○ 先生"],
  ["HY-2026-0927", "陳○○ 女士"],
  ["HY-2026-0926", "黃○○ 先生"],
  ["HY-2026-0924", "吳○○ 先生"],
  ["HY-2026-0922", "許○○ 女士"],
];
const ROLE_LABELS = {
  owner: "老闆",
  manager: "經理",
  supervisor: "主管",
  case_lead: "主負責人",
  employee: "員工",
};
const INVITABLE_ROLES = ["manager", "supervisor", "case_lead", "employee"];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const gate = document.getElementById("authGate");
const appShell = document.getElementById("appShell");
const signInButton = document.getElementById("googleSignInButton");
const signOutButton = document.getElementById("signOutButton");
const gateSignOutButton = document.getElementById("gateSignOutButton");
const authMessage = document.getElementById("authMessage");
const profileAvatar = document.getElementById("profileAvatar");
const profileName = document.getElementById("profileName");
const profileRole = document.getElementById("profileRole");
const topUserName = document.getElementById("topUserName");
const dashboardGreeting = document.getElementById("dashboardGreeting");

let authEpoch = 0;
let profileUnsubscribe = null;
let managerUnsubscribes = [];
let currentAccess = { user: null, profile: null, users: [], invitations: [], casePermissions: {} };

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function userName(user) {
  return user.displayName || user.email?.split("@")[0] || "使用者";
}

function roleLabel(role) {
  return ROLE_LABELS[role] || "尚未設定";
}

function isOwnerProfile(profile) {
  return profile?.role === "owner" && profile?.active === true;
}

function isManagerProfile(profile) {
  return isOwnerProfile(profile) || (profile?.role === "manager" && profile?.active === true);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function setAuthMessage(message, type = "info") {
  authMessage.textContent = message;
  authMessage.dataset.type = type;
}

function updateProfile(user, profile) {
  const name = profile?.displayName || userName(user);
  profileAvatar.textContent = name.slice(0, 1);
  profileName.textContent = name;
  profileRole.textContent = roleLabel(profile?.role);
  topUserName.textContent = `${name}　⌄`;
  dashboardGreeting.textContent = `早安，${name}`;
}

function showGate(message, type = "info", canSignOut = false) {
  appShell.hidden = true;
  gate.hidden = false;
  gateSignOutButton.hidden = !canSignOut;
  setAuthMessage(message, type);
}

function showApplication(user, profile) {
  updateProfile(user, profile);
  gate.hidden = true;
  appShell.hidden = false;
  signOutButton.hidden = false;
}

function friendlyError(error) {
  const messages = {
    "auth/popup-closed-by-user": "登入視窗已關閉，尚未完成登入。",
    "auth/popup-blocked": "瀏覽器封鎖了登入視窗，請允許彈出式視窗後再試一次。",
    "auth/unauthorized-domain": "此網站網址尚未加入 Firebase 的授權網域。",
    "auth/network-request-failed": "網路連線異常，請確認網路後重試。",
  };
  return messages[error.code] || "Google 登入暫時無法完成，請稍後再試。";
}

function firestoreUnavailable(error) {
  return error?.code === "failed-precondition" || /Firestore.*not available/i.test(error?.message || "");
}

function clearSubscriptions() {
  if (profileUnsubscribe) profileUnsubscribe();
  profileUnsubscribe = null;
  managerUnsubscribes.forEach((unsubscribe) => unsubscribe());
  managerUnsubscribes = [];
}

async function prepareUserAccess(user) {
  const userRef = doc(db, "users", user.uid);
  const existing = await getDoc(userRef);
  if (existing.exists()) return existing.data();

  const email = normalizeEmail(user.email);
  if (email === INITIAL_OWNER_EMAIL) {
    const ownerProfile = {
      email: user.email,
      emailKey: email,
      displayName: userName(user),
      photoURL: user.photoURL || "",
      role: "owner",
      active: true,
      source: "initial_owner",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(userRef, ownerProfile);
    return { ...ownerProfile, createdAt: null, updatedAt: null };
  }

  const invitation = await getDoc(doc(db, "invitations", email));
  if (!invitation.exists() || invitation.data().status !== "active") return null;
  const invite = invitation.data();
  const profile = {
    email: user.email,
    emailKey: email,
    displayName: invite.displayName || userName(user),
    photoURL: user.photoURL || "",
    role: invite.role,
    active: true,
    invitationEmail: email,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(userRef, profile);
  return { ...profile, createdAt: null, updatedAt: null };
}

async function startGoogleSignIn() {
  if (window.location.protocol === "file:") {
    setAuthMessage("目前是以本機檔案開啟。請使用正式網站網址或 localhost 進行 Google 登入。", "warning");
    return;
  }

  signInButton.disabled = true;
  signInButton.textContent = "正在開啟 Google 登入…";
  try {
    await setPersistence(auth, browserLocalPersistence);
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  } catch (error) {
    setAuthMessage(friendlyError(error), "error");
  } finally {
    signInButton.disabled = false;
    signInButton.textContent = "使用 Google 帳號登入";
  }
}

async function logout() {
  await signOut(auth);
}

function currentUserCanEditCase(caseId) {
  if (!currentAccess.user || !currentAccess.profile?.active) return false;
  if (isManagerProfile(currentAccess.profile)) return true;
  return currentAccess.casePermissions[caseId]?.leadUid === currentAccess.user.uid;
}

function publishAccessState() {
  window.hyAccess = {
    user: currentAccess.user,
    profile: currentAccess.profile,
    canManageAccounts: isManagerProfile(currentAccess.profile),
    canEditCase: currentUserCanEditCase,
    roleLabel,
  };
  window.dispatchEvent(new CustomEvent("hy-access-ready", { detail: window.hyAccess }));
}

function updateAccessNavigation() {
  const nav = document.getElementById("accessNav");
  if (nav) nav.hidden = !isManagerProfile(currentAccess.profile);
}

async function loadCurrentCasePermissions() {
  const entries = await Promise.all(CASES.map(async ([caseId]) => {
    try {
      const snapshot = await getDoc(doc(db, "cases", caseId));
      return [caseId, snapshot.exists() ? snapshot.data() : null];
    } catch {
      return [caseId, null];
    }
  }));
  currentAccess.casePermissions = Object.fromEntries(entries.filter(([, value]) => value));
  publishAccessState();
}

function bindOwnProfile(user) {
  profileUnsubscribe = onSnapshot(doc(db, "users", user.uid), (snapshot) => {
    if (!snapshot.exists()) return;
    const profile = snapshot.data();
    currentAccess.profile = profile;
    if (!profile.active) {
      clearSubscriptions();
      showGate("此帳號已停用。請聯絡老闆或經理確認使用權限。", "warning", true);
      return;
    }
    updateProfile(user, profile);
    updateAccessNavigation();
    publishAccessState();
    if (isManagerProfile(profile)) startManagerListeners();
  }, (error) => console.warn("無法同步帳號權限：", error));
}

function startManagerListeners() {
  if (managerUnsubscribes.length || !isManagerProfile(currentAccess.profile)) return;
  managerUnsubscribes.push(onSnapshot(collection(db, "users"), (snapshot) => {
    currentAccess.users = snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }));
    renderAccessManagement();
  }, (error) => console.warn("無法讀取使用者名冊：", error)));
  managerUnsubscribes.push(onSnapshot(collection(db, "invitations"), (snapshot) => {
    currentAccess.invitations = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderAccessManagement();
  }, (error) => console.warn("無法讀取邀請名冊：", error)));
}

function accessStatus(message, type = "info") {
  const element = document.getElementById("accessStatus");
  if (!element) return;
  element.className = type === "error" ? "danger-box" : type === "warning" ? "warn-box" : "info-box";
  element.textContent = message;
}

function activeUsers() {
  return currentAccess.users
    .filter((item) => item.active)
    .sort((a, b) => String(a.displayName || a.email).localeCompare(String(b.displayName || b.email), "zh-Hant"));
}

function userOption(user, selected = false) {
  const label = `${user.displayName || user.email}｜${roleLabel(user.role)}`;
  return `<option value="${escapeHtml(user.uid)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function renderRoleOptions(selectedRole, includeManager = isOwnerProfile(currentAccess.profile)) {
  const roles = INVITABLE_ROLES.filter((role) => includeManager || role !== "manager");
  return roles.map((role) => `<option value="${role}"${selectedRole === role ? " selected" : ""}>${roleLabel(role)}</option>`).join("");
}

function renderAccessManagement() {
  if (!isManagerProfile(currentAccess.profile)) return;
  const inviteRole = document.getElementById("inviteRole");
  if (inviteRole && !inviteRole.dataset.ready) {
    inviteRole.innerHTML = renderRoleOptions("employee");
    inviteRole.dataset.ready = "true";
  }

  const users = activeUsers();
  const lead = document.getElementById("caseLead");
  const collaborators = document.getElementById("caseCollaborators");
  if (lead) {
    const previous = lead.value;
    lead.innerHTML = `<option value="">請選擇主負責人</option>${users.map((item) => userOption(item, item.uid === previous)).join("")}`;
  }
  if (collaborators) {
    const previous = new Set([...collaborators.selectedOptions].map((option) => option.value));
    collaborators.innerHTML = users.map((item) => userOption(item, previous.has(item.uid))).join("");
  }

  const invitationBody = document.getElementById("invitationBody");
  if (invitationBody) {
    const invitations = [...currentAccess.invitations].sort((a, b) => String(a.email).localeCompare(String(b.email)));
    invitationBody.innerHTML = invitations.length ? invitations.map((invite) => {
      const status = invite.status === "active" ? ["已開放登入", "p-green"] : [invite.status === "revoked" ? "已撤銷" : "待處理", "p-gold"];
      const canRevoke = invite.status === "active";
      return `<tr><td><b>${escapeHtml(invite.displayName || "未命名")}</b><span class="sub">${escapeHtml(invite.email)}</span></td><td>${escapeHtml(roleLabel(invite.role))}</td><td><span class="pill ${status[1]}">${status[0]}</span></td><td>${canRevoke ? `<button class="btn" data-revoke-invite="${escapeHtml(invite.id)}">撤銷</button>` : "—"}</td></tr>`;
    }).join("") : `<tr><td colspan="4" class="sub">目前尚未建立邀請。</td></tr>`;
  }

  const accountBody = document.getElementById("accountBody");
  if (accountBody) {
    const accounts = [...currentAccess.users].sort((a, b) => String(a.displayName || a.email).localeCompare(String(b.displayName || b.email), "zh-Hant"));
    accountBody.innerHTML = accounts.length ? accounts.map((account) => {
      const isSelf = account.uid === currentAccess.user?.uid;
      const canManage = isOwnerProfile(currentAccess.profile) && !isSelf && account.role !== "owner";
      const roleControl = canManage
        ? `<select class="inline-role" data-account-role="${escapeHtml(account.uid)}">${renderRoleOptions(account.role, true)}</select>`
        : escapeHtml(roleLabel(account.role));
      const status = account.active ? ["啟用", "p-green"] : ["停用", "p-red"];
      const action = canManage ? `<button class="btn" data-toggle-account="${escapeHtml(account.uid)}" data-next-active="${account.active ? "false" : "true"}">${account.active ? "停用" : "啟用"}</button>` : "—";
      return `<tr><td><b>${escapeHtml(account.displayName || "未命名")}</b><span class="sub">${escapeHtml(account.email)}</span></td><td>${roleControl}</td><td><span class="pill ${status[1]}">${status[0]}</span></td><td>${action}</td></tr>`;
    }).join("") : `<tr><td colspan="4" class="sub">尚未有已啟用帳號。</td></tr>`;
  }

  document.querySelectorAll("[data-revoke-invite]").forEach((button) => {
    button.addEventListener("click", () => revokeInvitation(button.dataset.revokeInvite));
  });
  document.querySelectorAll("[data-toggle-account]").forEach((button) => {
    button.addEventListener("click", () => updateAccount(button.dataset.toggleAccount, { active: button.dataset.nextActive === "true" }));
  });
  document.querySelectorAll("[data-account-role]").forEach((select) => {
    select.addEventListener("change", () => updateAccount(select.dataset.accountRole, { role: select.value }));
  });
}

async function saveInvitation() {
  if (!isManagerProfile(currentAccess.profile)) return;
  const name = document.getElementById("inviteName").value.trim();
  const email = normalizeEmail(document.getElementById("inviteEmail").value);
  const role = document.getElementById("inviteRole").value;
  if (!name || !email || !email.includes("@")) {
    accessStatus("請輸入員工姓名與有效的 Google 帳號。", "warning");
    return;
  }
  if (!INVITABLE_ROLES.includes(role) || (!isOwnerProfile(currentAccess.profile) && role === "manager")) {
    accessStatus("目前帳號沒有授予此角色的權限。", "error");
    return;
  }
  try {
    await setDoc(doc(db, "invitations", email), {
      email,
      displayName: name,
      role,
      status: "active",
      invitedByUid: currentAccess.user.uid,
      invitedByName: currentAccess.profile.displayName || userName(currentAccess.user),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true });
    document.getElementById("inviteName").value = "";
    document.getElementById("inviteEmail").value = "";
    accessStatus(`已開放 ${email} 使用 Google 登入；第一次登入後會自動建立帳號。`);
  } catch (error) {
    console.error(error);
    accessStatus("無法建立邀請，請確認 Firestore 已建立且安全規則已部署。", "error");
  }
}

async function revokeInvitation(email) {
  if (!isManagerProfile(currentAccess.profile)) return;
  if (!window.confirm(`確定撤銷 ${email} 的登入邀請？`)) return;
  try {
    await updateDoc(doc(db, "invitations", email), {
      status: "revoked",
      updatedAt: serverTimestamp(),
    });
    accessStatus("邀請已撤銷。若該帳號已啟用，請另外在帳號名冊將它停用。");
  } catch (error) {
    console.error(error);
    accessStatus("無法撤銷邀請。", "error");
  }
}

async function updateAccount(uid, changes) {
  if (!isOwnerProfile(currentAccess.profile)) {
    accessStatus("帳號角色與停用狀態只能由老闆調整。", "warning");
    return;
  }
  try {
    await updateDoc(doc(db, "users", uid), { ...changes, updatedAt: serverTimestamp() });
    accessStatus("帳號權限已更新；該員工重新整理或重新登入後會套用新權限。");
  } catch (error) {
    console.error(error);
    accessStatus("無法更新帳號權限。", "error");
  }
}

async function loadCaseAccess() {
  const caseId = document.getElementById("caseAccessCase")?.value;
  if (!caseId || !isManagerProfile(currentAccess.profile)) return;
  try {
    const snapshot = await getDoc(doc(db, "cases", caseId));
    const permission = snapshot.exists() ? snapshot.data() : { leadUid: "", memberUids: [] };
    currentAccess.casePermissions[caseId] = permission;
    const lead = document.getElementById("caseLead");
    const collaborators = document.getElementById("caseCollaborators");
    if (lead) lead.value = permission.leadUid || "";
    if (collaborators) [...collaborators.options].forEach((option) => {
      option.selected = (permission.memberUids || []).includes(option.value) && option.value !== permission.leadUid;
    });
    const caseStatus = document.getElementById("caseAccessStatus");
    if (caseStatus) caseStatus.textContent = permission.leadUid ? "已載入目前案件權限。" : "尚未設定權限；請指定一位主負責人。";
  } catch (error) {
    console.error(error);
    accessStatus("無法載入案件權限。", "error");
  }
}

async function saveCaseAccess() {
  if (!isManagerProfile(currentAccess.profile)) return;
  const caseId = document.getElementById("caseAccessCase").value;
  const displayName = CASES.find(([id]) => id === caseId)?.[1] || "案件";
  const leadUid = document.getElementById("caseLead").value;
  const collaboratorUids = [...document.getElementById("caseCollaborators").selectedOptions].map((option) => option.value);
  if (!leadUid) {
    accessStatus("每個案件都必須指定一位主負責人。", "warning");
    return;
  }
  const memberUids = [...new Set([leadUid, ...collaboratorUids])];
  try {
    await setDoc(doc(db, "cases", caseId), {
      caseId,
      displayName,
      leadUid,
      memberUids,
      accessUpdatedByUid: currentAccess.user.uid,
      accessUpdatedAt: serverTimestamp(),
    }, { merge: true });
    currentAccess.casePermissions[caseId] = { caseId, displayName, leadUid, memberUids };
    publishAccessState();
    const caseStatus = document.getElementById("caseAccessStatus");
    if (caseStatus) caseStatus.textContent = `已儲存：1 位主負責人、${Math.max(0, memberUids.length - 1)} 位協作人員。`;
  } catch (error) {
    console.error(error);
    accessStatus("無法儲存案件權限，請確認 Firestore 規則。", "error");
  }
}

function bindAccessManagement() {
  document.getElementById("saveInvitation")?.addEventListener("click", saveInvitation);
  document.getElementById("caseAccessCase")?.addEventListener("change", loadCaseAccess);
  document.getElementById("saveCaseAccess")?.addEventListener("click", saveCaseAccess);
}

signInButton.addEventListener("click", startGoogleSignIn);
signOutButton.addEventListener("click", logout);
gateSignOutButton.addEventListener("click", logout);
bindAccessManagement();

onAuthStateChanged(auth, async (user) => {
  const epoch = ++authEpoch;
  clearSubscriptions();
  currentAccess = { user: null, profile: null, users: [], invitations: [], casePermissions: {} };
  signOutButton.hidden = true;

  if (!user) {
    updateAccessNavigation();
    publishAccessState();
    showGate("請使用公司核准的 Google 帳號登入。", "info");
    return;
  }

  try {
    const profile = await prepareUserAccess(user);
    if (epoch !== authEpoch) return;
    if (!profile || !profile.active) {
      showGate(`「${user.email}」已登入，但尚未取得系統使用權限。請由老闆或經理在帳號與案件權限頁面建立邀請。`, "warning", true);
      return;
    }
    currentAccess.user = user;
    currentAccess.profile = profile;
    showApplication(user, profile);
    updateAccessNavigation();
    publishAccessState();
    bindOwnProfile(user);
    await loadCurrentCasePermissions();
    if (isManagerProfile(profile)) startManagerListeners();
  } catch (error) {
    console.error(error);
    if (firestoreUnavailable(error)) {
      showGate("Firestore 尚未建立或尚未套用安全規則。完成資料庫設定後，請重新整理頁面。", "warning", true);
      return;
    }
    showGate("無法確認帳號權限，請稍後重試或請管理者檢查 Firestore 設定。", "error", true);
  }
});

// 資料同步模組會匯入這三個實體；前端 Firebase 設定並不等於資料存取權限，
// 實際存取仍受 firestore.rules 驗證。
export { app, auth, db };
