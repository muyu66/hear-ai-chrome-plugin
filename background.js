const BACKEND_URL = "http://192.168.3.14:3000";

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "hearai_add_to_wordbook",
        title: "添加到单词本",
        contexts: ["selection"],
    });
});

// 获取本地 token
async function getAccessToken() {
    const { accessToken } = await chrome.storage.local.get("accessToken");
    return accessToken;
}

// 上传单词
async function uploadWord(word, token) {
    const res = await fetch(`${BACKEND_URL}/my/words`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ word })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
    }

    return res.json();
}

/**
 * 获取当前选中的第一个单词，清理标点和多余空格
 * @returns {string|null} 返回单词，如果不是有效单词返回 null
 */
function getSelectedWord(text) {
    // 获取选中的文本
    if (!text) return null;

    // 去掉开头和结尾的标点符号
    text = text.replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "");

    // 只取第一个空格分隔的部分
    const firstWord = text.split(/\s+/)[0];

    // 判断是否只包含字母、连字符或撇号
    if (/^[A-Za-z-']+$/.test(firstWord)) {
        return firstWord.toLowerCase();
    } else {
        return null;
    }
}

// 右键菜单事件
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== "hearai_add_to_wordbook") return;

    const word = info.selectionText?.trim();
    const safeWord = getSelectedWord(word);
    if (!safeWord) return;

    try {
        const token = await getAccessToken();
        if (!token) {
            chrome.notifications.create({
                type: "basic",
                iconUrl: "logo_128.png",
                title: "请先在插件中登录",
                isClickable: false,
                message: ""
            });
            return;
        }

        const { result } = await uploadWord(safeWord, token);

        chrome.notifications.create({
            type: "basic",
            silent: true,
            iconUrl: "logo_128.png",
            title: result ? `已添加：${safeWord}` : `已存在：${safeWord}`,
            isClickable: false,
            message: ""
        });

    } catch (err) {
        console.error("添加失败", err);

        chrome.notifications.create({
            type: "basic",
            silent: true,
            iconUrl: "logo_128.png",
            title: "添加失败",
            isClickable: false,
            message: ""
        });
    }
});
