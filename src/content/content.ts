import type { ClickEvent, DogflightStats, ExtensionState, GameSession } from '../shared/types';

const STORAGE_KEY = 'doglight_state';
const DOGFLIGHT_ORIGIN = 'https://dogflight.io';

interface RawStorageSnapshot {
  stats?: DogflightStats;
  recentStats?: DogflightStats;
  firstPlay?: boolean;
  dogflightName?: string;
}

let activeSession: GameSession | null = null;
let lastKnownSnapshot: RawStorageSnapshot = {};
let lastKnownGameCount: number | null = null;

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
    },
  };
}

function startSession(snapshot: RawStorageSnapshot) {
  activeSession = buildSession();
  if (snapshot.stats) {
    activeSession.statsAtStart = snapshot.stats;
  }
  if (snapshot.recentStats) {
    activeSession.recentStatsAtStart = snapshot.recentStats;
  }
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
      finalizeActiveSession();
    }
    startSession(snapshot);
  }

  lastKnownGameCount = currentGames;
}

function loadState(callback: (state: ExtensionState) => void) {
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    const state = (result[STORAGE_KEY] ?? {}) as Partial<ExtensionState>;
    const normalized: ExtensionState = {
      sessions: state.sessions ?? [],
      currentSession: state.currentSession,
      latestStats: state.latestStats,
      latestRecentStats: state.latestRecentStats,
      latestName: state.latestName,
      latestFirstPlay: state.latestFirstPlay,
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
    firstPlay: raw.getItem('firstPlay') === 'true' || raw.getItem('firstPlay') === 'false' ? raw.getItem('firstPlay') === 'true' : undefined,
    dogflightName: raw.getItem('dogflightName') ?? undefined,
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
  const changed = JSON.stringify(snapshot) !== JSON.stringify(lastKnownSnapshot);

  if (!changed) {
    maybeAdvanceGameState(snapshot);
    return;
  }

  lastKnownSnapshot = snapshot;
  persistState({
    latestStats: snapshot.stats,
    latestRecentStats: snapshot.recentStats,
    latestName: snapshot.dogflightName,
    latestFirstPlay: snapshot.firstPlay,
  });

  maybeAdvanceGameState(snapshot);
  applySnapshotToActiveSession(snapshot);
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
  persistState({ currentSession: activeSession });
}

function finalizeActiveSession() {
  if (!activeSession) return;
  const sessionToSave = activeSession;
  sessionToSave.endedAt = Date.now();
  sessionToSave.status = 'ended';
  sessionToSave.statsAtEnd = lastKnownSnapshot.stats;
  sessionToSave.recentStatsAtEnd = lastKnownSnapshot.recentStats;

  loadState((state) => {
    const nextSessions = [...(state.sessions ?? []), sessionToSave];
    chrome.storage.local.set({
      [STORAGE_KEY]: {
        ...state,
        currentSession: undefined,
        sessions: nextSessions,
        lastUpdated: Date.now(),
      },
    });
  });

  activeSession = null;
}

function handleMessage(message: string) {
  if (message.includes('Connected to DogFlight room')) {
    const snapshot = snapshotLocalStorage();
    startSession(snapshot);
    return;
  }

  if (message.includes('Disconnected')) {
    finalizeActiveSession();
  }
}

function attachConsoleCapture() {
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    const message = args.map((arg) => String(arg)).join(' ');
    handleMessage(message);
    return originalLog.apply(console, args);
  };
}

function initialize() {
  if (!window.location.origin.startsWith(DOGFLIGHT_ORIGIN)) return;
  attachConsoleCapture();
  document.addEventListener('click', recordClick, true);
  window.addEventListener('storage', captureSnapshot);
  window.addEventListener('beforeunload', finalizeActiveSession);
  setInterval(captureSnapshot, 1000);
  captureSnapshot();
}

initialize();
