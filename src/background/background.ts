const STORAGE_KEY = 'doglight_state';

interface ExtensionStateRecord {
  sessions?: Array<Record<string, unknown>>;
}

function initialize() {
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    const state = (result[STORAGE_KEY] ?? {}) as ExtensionStateRecord;
    const nextState: ExtensionStateRecord = {
      ...state,
      sessions: state.sessions ?? [],
    };

    if (!state.sessions) {
      chrome.storage.local.set({ [STORAGE_KEY]: nextState });
    }
  });
}

initialize();
