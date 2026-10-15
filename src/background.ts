import { isWebUrl, matchTabs, type PinRecord } from './match.ts';

interface State {
  /** Pinned tab records, kept in storage.local */
  pins: PinRecord[];
  /** Tab id to record id, kept in storage.session because tab ids change after a restart */
  bindings: Record<string, string>;
}

let queue: Promise<unknown> = Promise.resolve();

/** Applies a change to the stored state, one change at a time */
function mutate<T>(change: (state: State) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const { pins = [] } = (await chrome.storage.local.get('pins')) as Partial<State>;
    const { bindings = {} } = (await chrome.storage.session.get('bindings')) as Partial<State>;
    const state: State = { pins, bindings };
    const result = await change(state);
    await chrome.storage.local.set({ pins: state.pins });
    await chrome.storage.session.set({ bindings: state.bindings });
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

function recordOf(state: State, tabId: number): PinRecord | undefined {
  return state.pins.find((pin) => pin.id === state.bindings[tabId]);
}

/** Binds unbound pinned tabs to free records and paints them, safe to call repeatedly */
async function reconcile(state: State): Promise<void> {
  const recordIds = new Set(state.pins.map((pin) => pin.id));
  const boundIds = new Set(Object.values(state.bindings));
  const tabs = (await chrome.tabs.query({ pinned: true })).flatMap((tab) =>
    tab.id !== undefined && isWebUrl(tab.url) && !recordIds.has(state.bindings[tab.id])
      ? [{ id: tab.id, url: tab.url, index: tab.index }]
      : [],
  );
  const free = state.pins.filter((pin) => !boundIds.has(pin.id));
  for (const [tabId, recordId] of matchTabs(tabs, free)) {
    state.bindings[tabId] = recordId;
    await paint(tabId, tabs.find((tab) => tab.id === tabId)?.url, recordOf(state, tabId));
  }
}

/** Sets the toolbar icon and tooltip of a tab depending on whether it is away from its home URL */
async function paint(tabId: number, url: string | undefined, record: PinRecord | undefined): Promise<void> {
  const away = record !== undefined && url !== record.homeUrl;
  const icon = away ? 'pin-away' : 'pin-home';
  const title = !record ? 'pinned-home' : away ? 'pinned-home: away from home, click to return' : 'pinned-home: at home';
  // The tab may already be closed, and an API error must not abort the queued state write
  await Promise.all([
    chrome.action.setIcon({ tabId, path: { 16: `${icon}-16.png`, 24: `${icon}-24.png`, 32: `${icon}-32.png` } }),
    chrome.action.setTitle({ tabId, title }),
  ]).catch(() => undefined);
}

/** Returns a pinned tab to its home URL, with detach first reopening the current page in a new tab */
async function resetTab(passedTab: chrome.tabs.Tab | undefined, detach: boolean): Promise<void> {
  // Commands with global scope do not pass the tab
  const tab = passedTab ?? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (tab?.id === undefined) return;
  const tabId = tab.id;
  const record = await mutate(async (state) => {
    if (!recordOf(state, tabId)) await reconcile(state);
    return recordOf(state, tabId);
  });
  if (!record) {
    await chrome.action.setBadgeText({ tabId, text: '?' });
    setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }).catch(console.error), 2000);
    return;
  }
  if (detach && tab.url !== record.homeUrl) {
    await chrome.tabs.create({ url: tab.url, index: tab.index + 1, openerTabId: tabId });
  }
  await chrome.tabs.update(tabId, { url: record.homeUrl });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.pinned === true && isWebUrl(tab.url)) {
    const url = tab.url;
    mutate(async (state) => {
      // A bound tab still on its lastUrl is treated as moved between windows, any other binding as reconcile taking a new pin for a restored tab
      let record = recordOf(state, tabId);
      if (record?.lastUrl !== url) {
        record = { id: crypto.randomUUID(), homeUrl: url, lastUrl: url, index: tab.index };
        state.pins.push(record);
        state.bindings[tabId] = record.id;
      }
      await paint(tabId, url, record);
    }).catch(console.error);
  } else if (changeInfo.pinned === false) {
    mutate(async (state) => {
      // Chromium may report pinned: false for a tab that is closing or moving to another window
      if ((await chrome.tabs.get(tabId).catch(() => undefined))?.pinned !== false) return;
      const record = recordOf(state, tabId);
      state.pins = state.pins.filter((pin) => pin !== record);
      delete state.bindings[tabId];
      await paint(tabId, tab.url, undefined);
    }).catch(console.error);
  } else if (tab.pinned && (changeInfo.url || changeInfo.status)) {
    // Chromium clears per-tab action values on every cross-document navigation, so the icon is repainted on each event
    mutate(async (state) => {
      if (!recordOf(state, tabId)) await reconcile(state);
      const record = recordOf(state, tabId);
      if (record && changeInfo.url) {
        record.lastUrl = changeInfo.url;
        record.index = tab.index;
      }
      await paint(tabId, tab.url, record);
    }).catch(console.error);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.pinned) mutate(reconcile).catch(console.error);
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  mutate(async (state) => {
    const recordId = state.bindings[removedTabId];
    if (!recordId) return;
    state.bindings[addedTabId] = recordId;
    delete state.bindings[removedTabId];
    const record = recordOf(state, addedTabId);
    await paint(addedTabId, record?.lastUrl, record);
  }).catch(console.error);
});

// Records outlive their tabs so that restored tabs (browser restart, reopened window, Ctrl+Shift+T) are matched to them again
chrome.tabs.onRemoved.addListener((tabId) => {
  mutate((state) => {
    delete state.bindings[tabId];
  }).catch(console.error);
});

chrome.commands.onCommand.addListener((command, tab) => {
  resetTab(tab, command === 'detach').catch(console.error);
});

chrome.action.onClicked.addListener((tab) => {
  resetTab(tab, false).catch(console.error);
});

// Runs on every service worker start, including wake-up after idle
mutate(reconcile).catch(console.error);
