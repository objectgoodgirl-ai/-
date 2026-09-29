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

// Firebase 的網頁設定可安全放在前端；真正的資料權限須由 Firestore Security Rules 控管。
const firebaseConfig = {
  apiKey: "AIzaSyAGStTrZnrh8VVPzsyTw0EkV5ZAw76Fh80",
  authDomain: "hongyuan-funeral-ops-tw.firebaseapp.com",
  projectId: "hongyuan-funeral-ops-tw",
  storageBucket: "hongyuan-funeral-ops-tw.firebasestorage.app",
  messagingSenderId: "476812183361",
  appId: "1:476812183361:web:c07ce68401cd3e763103c0",
};

const INITIAL_OWNER_EMAIL = "objectgoodgirl@gmail.com";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
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

function setAuthMessage(message, type = "info") {
  authMessage.textContent = message;
  authMessage.dataset.type = type;
}

function userName(user) {
  return user.displayName || user.email?.split("@")[0] || "使用者";
}

function updateProfile(user) {
  const name = userName(user);
  profileAvatar.textContent = name.slice(0, 1);
  profileName.textContent = name;
  profileRole.textContent = "系統管理員";
  topUserName.textContent = `${name}　⌄`;
  dashboardGreeting.textContent = `早安，${name}`;
}

function isInitialOwner(user) {
  return user.email?.toLowerCase() === INITIAL_OWNER_EMAIL;
}

function showGate(message, type = "info", canSignOut = false) {
  appShell.hidden = true;
  gate.hidden = false;
  gateSignOutButton.hidden = !canSignOut;
  setAuthMessage(message, type);
}

function showApplication(user) {
  updateProfile(user);
  gate.hidden = true;
  appShell.hidden = false;
  signOutButton.hidden = false;
}

function friendlyError(error) {
  const messages = {
    "auth/popup-closed-by-user": "登入視窗已關閉，尚未完成登入。",
    "auth/popup-blocked": "瀏覽器封鎖了登入視窗，請允許彈出式視窗後再試一次。",
    "auth/unauthorized-domain": "此網站網址尚未加入 Firebase 的授權網域。部署後請在 Authentication 設定中加入正式網域。",
    "auth/network-request-failed": "網路連線異常，請確認網路後重試。",
  };
  return messages[error.code] || "Google 登入暫時無法完成，請稍後再試。";
}

async function startGoogleSignIn() {
  if (window.location.protocol === "file:") {
    setAuthMessage("目前是以本機檔案開啟。請使用 localhost 或部署至 Firebase Hosting／Vercel 後再進行 Google 登入。", "warning");
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

signInButton.addEventListener("click", startGoogleSignIn);
signOutButton.addEventListener("click", logout);
gateSignOutButton.addEventListener("click", logout);

onAuthStateChanged(auth, (user) => {
  signOutButton.hidden = true;
  if (!user) {
    showGate("請使用公司核准的 Google 帳號登入。", "info");
    return;
  }

  if (!isInitialOwner(user)) {
    showGate(`「${user.email}」已登入，但尚未取得系統使用權限。請由老闆或經理在員工權限名冊完成核准。`, "warning", true);
    return;
  }

  showApplication(user);
});
