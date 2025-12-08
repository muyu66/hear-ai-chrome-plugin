const BACKEND_URL = "http://192.168.3.14:3000";

let deviceSessionId = null;
let pollTimer = null;
// 轮询间隔
const POLL_INTERVAL_MS = 3000;
// 轮询最大超时时间
const MAX_POLL_MS = 5 * 60 * 1000;
let pollStartedAt = null;

// ------------------------
// DOM
// ------------------------
const loginView = document.getElementById("login-view");
const mainView = document.getElementById("main-view");

const avatarEl = document.getElementById("avatar");
const nicknameEl = document.getElementById("nickname");
const logoutBtn = document.getElementById("logout-btn");

// ------------------------
// 工具函数
// ------------------------
function showLoginView() {
    mainView.classList.add("hidden");
    loginView.classList.remove("hidden");
}

function showMainView() {
    loginView.classList.add("hidden");
    mainView.classList.remove("hidden");
}

// ------------------------
// 获取用户信息（后端接口）
// ------------------------
async function fetchUserInfo(accessToken) {
    try {
        const url = `${BACKEND_URL}/auth/profile`;

        const res = await fetch(url, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });

        // token 失效逻辑
        if (res.status === 401 || res.status === 403) {
            console.warn("AccessToken 已失效，准备退出登录");
            return { error: "invalid_token" };
        }

        if (!res.ok) {
            console.warn("获取用户信息失败，状态码:", res.status);
            return { error: "request_failed", status: res.status };
        }

        const data = await res.json();
        return {
            avatar: data.avatar,
            nickname: data.nickname
        };

    } catch (e) {
        console.warn("获取用户信息网络错误：", e);
        return { error: "network_error", detail: e };
    }
}

function generateAvatar(name, size = 80) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // 随机但稳定的背景色
    const hash = Array.from(name)
        .reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const hue = hash % 360;

    ctx.fillStyle = `hsl(${hue}, 70%, 60%)`;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    // 字（取第一个字符）
    const text = name[0]?.toUpperCase() || '?';
    ctx.fillStyle = '#fff';
    ctx.font = `${size * 0.5}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2);

    return canvas.toDataURL(); // base64 图片
}

// ------------------------
// 退出
// ------------------------
function logout() {
    chrome.storage.local.remove(["accessToken"], () => {
        console.log("token 已清理");
        showLoginView();
        initLoginFlow();
    });
}

// 绑定退出按钮
logoutBtn.onclick = logout;

// 生成 sessionId
function generateDeviceSessionId() {
    const arr = crypto.getRandomValues(new Uint8Array(32));
    let id = "";
    for (let i = 0; i < arr.length; i++) {
        id += (arr[i] % 36).toString(36);
    }
    return id;
}

// 渲染二维码
function renderQRCode(id) {
    const qrBox = document.getElementById("qrcode");
    qrBox.innerHTML = "";
    new QRCode(qrBox, {
        text: `hearai-device-session://${id}`,
        width: 128,
        height: 128,
        colorDark: "#000",
        colorLight: "#fff"
    });
}

function markQRCodeExpired() {
    const overlay = document.getElementById("qr-expired-overlay");
    overlay.style.display = "flex";
}

async function checkLoginOnce() {
    if (!deviceSessionId) return null;

    try {
        const url = `${BACKEND_URL}/auth/device-session?deviceSessionId=${deviceSessionId}`;
        const res = await fetch(url);

        if (!res.ok) return null;
        const data = await res.json();
        return data.accessToken || null;
    } catch (e) {
        console.warn(e);
        return null;
    }
}

function saveAccessToken(token) {
    if (!token) return;

    chrome.storage.local.set({ accessToken: token }, () => {
        console.log("accessToken 已保存");
    });
}

async function startPolling() {
    pollStartedAt = Date.now();

    async function poll() {
        const token = await checkLoginOnce();
        if (token) {
            saveAccessToken(token);
            stopPolling();
            onLoggedIn(token);
            return;
        }

        if (Date.now() - pollStartedAt > MAX_POLL_MS) {
            markQRCodeExpired();
            stopPolling();
        }
    }

    // 立即执行一次
    await poll();

    pollTimer = setInterval(poll, POLL_INTERVAL_MS);
}

function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

function initLoginFlow() {
    deviceSessionId = generateDeviceSessionId();
    renderQRCode(deviceSessionId);
    startPolling();
}

// ------------------------
// 登录成功后的处理
// ------------------------
async function onLoggedIn(token) {
    const info = await fetchUserInfo(token);

    if (info.error === "invalid_token") {
        // token 失效，自动退出
        chrome.storage.local.remove(["accessToken"], () => {
            showLoginView();
            initLoginFlow();
        });
        return;
    }

    if (info.error === "network_error") {
        // 网络错误 → 提示用户稍后再试
        showLoginView();
        return;
    }

    if (info.error === "request_failed") {
        // 服务器返回 5xx 或其它错误
        showLoginView();
        return;
    }

    // 成功渲染
    if (info.avatar) {
        avatarEl.src = info.avatar;
    } else {
        const avatar = generateAvatar(info.nickname);
        avatarEl.src = avatar;
    }
    nicknameEl.textContent = info.nickname;
    showMainView();
}

// ------------------------
// 初始化入口
// ------------------------
document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.local.get(["accessToken"], async storage => {
        const token = storage.accessToken;

        if (!token) {
            showLoginView();
            initLoginFlow();
            return;
        }

        const info = await fetchUserInfo(token);

        if (info.error) {
            // 出错时处理
            if (info.error === "invalid_token") {
                logout();
            } else {
                logout();
            }
            return;
        }

        if (info.avatar) {
            avatarEl.src = info.avatar;
        } else {
            const avatar = generateAvatar(info.nickname);
            avatarEl.src = avatar;
        }
        nicknameEl.textContent = info.nickname;
        showMainView();
    });
});

// 清理计时器
window.addEventListener("unload", () => stopPolling());
