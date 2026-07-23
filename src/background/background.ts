import type { GameSession, SessionDevEvent } from '../shared/types';

const STORAGE_KEY = 'doglight_state';

interface ExtensionStateRecord {
  sessions?: Array<Record<string, unknown>>;
  currentSessionTabId?: number;
  currentSession?: GameSession;
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

  // Added gracePeriodMs (defaults to 200ms) to allow content.ts to finish first
  function finalizeOrphanedSession(tabId: number, reason: string, gracePeriodMs = 200) {
    setTimeout(() => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        const state = (result[STORAGE_KEY] ?? {}) as ExtensionStateRecord;

        // CHECK GUARD: Only execute if currentSession STILL exists and belongs to THIS tab
        if (
          state.currentSessionTabId === tabId &&
          state.currentSession &&
          state.currentSession.status === 'active'
        ) {
          console.warn(`[Background] Rescuing session for Tab ${tabId}. Reason: ${reason}`);
          chrome.tabs.sendMessage(tabId, { type: 'BACKGROUND_STOP_ACTIVATED' });

          const sessionToSave = state.currentSession;
          sessionToSave.endedAt = Date.now();
          sessionToSave.status = 'ended';

          sessionToSave.metadata = {
            ...(sessionToSave.metadata ?? {}),
            devEvents: [
              ...(sessionToSave.metadata?.devEvents ?? []),
              {
                timestamp: Date.now(),
                type: 'disconnect',
                detectedBy: 'background',
                details: `Session finalized due to ${reason}.`,
              },
            ],
          };

          const nextSessions = [...(state.sessions ?? []), sessionToSave];

          // Clear active markers and save finalized list
          chrome.storage.local.set({
            [STORAGE_KEY]: {
              ...state,
              sessions: nextSessions,
              currentSessionTabId: undefined,
              currentSession: undefined,
            },
          });
        } else {
          console.log(`[Background] Fallback skipped for Tab ${tabId}. Session already finalized gracefully by content script.`);
        }
      });
    }, gracePeriodMs);
  }

  // 1. Catch Tab Closures (150ms delay)
  chrome.tabs.onRemoved.addListener((tabId) => {
    finalizeOrphanedSession(tabId, 'tab_closed', 500);
  });

  // 2. Catch Tab Reloads and Navigations (200ms delay)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
      finalizeOrphanedSession(tabId, 'tab_reloaded_or_navigated', 500);
    }
  });

  // Listen for tab ID requests and manual emergency stops
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type === 'SET_TAB_ID') {
      const tabId = sender.tab?.id;

      chrome.storage.local.get([STORAGE_KEY], (result) => {
        const state = (result[STORAGE_KEY] ?? {}) as ExtensionStateRecord;
        if (tabId && state.currentSessionTabId !== tabId) {
          console.warn(`[Background] Tab ID mismatch. Updating currentSessionTabId to ${tabId}`);
          chrome.storage.local.set({
            [STORAGE_KEY]: {
              ...state,
              currentSessionTabId: tabId,
            },
          });
        }
      });
      return true;
    } else if (message?.type === 'EMERGENCY_STOP_SESSION') {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        const state = (result[STORAGE_KEY] ?? {}) as ExtensionStateRecord;
        if (state.currentSessionTabId) {
          console.warn(`[Background] EMERGENCY_STOP_SESSION received from Tab ${state.currentSessionTabId}. Finalizing session.`);
          finalizeOrphanedSession(state.currentSessionTabId, 'emergency stop', 1000);
        }
      });
      return true;
    }
    return false;
  });
}

initialize();