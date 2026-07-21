const STORAGE_EVENT_NAME = 'DOGFLIGHT_STORAGE_MUTATED';
const TARGET_KEYS = ['dogflightName', 'stats', 'recentStats', 'dogflightUID'];

// Internal cache to track state changes in memory
const stateCache: Record<string, string> = {};

function checkKeyMutation(key: string) {
  const currentValue = localStorage.getItem(key);
  if (currentValue === null) {
    if (key in stateCache) {
      delete stateCache[key];
      window.dispatchEvent(
        new CustomEvent(STORAGE_EVENT_NAME, { detail: { key, newValue: null } })
      );
    }
    return;
  }

  let relevantState: unknown = currentValue;

  try {
    const parsed = JSON.parse(currentValue);
    if (typeof parsed === 'object' && parsed !== null) {
      if (key === 'stats') {
        relevantState = parsed.games ?? parsed;
      } else if (key === 'recentStats') {
        const clone = { ...parsed };
        delete clone.time;
        relevantState = clone;
      } else {
        relevantState = parsed;
      }
    }
  } catch {
    relevantState = currentValue;
  }

  const relevantString = JSON.stringify(relevantState) ?? '';

  // Only dispatch if the extracted relevant state ACTUALLY changed
  if (stateCache[key] !== relevantString) {
    stateCache[key] = relevantString;
    
    // Console log for debugging: open the page console to verify detection
    // console.log(`[Dogflight Injected] Storage mutation detected for "${key}":`, relevantState);

    window.dispatchEvent(
      new CustomEvent(STORAGE_EVENT_NAME, {
        detail: { key, newValue: currentValue }
      })
    );
  }
}

// 1. Still intercept standard setItem / removeItem calls for immediate dispatch
const originalSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function (key: string, value: string) {
  originalSetItem.apply(this, [key, value]);
  if (this === window.localStorage && TARGET_KEYS.includes(key)) {
    checkKeyMutation(key);
  }
};

const originalRemoveItem = Storage.prototype.removeItem;
Storage.prototype.removeItem = function (key: string) {
  originalRemoveItem.apply(this, [key]);
  if (this === window.localStorage && TARGET_KEYS.includes(key)) {
    checkKeyMutation(key);
  }
};

// 2. Watcher Loop: Traps direct property assignments (localStorage.stats = ...) 
// Running this inside MAIN world memory costs near 0 CPU and avoids cross-context event spam.
setInterval(() => {
  for (const key of TARGET_KEYS) {
    checkKeyMutation(key);
  }
}, 1000);

// Initial baseline check on script load
for (const key of TARGET_KEYS) {
  checkKeyMutation(key);
}