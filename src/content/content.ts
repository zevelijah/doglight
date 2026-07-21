import type { ClickEvent, DogflightStats, ExtensionState, GameSession, GameBonusEntry, SessionDevEvent, ShotBurst, ShotBurstEvent } from '../shared/types';

const STORAGE_KEY = 'doglight_state';
const DOGFLIGHT_ORIGIN = 'https://dogflight.io';

interface RawStorageSnapshot {
  stats?: DogflightStats;
  recentStats?: DogflightStats;
  dogflightName?: string;
  dogflightUid?: string;
}

let activeSession: GameSession | null = null;
let lastKnownSnapshot: RawStorageSnapshot = {};
let lastKnownGameCount: number | null = null;
let currentShotBurst: ShotBurst | null = null;
let lastObservedBonusValue: number | undefined;
let lastKnownRightClick: ClickEvent | null = null;

type DetectionMethod = 'message' | 'listener' | 'game-count-change';

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSession(): GameSession {
  return {
    id: uid(),
    startedAt: Date.now(),
    status: 'active',
    clicks: [],
    metadata: {
      origin: window.location.origin,
      url: window.location.href,
      team: 'green',
      shotBursts: [],
      gameBonuses: [],
      leftClicks: [],
      devEvents: [],
    },
  };
}

function getMetadata(session: GameSession) {
  return (session.metadata ?? {}) as NonNullable<GameSession['metadata']>;
}

function setMetadata(session: GameSession, updates: Partial<NonNullable<GameSession['metadata']>>) {
  session.metadata = {
    ...(session.metadata ?? {}),
    ...updates,
  } as NonNullable<GameSession['metadata']>;
}

function appendDevEvent(session: GameSession | null, type: SessionDevEvent['type'], detectedBy: DetectionMethod, details?: string) {
  if (!session) return;
  const existingEvents = (getMetadata(session).devEvents as SessionDevEvent[] | undefined) ?? [];
  const nextEvents = [...existingEvents, {
    timestamp: Date.now(),
    type,
    detectedBy,
    details,
  }];
  setMetadata(session, { devEvents: nextEvents });
}

function appendGameBonusEntry(session: GameSession | null, message: string, source: GameBonusEntry['source'], amount?: number) {
  if (!session) return;
  const existing = (getMetadata(session).gameBonuses as GameBonusEntry[] | undefined) ?? [];
  const nextEntries = [...existing, {
    id: uid(),
    timestamp: Date.now(),
    message,
    source,
    amount,
  }];
  setMetadata(session, { gameBonuses: nextEntries });
}

function appendShotBurstEvent(session: GameSession | null, event: ShotBurstEvent) {
  if (!session || !currentShotBurst) return;
  currentShotBurst.events = [...currentShotBurst.events, event];
  const bursts = [...(getMetadata(session).shotBursts as ShotBurst[] | undefined) ?? []];
  const existingIndex = bursts.findIndex((burst) => burst.id === currentShotBurst?.id);
  if (existingIndex >= 0) {
    bursts[existingIndex] = currentShotBurst;
  } else {
    bursts.push(currentShotBurst);
  }
  setMetadata(session, { shotBursts: bursts });
}

function finalizeCurrentShotBurst(session: GameSession | null) {
  if (!session || !currentShotBurst) return;
  currentShotBurst.endedAt = Date.now();
  const bursts = [...(getMetadata(session).shotBursts as ShotBurst[] | undefined) ?? []];
  const existingIndex = bursts.findIndex((burst) => burst.id === currentShotBurst?.id);
  if (existingIndex >= 0) {
    bursts[existingIndex] = currentShotBurst;
  } else {
    bursts.push(currentShotBurst);
  }
  setMetadata(session, { shotBursts: bursts });
  currentShotBurst = null;
}

function beginNewShotBurst(session: GameSession | null, snapshot: RawStorageSnapshot) {
  if (!session) return;
  finalizeCurrentShotBurst(session);

  const scoreValue = typeof snapshot.stats?.score === 'number' ? snapshot.stats.score : 0;
  const recentRightClick = lastKnownRightClick;
  const details = recentRightClick && scoreValue > 80000
    ? `last right click at ${recentRightClick.x}, ${recentRightClick.y}`
    : undefined;
  const burst: ShotBurst = {
    id: uid(),
    startedAt: Date.now(),
    startedShots: snapshot.recentStats?.shots,
    startedHits: snapshot.recentStats?.hits,
    x: lastKnownRightClick?.x,
    y: lastKnownRightClick?.y,
    pageX: lastKnownRightClick?.pageX,
    pageY: lastKnownRightClick?.pageY,
    events: [],
  };
  currentShotBurst = burst;
  
  currentShotBurst.events.push({
    id: uid(),
    timestamp: Date.now(),
    type: 'shots-increase',
    message: `shots increased to ${snapshot.recentStats?.shots ?? 'n/a'}`,
  });
  if (details) {
    currentShotBurst.events[currentShotBurst.events.length - 1].message = `${currentShotBurst.events[currentShotBurst.events.length - 1].message} (${details})`;
  }
  const bursts = [...(getMetadata(session).shotBursts as ShotBurst[] | undefined) ?? []];
  bursts.push(currentShotBurst);
  setMetadata(session, { shotBursts: bursts });
}

function setSelfTabId(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'SET_TAB_ID' }, () => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve();
    });
  });
}

function startSession(snapshot: RawStorageSnapshot, detectedBy: DetectionMethod = 'message', details?: string) {
  activeSession = buildSession();

  setSelfTabId().catch((error) => {
    console.error('[Content] Failed to set self tab ID. The session will not close automatically:', error);
  });

  if (snapshot.stats) {
    activeSession.statsAtStart = snapshot.stats;
  }
  if (snapshot.recentStats) {
    activeSession.recentStatsAtStart = snapshot.recentStats;
  }
  setMetadata(activeSession, {
    dogflightName: snapshot.dogflightName,
    dogflightUid: snapshot.dogflightUid,
    origin: window.location.origin,
    url: window.location.href,
    team: 'green',
    shotBursts: [],
    gameBonuses: [],
    leftClicks: [],
    devEvents: [],
  });
  currentShotBurst = null;
  lastKnownRightClick = null;
  lastObservedBonusValue = snapshot.recentStats?.bonus;
  appendDevEvent(activeSession, 'connect', detectedBy, details);
  persistState({ currentSession: activeSession });
}

function applySnapshotToActiveSession(snapshot: RawStorageSnapshot) {
  if (!activeSession) return;
  if (!activeSession.statsAtStart && snapshot.stats) {
    activeSession.statsAtStart = snapshot.stats;
  }
  if (!activeSession.recentStatsAtStart && snapshot.recentStats) {
    activeSession.recentStatsAtStart = snapshot.recentStats;
  }
  persistState({ currentSession: activeSession });
}

function maybeAdvanceGameState(snapshot: RawStorageSnapshot) {
  const currentGames = snapshot.stats?.games;
  if (typeof currentGames !== 'number') {
    return;
  }

  if (lastKnownGameCount === null) {
    lastKnownGameCount = currentGames;
    return;
  }

  if (currentGames > lastKnownGameCount) {
    if (activeSession) {
      void finalizeActiveSession('game-count-change', 'game count increased');
    }
    startSession(snapshot, 'game-count-change', 'game count increased');
  }

  lastKnownGameCount = currentGames;
}

function handleShotBurstTracking(snapshot: RawStorageSnapshot, previousSnapshot: RawStorageSnapshot) {
  if (!activeSession) return;
  const previousRecent = previousSnapshot.recentStats;
  const currentRecent = snapshot.recentStats;
  if (!previousRecent || !currentRecent) return;

  if (typeof currentRecent.shots === 'number' && typeof previousRecent.shots === 'number' && currentRecent.shots > previousRecent.shots) {
    beginNewShotBurst(activeSession, snapshot);
  }

  if (!currentShotBurst) return;

  const hitsDelta = (currentRecent.hits ?? 0) - (previousRecent.hits ?? 0);
  for (let index = 0; index < hitsDelta; index += 1) {
    appendShotBurstEvent(activeSession, {
      id: uid(),
      timestamp: Date.now(),
      type: 'hits-increase',
      message: `hit ${index + 1}`,
    });
  }

  if ((currentRecent.bombers ?? 0) > (previousRecent.bombers ?? 0)) {
    appendShotBurstEvent(activeSession, {
      id: uid(),
      timestamp: Date.now(),
      type: 'bomber-kill',
      message: 'bomber killed',
    });
  }
  if ((currentRecent.scouts ?? 0) > (previousRecent.scouts ?? 0)) {
    appendShotBurstEvent(activeSession, {
      id: uid(),
      timestamp: Date.now(),
      type: 'scout-kill',
      message: 'scout killed',
    });
  }
  if ((currentRecent.kills ?? 0) > (previousRecent.kills ?? 0)) {
    appendShotBurstEvent(activeSession, {
      id: uid(),
      timestamp: Date.now(),
      type: 'player-kill',
      message: 'player kill',
    });
  }

  if (typeof currentShotBurst.startedHits === 'number' && typeof currentRecent.hits === 'number' && currentRecent.hits - currentShotBurst.startedHits >= 8) {
    finalizeCurrentShotBurst(activeSession);
  }
}

function handleBonusTracking(snapshot: RawStorageSnapshot, previousSnapshot: RawStorageSnapshot) {
  if (!activeSession) return;
  const previousRecent = previousSnapshot.recentStats;
  const currentRecent = snapshot.recentStats;
  if (!previousRecent || !currentRecent) return;

  const bonusDelta = (currentRecent.bonus ?? 0) - (previousRecent.bonus ?? 0);
  const bomberKilled = (typeof currentRecent.bombers === 'number' && typeof previousRecent.bombers === 'number' && currentRecent.bombers > previousRecent.bombers);
  const scoutKilled = (typeof currentRecent.scouts === 'number' && typeof previousRecent.scouts === 'number' && currentRecent.scouts > previousRecent.scouts);
  const squadKilled = (bonusDelta === 5000 && !bomberKilled && scoutKilled);
  
  if (typeof currentRecent.bonus === 'number') {
    if (bonusDelta === 0) {
      if (scoutKilled && !squadKilled) {
        appendGameBonusEntry(activeSession, 'scout killed', 'live');
      }
    } else {
      if (bonusDelta !== 5000 && bonusDelta % 2000 !== 0) {
        appendGameBonusEntry(activeSession, `performace bonus detected: ${bonusDelta}`, 'live', bonusDelta);
      } else if (bonusDelta === 5000 && !squadKilled && !bomberKilled) {
        appendGameBonusEntry(activeSession, 'performance bonus detected: 5000', 'live', bonusDelta);
      } else {
        if (bonusDelta === 5000) {
          if (bomberKilled) { // This is a dumb way to organize the code, it should go up.
            appendGameBonusEntry(activeSession, 'bomber killed', 'live', 5000);
          }
          if (scoutKilled) {
            if (squadKilled) {
              appendGameBonusEntry(activeSession, 'scout killed. Killed whole squadron by self!', 'live', 5000);
            }
          }
        } else if (bonusDelta !== 5000 && bonusDelta < 10000) {
          appendGameBonusEntry(activeSession, `${bonusDelta / 2000} scouts guided`, 'live', bonusDelta);
        } else if (bonusDelta === 10000) {
          appendGameBonusEntry(activeSession, 'One bomber (or 5 sct.) guided', 'live', bonusDelta);
        }
        if (typeof currentRecent.bonus === 'number') {
          lastObservedBonusValue = currentRecent.bonus; // Something that is clearly either anomolous or a performance bonus are not included in this variable
          setMetadata(activeSession, { lastTrackedBonus: currentRecent.bonus });
        }
      }
    }
  }
}

function loadState(callback: (state: ExtensionState) => void) {
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    const state = (result[STORAGE_KEY] ?? {}) as Partial<ExtensionState>;
    const normalized: ExtensionState = {
      sessions: state.sessions ?? [],
      currentSession: state.currentSession,
      currentSessionTabId: state.currentSessionTabId,
      latestStats: state.latestStats,
      latestRecentStats: state.latestRecentStats,
      latestName: state.latestName,
      latestUid: state.latestUid,
      lastUpdated: state.lastUpdated,
    };
    callback(normalized);
  });
}

function persistState(partial: Partial<ExtensionState>) {
  loadState((current) => {
    const nextState: ExtensionState = {
      ...current,
      ...partial,
      sessions: partial.sessions ?? current.sessions ?? [],
      lastUpdated: Date.now(),
    };
    chrome.storage.local.set({ [STORAGE_KEY]: nextState });
  });
}

function snapshotLocalStorage(): RawStorageSnapshot {
  const raw = window.localStorage;
  return {
    stats: safeParse(raw.getItem('stats')) as DogflightStats | undefined,
    recentStats: safeParse(raw.getItem('recentStats')) as DogflightStats | undefined,
    dogflightName: raw.getItem('dogflightName') ?? undefined,
    dogflightUid: raw.getItem('dogflightUID') ?? undefined,
  };
}

function safeParse(value: string | null) {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function captureSnapshot() {
  const snapshot = snapshotLocalStorage();
  const previousSnapshot = lastKnownSnapshot;
  const changed = JSON.stringify(snapshot) !== JSON.stringify(lastKnownSnapshot);

  if (changed) {
    lastKnownSnapshot = snapshot;
    persistState({
      latestStats: snapshot.stats,
      latestRecentStats: snapshot.recentStats,
      latestName: snapshot.dogflightName,
      latestUid: snapshot.dogflightUid,
    });
  }

  maybeAdvanceGameState(snapshot);
  applySnapshotToActiveSession(snapshot);
  if (activeSession) {
    handleShotBurstTracking(snapshot, previousSnapshot);
    handleBonusTracking(snapshot, previousSnapshot);
    persistState({ currentSession: activeSession });
  }
}

function recordClick(event: MouseEvent) {
  if (!activeSession) return;
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  const click: ClickEvent = {
    id: uid(),
    timestamp: Date.now(),
    button: event.button === 2 ? 'right' : 'left',
    x: Math.round(event.clientX - centerX),
    y: Math.round(event.clientY - centerY),
    pageX: event.pageX,
    pageY: event.pageY,
  };
  activeSession.clicks.push(click);
  if (click.button === 'right') {
    lastKnownRightClick = click;
  } else {
    const leftClicks = [...(getMetadata(activeSession).leftClicks as ClickEvent[] | undefined) ?? []];
    leftClicks.push(click);
    setMetadata(activeSession, { leftClicks });
  }
  persistState({ currentSession: activeSession });
}

function finalizeActiveSession(detectedBy: DetectionMethod = 'listener', details?: string): Promise<void> {
  return new Promise((resolve) => {
    if (!activeSession) {
      resolve();
      return;
    }

    // 1. SYNCHRONOUS LOCK: Detach activeSession immediately
    // This prevents re-entry or duplicate executions inside content.ts
    const sessionToSave = activeSession;
    activeSession = null;

    captureSnapshot();

    if (currentShotBurst) {
      finalizeCurrentShotBurst(sessionToSave);
      currentShotBurst = null;
    }
    appendDevEvent(sessionToSave, 'graceful', detectedBy, details);

    sessionToSave.endedAt = Date.now();
    sessionToSave.status = 'ended';
    sessionToSave.statsAtEnd = lastKnownSnapshot.stats;
    sessionToSave.recentStatsAtEnd = lastKnownSnapshot.recentStats;

    const bonusBefore = (getMetadata(sessionToSave).lastTrackedBonus as number | undefined) ?? lastObservedBonusValue;
    const bonusAfter = lastKnownSnapshot.recentStats?.bonus;
    const timeSaved = lastKnownSnapshot.recentStats?.timeSaved ?? 0;
    const points = Number(lastKnownSnapshot.recentStats?.points ?? 0);
    const pointsAgainst = Number(lastKnownSnapshot.recentStats?.pointsAgainst ?? 0);
    const kills = Number(lastKnownSnapshot.recentStats?.kills ?? 0);
    const deaths = Number(lastKnownSnapshot.recentStats?.deaths ?? 0);

    if (typeof bonusBefore === 'number' && typeof bonusAfter === 'number' && bonusAfter > bonusBefore) {
      appendGameBonusEntry(sessionToSave, 'total game bonuses', 'finalization', bonusBefore);
      const expectedPerformanceBonus = timeSaved * ((kills - deaths) + (points - pointsAgainst));
      if (expectedPerformanceBonus > 0) {
        appendGameBonusEntry(sessionToSave, 'performance bonus', 'finalization', expectedPerformanceBonus);
        const actualIncrease = bonusAfter - bonusBefore;
        if ((points > pointsAgainst && actualIncrease !== expectedPerformanceBonus) || (pointsAgainst > points && actualIncrease === expectedPerformanceBonus)) {
          setMetadata(sessionToSave, { team: 'red' });
        }
      }
    }

    // 2. ATOMIC WRITE: Clear currentSession and currentSessionTabId
    loadState((state) => {
      const nextSessions = [...(state.sessions ?? []), sessionToSave];
      chrome.storage.local.set({
        [STORAGE_KEY]: {
          ...state,
          currentSession: undefined,      // Marks session as finalized!
          currentSessionTabId: undefined, // Clears ownership!
          sessions: nextSessions,
          lastUpdated: Date.now(),
        },
      }, () => {
        resolve();
      });
    });
  });
}

const STORAGE_EVENT_NAME = 'DOGFLIGHT_STORAGE_MUTATED';

// Simple debounce helper to collapse rapid bursts into a single snapshot execution
function debounce(fn: Function, delayMs: number) {
  let timeoutId: number;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delayMs);
  };
}

function initialize() { 
  if (!window.location.origin.startsWith(DOGFLIGHT_ORIGIN)) return;

  // 1. Record mouse interactions
  document.addEventListener('click', recordClick, true);

  // 2. Debounced capture for local storage mutations (Wait 200ms for batch changes to finish)
  const debouncedCapture = debounce(() => {
    captureSnapshot();
  }, 100);

  // Listen to the custom event coming from injected.ts (MAIN world)
  window.addEventListener(STORAGE_EVENT_NAME, () => {
    debouncedCapture();
  });

  // 3. Modern Lifecycle Management for ending sessions
  const handleSessionEnd = (reason: string) => {
    void finalizeActiveSession('listener', reason);
  };

  window.addEventListener('beforeunload', () => {
    handleSessionEnd('beforeunload');
  });

  // // Detector for page navigation/unload
  // window.addEventListener('pagehide', (event) => {
  //   // event.persisted indicates if page is entering bfcache
  //   handleSessionEnd(event.persisted ? 'page entering bfcache' : 'pagehide');
  // });

  // 4. Runtime Messaging for manual stop
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'STOP_SESSION') {
      void finalizeActiveSession('listener', 'manual stop').then(() => sendResponse({ ok: true }));
      return true; // Keep message channel open for async response
    }
    return false;
  });
  
  // setInterval(captureSnapshot, 1000);
  captureSnapshot();
}

initialize();
