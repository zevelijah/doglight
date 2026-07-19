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
  const burst: ShotBurst = {
    id: uid(),
    startedAt: Date.now(),
    startedShots: snapshot.recentStats?.shots,
    startedHits: snapshot.recentStats?.hits,
    events: [],
  };
  currentShotBurst = burst;
  const scoreValue = typeof snapshot.stats?.score === 'number' ? snapshot.stats.score : 0;
  const recentRightClick = lastKnownRightClick;
  const details = recentRightClick && scoreValue > 80000
    ? `last right click at ${recentRightClick.x}, ${recentRightClick.y}`
    : undefined;
  currentShotBurst.events.push({
    id: uid(),
    timestamp: Date.now(),
    type: 'shots-increase',
    message: `shots increased to ${snapshot.recentStats?.shots ?? 'n/a'}`,
    x: recentRightClick?.x,
    y: recentRightClick?.y,
  });
  if (details) {
    currentShotBurst.events[currentShotBurst.events.length - 1].message = `${currentShotBurst.events[currentShotBurst.events.length - 1].message} (${details})`;
  }
  const bursts = [...(getMetadata(session).shotBursts as ShotBurst[] | undefined) ?? []];
  bursts.push(currentShotBurst);
  setMetadata(session, { shotBursts: bursts });
}

function startSession(snapshot: RawStorageSnapshot, detectedBy: DetectionMethod = 'message', details?: string) {
  activeSession = buildSession();
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
  if (typeof currentRecent.bonus === 'number' && bonusDelta > 0) {
    if (bonusDelta !== 5000 && bonusDelta < 10000) {
      appendGameBonusEntry(activeSession, `${bonusDelta / 2000} scouts guided`, 'live', bonusDelta);
    } else if (bonusDelta === 10000) {
      appendGameBonusEntry(activeSession, 'One bomber (or 5 sct.) guided', 'live', bonusDelta);
    }

    if (bonusDelta === 5000) {
      const bonusTime = Date.now();
      const entries = (getMetadata(activeSession).gameBonuses as GameBonusEntry[] | undefined) ?? [];
      const scoutEntry = [...entries].reverse().find((entry) => entry.message === 'scout killed' && Math.abs(entry.timestamp - bonusTime) <= 500);
      const bomberEntry = [...entries].reverse().find((entry) => entry.message === 'bomber killed' && Math.abs(entry.timestamp - bonusTime) <= 500);
      if (scoutEntry && bomberEntry) {
        const scoutIndex = entries.findIndex((entry) => entry.id === scoutEntry.id);
        if (scoutIndex >= 0) {
          entries[scoutIndex] = { ...entries[scoutIndex], message: 'scout killed. Killed whole squadron by self!' };
          setMetadata(activeSession, { gameBonuses: entries });
        }
      }
    }
  }

  if (typeof currentRecent.bombers === 'number' && typeof previousRecent.bombers === 'number' && currentRecent.bombers > previousRecent.bombers) {
    appendGameBonusEntry(activeSession, 'bomber killed', 'live');
  }
  if (typeof currentRecent.scouts === 'number' && typeof previousRecent.scouts === 'number' && currentRecent.scouts > previousRecent.scouts) {
    appendGameBonusEntry(activeSession, 'scout killed', 'live');
  }

  if (typeof currentRecent.bonus === 'number') {
    lastObservedBonusValue = currentRecent.bonus;
    setMetadata(activeSession, { lastTrackedBonus: currentRecent.bonus });
  }
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
    if (currentShotBurst) {
      appendShotBurstEvent(activeSession, {
        id: uid(),
        timestamp: click.timestamp,
        type: 'right-click',
        message: 'right click',
        x: click.x,
        y: click.y,
        pageX: click.pageX,
        pageY: click.pageY,
      });
    }
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

    if (currentShotBurst) {
      finalizeCurrentShotBurst(activeSession);
      currentShotBurst = null;
    }

    appendDevEvent(activeSession, 'disconnect', detectedBy, details);
    const sessionToSave = activeSession;
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

    loadState((state) => {
      const nextSessions = [...(state.sessions ?? []), sessionToSave];
      chrome.storage.local.set({
        [STORAGE_KEY]: {
          ...state,
          currentSession: undefined,
          sessions: nextSessions,
          lastUpdated: Date.now(),
        },
      }, () => {
        activeSession = null;
        resolve();
      });
    });
  });
}

function initialize() { // This function was written stupidly! The captureSnapshot is too big! The failure listener can't work, and doesn't have a a fallback. The storage listener by definition can't function at all! 
  if (!window.location.origin.startsWith(DOGFLIGHT_ORIGIN)) return;
  document.addEventListener('click', recordClick, true);
  window.addEventListener('storage', captureSnapshot);
  window.addEventListener('beforeunload', () => {
    void finalizeActiveSession('listener', 'page unload');
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'stop-active-session') {
      void finalizeActiveSession('listener', 'manual stop').then(() => sendResponse({ ok: true }));
      return true;
    }
    return false;
  });
  setInterval(captureSnapshot, 1000);
  captureSnapshot();
}

initialize();
