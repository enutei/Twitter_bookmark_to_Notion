const notionTokenInput = document.getElementById("notionToken");
const notionDatabaseIdInput = document.getElementById("notionDatabaseId");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");

// 保存済み設定を読み込む
chrome.storage.sync.get(["notionToken", "notionDatabaseId"], (result) => {
  if (result.notionToken) notionTokenInput.value = result.notionToken;
  if (result.notionDatabaseId) notionDatabaseIdInput.value = result.notionDatabaseId;
});

saveBtn.addEventListener("click", () => {
  const token = notionTokenInput.value.trim();
  const databaseId = notionDatabaseIdInput.value.trim();

  if (!token || !databaseId) {
    showStatus("両方のフィールドを入力してください。", "error");
    return;
  }

  if (!token.startsWith("ntn_") && !token.startsWith("secret_")) {
    showStatus(
      "トークンの形式が正しくないようです。「ntn_」または「secret_」で始まる必要があります。",
      "error"
    );
    return;
  }

  // Database IDのバリデーション（ハイフン除去して32文字の16進数か確認）
  const cleanId = databaseId.replace(/-/g, "");
  if (cleanId.length !== 32 || !/^[a-f0-9]+$/i.test(cleanId)) {
    showStatus(
      "Database IDは32文字の16進数文字列である必要があります。",
      "error"
    );
    return;
  }

  // Database IDをハイフン付きフォーマットに変換
  const formattedId = [
    cleanId.slice(0, 8),
    cleanId.slice(8, 12),
    cleanId.slice(12, 16),
    cleanId.slice(16, 20),
    cleanId.slice(20),
  ].join("-");

  chrome.storage.sync.set(
    { notionToken: token, notionDatabaseId: formattedId },
    () => {
      showStatus("設定を保存しました。接続テスト中...", "success");
      testConnection();
    }
  );
});

async function testConnection() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_FOLDERS" });
    if (response.success) {
      showStatus(
        `接続成功! データベースに ${response.data.length} 件のフォルダが見つかりました。`,
        "success"
      );
    } else {
      showStatus(`保存済みですが接続テストに失敗しました: ${response.error}`, "error");
    }
  } catch (e) {
    showStatus(`保存済みですが接続テストに失敗しました: ${e.message}`, "error");
  }
}

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = "block";
}
