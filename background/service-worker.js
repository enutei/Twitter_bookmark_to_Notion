const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// タイトルプロパティ名のキャッシュ
let cachedTitlePropName = null;
let cachedDatabaseId = null;

// === 設定の取得 ===
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["notionToken", "notionDatabaseId"], (result) => {
      resolve({
        token: result.notionToken || null,
        databaseId: result.notionDatabaseId || null,
      });
    });
  });
}

// === Notion API汎用ヘルパー ===
async function notionFetch(endpoint, method, body, token) {
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  let response;
  let retries = 0;
  const maxRetries = 3;

  while (retries <= maxRetries) {
    response = await fetch(`${NOTION_API_BASE}${endpoint}`, options);

    if (response.status === 429 && retries < maxRetries) {
      // レートリミット: 指数バックオフでリトライ
      const waitMs = Math.pow(2, retries) * 1000;
      await new Promise((r) => setTimeout(r, waitMs));
      retries++;
      continue;
    }
    break;
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const err = new Error(
      errorBody.message || `Notion API error: ${response.status}`
    );
    err.status = response.status;
    if (errorBody.code) err.code = errorBody.code;
    if (errorBody) err.details = errorBody;
    throw err;
  }
  return response.json();
}

// === タイトルプロパティ名を動的に取得 ===
async function getTitlePropertyName(token, databaseId) {
  if (cachedTitlePropName && cachedDatabaseId === databaseId) {
    return cachedTitlePropName;
  }
  const db = await notionFetch(`/databases/${databaseId}`, "GET", null, token);
  const titleProp = Object.entries(db.properties).find(
    ([, value]) => value.type === "title"
  );
  cachedTitlePropName = titleProp ? titleProp[0] : "Name";
  cachedDatabaseId = databaseId;
  return cachedTitlePropName;
}

// === フォルダ一覧取得 ===
async function getFolders(token, databaseId) {
  const titlePropName = await getTitlePropertyName(token, databaseId);

  const data = await notionFetch(
    `/databases/${databaseId}/query`,
    "POST",
    {
      sorts: [{ property: titlePropName, direction: "ascending" }],
    },
    token
  );

  return data.results.map((page) => {
    const titleProp = Object.values(page.properties).find(
      (prop) => prop.type === "title"
    );
    const name = titleProp?.title?.[0]?.plain_text || "Untitled";
    return { id: page.id, name };
  });
}

// === フォルダ作成 ===
async function createFolder(token, databaseId, folderName) {
  const titlePropName = await getTitlePropertyName(token, databaseId);

  const data = await notionFetch(
    "/pages",
    "POST",
    {
      parent: { database_id: databaseId },
      properties: {
        [titlePropName]: {
          title: [
            {
              type: "text",
              text: { content: folderName },
            },
          ],
        },
      },
    },
    token
  );

  return { id: data.id, name: folderName };
}

// === ブックマーク保存 ===
async function saveBookmark(token, folderId, tweetUrl) {
  // Prefer rich embed for tweets; fallback to bookmark if Notion rejects the embed.
  try {
    await notionFetch(
      `/blocks/${folderId}/children`,
      "PATCH",
      {
        children: [
          {
            object: "block",
            type: "embed",
            embed: {
              url: tweetUrl,
              caption: [],
            },
          },
        ],
      },
      token
    );
  } catch (e) {
    // Some workspaces/domains can't be embedded via API; bookmark is widely supported.
    if (e && e.status === 400) {
      await notionFetch(
        `/blocks/${folderId}/children`,
        "PATCH",
        {
          children: [
            {
              object: "block",
              type: "bookmark",
              bookmark: {
                url: tweetUrl,
                caption: [],
              },
            },
          ],
        },
        token
      );
      return;
    }
    throw e;
  }
}

// === メッセージディスパッチャー ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // オプションページを開くリクエスト
  if (message.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ success: true });
    return false;
  }

  handleMessage(message)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ success: false, error: error.message }));
  return true; // 非同期レスポンスのためチャネルを維持
});

async function handleMessage(message) {
  if (message.type === "GET_SETTINGS") {
    const settings = await getSettings();
    return { success: true, data: settings };
  }

  const settings = await getSettings();
  if (!settings.token || !settings.databaseId) {
    return {
      success: false,
      error: "Notion設定が未構成です。拡張機能のオプションページから設定してください。",
    };
  }

  switch (message.type) {
    case "GET_FOLDERS": {
      const folders = await getFolders(settings.token, settings.databaseId);
      return { success: true, data: folders };
    }
    case "CREATE_FOLDER": {
      const folder = await createFolder(
        settings.token,
        settings.databaseId,
        message.name
      );
      return { success: true, data: folder };
    }
    case "SAVE_BOOKMARK": {
      await saveBookmark(settings.token, message.folderId, message.tweetUrl);
      return { success: true, data: null };
    }
    default:
      return {
        success: false,
        error: `Unknown message type: ${message.type}`,
      };
  }
}
