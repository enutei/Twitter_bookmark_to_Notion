// === 定数 ===
const TWEET_ARTICLE_SELECTOR = 'article[role="article"]';
const PROCESSED_ATTR = "data-notion-bookmark-injected";

// === ポップアップ管理 ===
let activePopup = null;

// === MutationObserver でツイートの動的読み込みを検知 ===
let debounceTimer = null;

function initObserver() {
  const observer = new MutationObserver(() => {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      processNewTweets();
    }, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  processNewTweets();
}

function processNewTweets() {
  const articles = document.querySelectorAll(
    `${TWEET_ARTICLE_SELECTOR}:not([${PROCESSED_ATTR}])`
  );
  articles.forEach((article) => {
    article.setAttribute(PROCESSED_ATTR, "true");
    injectBookmarkButton(article);
  });
}

// === ツイートURLの取得 ===
function getTweetUrl(article) {
  // タイムスタンプリンクからツイートURLを取得（最も信頼性が高い）
  const timeEl = article.querySelector('a[href*="/status/"] time');
  if (timeEl) {
    const anchor = timeEl.closest("a");
    if (anchor) return anchor.href;
  }
  // フォールバック: /status/ パターンに一致するリンクを探す
  const statusLink = article.querySelector('a[href*="/status/"]');
  return statusLink ? statusLink.href : null;
}

// === ブックマークボタンの注入 ===
function injectBookmarkButton(article) {
  // アクションバー（いいね、RT等のボタン群）を取得
  const actionBar = article.querySelector('[role="group"]:last-of-type');
  if (!actionBar) return;

  const tweetUrl = getTweetUrl(article);
  if (!tweetUrl) return;

  const container = document.createElement("div");
  container.className = "notion-bm-btn-container";

  const button = document.createElement("button");
  button.className = "notion-bm-btn";
  button.title = "Notionに保存";
  button.setAttribute("aria-label", "Notionに保存");
  button.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" class="notion-bm-icon">
      <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z"
            fill="none" stroke="currentColor" stroke-width="1.8"/>
      <line x1="9" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1.5"/>
      <line x1="12" y1="5" x2="12" y2="11" stroke="currentColor" stroke-width="1.5"/>
    </svg>
  `;

  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openFolderPopup(button, tweetUrl);
  });

  container.appendChild(button);
  actionBar.appendChild(container);
}

// === フォルダ選択ポップアップ ===
async function openFolderPopup(anchorButton, tweetUrl) {
  closePopup();

  const popup = document.createElement("div");
  popup.className = "notion-bm-popup";
  popup.innerHTML = `
    <div class="notion-bm-popup-header">Notionに保存</div>
    <div class="notion-bm-popup-loading">フォルダを読み込み中...</div>
    <div class="notion-bm-popup-list" style="display:none;"></div>
    <div class="notion-bm-popup-new" style="display:none;">
      <input type="text" placeholder="新しいフォルダ名..."
             class="notion-bm-popup-input" />
      <button class="notion-bm-popup-create-btn">作成</button>
    </div>
    <div class="notion-bm-popup-error" style="display:none;"></div>
  `;

  // Twitterテーマを検出してポップアップに適用
  applyThemeToPopup(popup);

  // ポップアップを配置
  positionPopup(popup, anchorButton);
  document.body.appendChild(popup);
  activePopup = popup;

  // ポップアップ外のクリックで閉じる
  setTimeout(() => {
    document.addEventListener("click", handleOutsideClick);
  }, 0);

  // フォルダ一覧を取得
  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: "GET_FOLDERS" });
  } catch (e) {
    response = { success: false, error: e.message };
  }

  const loadingEl = popup.querySelector(".notion-bm-popup-loading");
  const listEl = popup.querySelector(".notion-bm-popup-list");
  const newEl = popup.querySelector(".notion-bm-popup-new");
  const errorEl = popup.querySelector(".notion-bm-popup-error");

  if (!response.success) {
    loadingEl.style.display = "none";
    errorEl.style.display = "block";
    errorEl.textContent = response.error;

    // 設定未構成の場合、設定ページへのリンクを表示
    if (
      response.error &&
      response.error.includes("設定")
    ) {
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = "設定ページを開く";
      link.className = "notion-bm-popup-settings-link";
      link.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
        closePopup();
      });
      errorEl.appendChild(document.createElement("br"));
      errorEl.appendChild(link);
    }
    return;
  }

  loadingEl.style.display = "none";
  listEl.style.display = "block";
  newEl.style.display = "flex";

  // フォルダリストの描画
  const folders = response.data;
  folders.forEach((folder) => {
    const item = document.createElement("div");
    item.className = "notion-bm-popup-item";
    item.textContent = folder.name;
    item.addEventListener("click", () =>
      saveToFolder(folder.id, tweetUrl, item, anchorButton)
    );
    listEl.appendChild(item);
  });

  if (folders.length === 0) {
    const empty = document.createElement("div");
    empty.className = "notion-bm-popup-empty";
    empty.textContent = "フォルダがありません。下から作成してください。";
    listEl.appendChild(empty);
  }

  // 新規フォルダ作成
  const inputEl = popup.querySelector(".notion-bm-popup-input");
  const createBtn = popup.querySelector(".notion-bm-popup-create-btn");

  createBtn.addEventListener("click", async () => {
    const name = inputEl.value.trim();
    if (!name) return;

    createBtn.disabled = true;
    createBtn.textContent = "作成中...";

    try {
      const createResponse = await chrome.runtime.sendMessage({
        type: "CREATE_FOLDER",
        name,
      });

      if (createResponse.success) {
        await saveToFolder(
          createResponse.data.id,
          tweetUrl,
          null,
          anchorButton
        );
      } else {
        errorEl.style.display = "block";
        errorEl.textContent = createResponse.error;
        createBtn.disabled = false;
        createBtn.textContent = "作成";
      }
    } catch (e) {
      errorEl.style.display = "block";
      errorEl.textContent = e.message;
      createBtn.disabled = false;
      createBtn.textContent = "作成";
    }
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") createBtn.click();
  });

  // 入力フィールドにフォーカス
  inputEl.focus();
}

// === ブックマーク保存 ===
async function saveToFolder(folderId, tweetUrl, itemEl, anchorButton) {
  if (itemEl) {
    itemEl.textContent += " ...";
    itemEl.style.pointerEvents = "none";
    itemEl.style.opacity = "0.6";
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SAVE_BOOKMARK",
      folderId,
      tweetUrl,
    });

    if (response.success) {
      // ボタンの色を変更して保存済みを示す
      if (anchorButton) {
        anchorButton.classList.add("notion-bm-btn-saved");
      }
      showToast("Notionに保存しました!");
      closePopup();
    } else {
      if (itemEl) {
        itemEl.textContent = itemEl.textContent.replace(" ...", "");
        itemEl.style.pointerEvents = "";
        itemEl.style.opacity = "";
      }
      showToast("保存に失敗しました: " + response.error, true);
    }
  } catch (e) {
    if (itemEl) {
      itemEl.textContent = itemEl.textContent.replace(" ...", "");
      itemEl.style.pointerEvents = "";
      itemEl.style.opacity = "";
    }
    showToast("保存に失敗しました: " + e.message, true);
  }
}

// === トースト通知 ===
function showToast(message, isError = false) {
  // 既存のトーストを削除
  const existing = document.querySelector(".notion-bm-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "notion-bm-toast" + (isError ? " notion-bm-toast-error" : "");
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// === ポップアップの配置 ===
function positionPopup(popup, anchor) {
  const rect = anchor.getBoundingClientRect();
  popup.style.position = "fixed";
  popup.style.left = `${rect.left}px`;
  popup.style.bottom = `${window.innerHeight - rect.top + 8}px`;

  requestAnimationFrame(() => {
    const popupRect = popup.getBoundingClientRect();
    // 右端がはみ出す場合
    if (popupRect.right > window.innerWidth - 12) {
      popup.style.left = `${window.innerWidth - popupRect.width - 12}px`;
    }
    // 左端がはみ出す場合
    if (popupRect.left < 12) {
      popup.style.left = "12px";
    }
    // 上にスペースがない場合はボタンの下に表示
    if (popupRect.top < 0) {
      popup.style.bottom = "auto";
      popup.style.top = `${rect.bottom + 8}px`;
    }
  });
}

// === ポップアップを閉じる ===
function closePopup() {
  if (activePopup) {
    activePopup.remove();
    activePopup = null;
  }
  document.removeEventListener("click", handleOutsideClick);
}

function handleOutsideClick(e) {
  if (activePopup && !activePopup.contains(e.target)) {
    closePopup();
  }
}

// === Twitterテーマの検出と適用 ===
function detectTwitterTheme() {
  const bgColor = getComputedStyle(document.body).backgroundColor;
  // "rgb(0, 0, 0)" = ダーク, "rgb(21, 32, 43)" = ディム
  if (bgColor === "rgb(0, 0, 0)" || bgColor === "rgb(21, 32, 43)") {
    return "dark";
  }
  return "light";
}

function applyThemeToPopup(popup) {
  if (detectTwitterTheme() === "dark") {
    popup.style.setProperty("--notion-bm-bg", "#16181c");
    popup.style.setProperty("--notion-bm-text", "#e7e9ea");
    popup.style.setProperty("--notion-bm-border", "#2f3336");
    popup.style.setProperty("--notion-bm-hover", "#1d1f23");
    popup.style.setProperty("--notion-bm-input-bg", "#202327");
  }
}

// === 初期化 ===
(function init() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initObserver);
  } else {
    initObserver();
  }
})();
