import type {
  ClickEvent,
  DogflightStats,
  ExtensionState,
  GameSession,
  GameBonusEntry,
  SessionDevEvent,
  ShotBurst,
  ShotBurstEvent,
  SelectedPlaneEvent
} from '../shared/types';

const STORAGE_KEY = 'doglight_state';
const DOGFLIGHT_ORIGIN = 'https://dogflight.io';

interface RawStorageSnapshot {
  stats?: DogflightStats;
  recentStats?: DogflightStats;
  dogflightName?: string;
  dogflightUid?: string;
}

interface DogflightStatsShootingTracker {
  shots?: number;
  hits?: number;
  kills?: number;
  bombers?: number;
  scouts?: number;
}

interface DogflightStatsBonusTracker {
  bombers?: number;
  scouts?: number;
  bonus?: number;
}

let activeSession: GameSession | null = null;
let lastKnownSnapshot: RawStorageSnapshot = {};
let lastKnownGameCount: number | null = null;
let currentShotBurst: ShotBurst | null = null;
let lastObservedBonusValue: number | undefined;
let lastKnownRightClick: ClickEvent | null = null;
let autosaveTimer: number | null = null;

type DetectionMethod = 'message' | 'listener' | 'game-count-change';

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSession(): GameSession {
  return {
    id: uid(),
    startedAt: Date.now(),
    status: 'active',
    clicks: [],
    selectedPlanes: [],
    metadata: {
      origin: window.location.origin,
      url: window.location.href,
      team: 'green',
      shotBursts: [],
      gameBonuses: [],
      leftClicks: [],
      devEvents: [],
      deathTimestamps: [],
    },
  };
}

function getMetadata(session: GameSession) {
  if (!session.metadata) {
    session.metadata = {
      origin: window.location.origin,
      url: window.location.href,
      team: 'green',
      shotBursts: [],
      gameBonuses: [],
      leftClicks: [],
      devEvents: [],
      deathTimestamps: [],
    };
  }
  return session.metadata as NonNullable<GameSession['metadata']>;
}

// Optimization: Direct array mutation instead of cloning arrays with spread syntax
function appendDevEvent(
  session: GameSession | null,
  type: SessionDevEvent['type'],
  detectedBy: DetectionMethod,
  details?: string
) {
  if (!session) return;
  const meta = getMetadata(session);
  if (!meta.devEvents) meta.devEvents = [];
  (meta.devEvents as SessionDevEvent[]).push({
    timestamp: Date.now(),
    type,
    detectedBy,
    details,
  });
}

function appendGameBonusEntry(
  session: GameSession | null,
  type: GameBonusEntry['type'],
  source: GameBonusEntry['source'],
  amount: number
) {
  if (!session) return;
  const meta = getMetadata(session);
  if (!meta.gameBonuses) meta.gameBonuses = [];
  (meta.gameBonuses as GameBonusEntry[]).push({
    id: uid(),
    timestamp: Date.now(),
    type,
    source,
    amount,
  });
}

function appendShotBurstEvent(session: GameSession | null, event: ShotBurstEvent) {
  if (!session || !currentShotBurst) return;
  currentShotBurst.events.push(event);

  const meta = getMetadata(session);
  if (!meta.shotBursts) meta.shotBursts = [];
  const bursts = meta.shotBursts as ShotBurst[];

  if (!bursts.some((b) => b.id === currentShotBurst?.id)) {
    bursts.push(currentShotBurst);
  }
}

function finalizeCurrentShotBurst(session: GameSession | null) {
  if (!session || !currentShotBurst) return;
  currentShotBurst.endedAt = Date.now();

  const meta = getMetadata(session);
  if (!meta.shotBursts) meta.shotBursts = [];
  const bursts = meta.shotBursts as ShotBurst[];

  if (!bursts.some((b) => b.id === currentShotBurst?.id)) {
    bursts.push(currentShotBurst);
  }
  currentShotBurst = null;
}

function beginNewShotBurst(session: GameSession | null, snapshot: RawStorageSnapshot) {
  if (!session) return;
  finalizeCurrentShotBurst(session);

  const scoreValue = typeof snapshot.stats?.score === 'number' ? snapshot.stats.score : 0;
  const recentRightClick =
    lastKnownRightClick && scoreValue > 80000 ? lastKnownRightClick : undefined;

  const burst: ShotBurst = {
    id: uid(),
    startedAt: Date.now(),
    startedShots: snapshot.recentStats?.shots,
    startedHits: snapshot.recentStats?.hits,
    x: recentRightClick?.x,
    y: recentRightClick?.y,
    pageX: recentRightClick?.pageX,
    pageY: recentRightClick?.pageY,
    events: [],
  };
  currentShotBurst = burst;

  currentShotBurst.events.push({
    id: uid(),
    timestamp: Date.now(),
    type: 'shots-increase',
  });

  const meta = getMetadata(session);
  if (!meta.shotBursts) meta.shotBursts = [];
  (meta.shotBursts as ShotBurst[]).push(currentShotBurst);
}

function handleDeathTracking(
  snapshot: RawStorageSnapshot,
  previousSnapshot: RawStorageSnapshot
) {
  if (!activeSession) return;
  const previousDeaths = previousSnapshot.recentStats?.deaths ?? 0;
  const currentDeaths = snapshot.recentStats?.deaths ?? 0;
  const deathsDelta = currentDeaths - previousDeaths;

  if (deathsDelta > 0) {
    const meta = getMetadata(activeSession);
    if (!meta.deathTimestamps) {
      meta.deathTimestamps = [];
    }
    for (let i = 0; i < deathsDelta; i++) {
      (meta.deathTimestamps as number[]).push(Date.now());
    }
  }
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

function startSession(
  snapshot: RawStorageSnapshot,
  detectedBy: DetectionMethod = 'message',
  details?: string
) {
  activeSession = buildSession();

  setSelfTabId().catch((error) => {
    console.error('[Content] Failed to set self tab ID:', error);
  });

  if (snapshot.stats) {
    activeSession.statsAtStart = snapshot.stats;
  }
  if (snapshot.recentStats) {
    activeSession.recentStatsAtStart = snapshot.recentStats;
  }

  const meta = getMetadata(activeSession);
  meta.dogflightName = snapshot.dogflightName;
  meta.dogflightUid = snapshot.dogflightUid;

  currentShotBurst = null;
  lastKnownRightClick = null;
  lastObservedBonusValue = snapshot.recentStats?.bonus;

  appendDevEvent(activeSession, 'connect', detectedBy, details);

  // Initial immediate flush to set active state on storage
  persistState({ currentSession: activeSession });
  startAutosave();
}

function applySnapshotToActiveSession(snapshot: RawStorageSnapshot) {
  if (!activeSession) return;
  if (!activeSession.statsAtStart && snapshot.stats) {
    activeSession.statsAtStart = snapshot.stats;
  }
  if (!activeSession.recentStatsAtStart && snapshot.recentStats) {
    activeSession.recentStatsAtStart = snapshot.recentStats;
  }
  // Persistence deferred to batch timer
}

function maybeAdvanceGameState(snapshot: RawStorageSnapshot) {
  const currentGames = snapshot.stats?.games;
  if (typeof currentGames !== 'number') return;

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

function handleShotBurstTracking(
  snapshot: RawStorageSnapshot,
  previousSnapshot: RawStorageSnapshot
) {
  if (!activeSession) return;
  const previousRecent = previousSnapshot.recentStats;
  const currentRecent = snapshot.recentStats;
  if (!previousRecent || !currentRecent) return;

  if (
    typeof currentRecent.shots === 'number' &&
    typeof previousRecent.shots === 'number' &&
    currentRecent.shots > previousRecent.shots
  ) {
    beginNewShotBurst(activeSession, snapshot);
  }

  if (!currentShotBurst) return;

  const hitsDelta = (currentRecent.hits ?? 0) - (previousRecent.hits ?? 0);
  for (let index = 0; index < hitsDelta; index += 1) {
    appendShotBurstEvent(activeSession, {
      id: uid(),
      timestamp: Date.now(),
      type: 'hits-increase',
    });
  }

  if ((currentRecent.bombers ?? 0) > (previousRecent.bombers ?? 0)) {
    appendShotBurstEvent(activeSession, {
      id: uid(),
      timestamp: Date.now(),
      type: 'bomber-kill',
    });
  }
  if ((currentRecent.scouts ?? 0) > (previousRecent.scouts ?? 0)) {
    appendShotBurstEvent(activeSession, {
      id: uid(),
      timestamp: Date.now(),
      type: 'scout-kill',
    });
  }
  if ((currentRecent.kills ?? 0) > (previousRecent.kills ?? 0)) {
    appendShotBurstEvent(activeSession, {
      id: uid(),
      timestamp: Date.now(),
      type: 'player-kill',
    });
  }

  if (
    typeof currentShotBurst.startedHits === 'number' &&
    typeof currentRecent.hits === 'number' &&
    currentRecent.hits - currentShotBurst.startedHits >= 8
  ) {
    finalizeCurrentShotBurst(activeSession);
  }
}

function handleBonusTracking(
  snapshot: RawStorageSnapshot,
  previousSnapshot: RawStorageSnapshot
) {
  if (!activeSession) return;
  const previousRecent = previousSnapshot.recentStats;
  const currentRecent = snapshot.recentStats;
  if (!previousRecent || !currentRecent) return;

  const bonusDelta = (currentRecent.bonus ?? 0) - (previousRecent.bonus ?? 0);
  const bomberKilled =
    typeof currentRecent.bombers === 'number' &&
    typeof previousRecent.bombers === 'number' &&
    currentRecent.bombers > previousRecent.bombers;
  const scoutKilled =
    typeof currentRecent.scouts === 'number' &&
    typeof previousRecent.scouts === 'number' &&
    currentRecent.scouts > previousRecent.scouts;
  const squadKilled = bonusDelta === 5000 && !bomberKilled && scoutKilled;

  if (typeof currentRecent.bonus === 'number') {
    if (bonusDelta === 0) {
      if (scoutKilled && !squadKilled) {
        appendGameBonusEntry(activeSession, 'scout-kill', 'live', 0);
      }
    } else {
      if (bonusDelta !== 5000 && bonusDelta % 2000 !== 0) {
        appendGameBonusEntry(activeSession, 'performance-bonus-detected', 'live', bonusDelta);
      } else if (bonusDelta === 5000 && !squadKilled && !bomberKilled) {
        appendGameBonusEntry(activeSession, 'performance-bonus-detected', 'live', bonusDelta);
      } else {
        if (bonusDelta === 5000) {
          if (bomberKilled) {
            appendGameBonusEntry(activeSession, 'bomber-kill', 'live', 5000);
          }
          if (scoutKilled && squadKilled) {
            appendGameBonusEntry(activeSession, 'squad-kill', 'live', 5000);
          }
        } else if (bonusDelta !== 5000 && bonusDelta < 10000) {
          appendGameBonusEntry(activeSession, 'scouts-guided', 'live', bonusDelta);
        } else if (bonusDelta === 10000) {
          appendGameBonusEntry(activeSession, 'bomber-guided', 'live', 10000);
        }
        if (typeof currentRecent.bonus === 'number') {
          lastObservedBonusValue = currentRecent.bonus;
          getMetadata(activeSession).lastTrackedBonus = currentRecent.bonus;
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

// Background batch writer: Flushes RAM buffer to storage periodically
function startAutosave() {
  stopAutosave();
  autosaveTimer = window.setInterval(() => {
    if (activeSession) {
      persistState({ currentSession: activeSession });
    }
  }, 5000); // Saves every 5s instead of per-click
}

function stopAutosave() {
  if (autosaveTimer !== null) {
    clearInterval(autosaveTimer);
    autosaveTimer = null;
  }
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

// Optimization: Targeted field comparison instead of full JSON.stringify
function captureSnapshot() {
  const snapshot = snapshotLocalStorage();
  const previousSnapshot = lastKnownSnapshot;

  const hasChanged =
    snapshot.dogflightName !== previousSnapshot.dogflightName ||
    snapshot.dogflightUid !== previousSnapshot.dogflightUid ||
    snapshot.stats?.games !== previousSnapshot.stats?.games ||
    snapshot.recentStats?.shots !== previousSnapshot.recentStats?.shots ||
    snapshot.recentStats?.hits !== previousSnapshot.recentStats?.hits ||
    snapshot.recentStats?.bonus !== previousSnapshot.recentStats?.bonus ||
    snapshot.recentStats?.kills !== previousSnapshot.recentStats?.kills ||
    snapshot.recentStats?.bombers !== previousSnapshot.recentStats?.bombers ||
    snapshot.recentStats?.scouts !== previousSnapshot.recentStats?.scouts ||
    snapshot.recentStats?.deaths !== previousSnapshot.recentStats?.deaths;

  if (hasChanged) {
    lastKnownSnapshot = snapshot;
  }

  maybeAdvanceGameState(snapshot);
  applySnapshotToActiveSession(snapshot);

  if (activeSession) {
    const previousRecentShooting = previousSnapshot.recentStats as
      | DogflightStatsShootingTracker
      | undefined;
    const currentRecentShooting = snapshot.recentStats as
      | DogflightStatsShootingTracker
      | undefined;

    const previousRecentBonus = previousSnapshot.recentStats as
      | DogflightStatsBonusTracker
      | undefined;
    const currentRecentBonus = snapshot.recentStats as
      | DogflightStatsBonusTracker
      | undefined;

    if (
      previousRecentShooting &&
      currentRecentShooting &&
      previousRecentShooting.shots !== currentRecentShooting.shots
    ) {
      handleShotBurstTracking(snapshot, previousSnapshot);
    }
    if (
      previousRecentBonus &&
      currentRecentBonus &&
      previousRecentBonus.bonus !== currentRecentBonus.bonus
    ) {
      handleBonusTracking(snapshot, previousSnapshot);
    }
    if (
      previousSnapshot.recentStats &&
      snapshot.recentStats &&
      previousSnapshot.recentStats.deaths !== snapshot.recentStats.deaths
    ) {
      handleDeathTracking(snapshot, previousSnapshot);
    }
  }
}

function handlePlaneClick(cell: HTMLElement, snapshot: RawStorageSnapshot) {
  if (!activeSession) return;

  // Extract digits from cell ID (e.g. "cell0" -> 0, "cell2" -> 2)
  const match = cell.id.match(/^cell(\d+)$/);
  if (!match) return;

  const planeId = parseInt(match[1], 10);

  // Safety check: ensure array exists on activeSession
  if (!activeSession.selectedPlanes) {
    activeSession.selectedPlanes = [];
  }

  // OPTIONAL DEDUPLICATION: Only record if it's a change from the last selected plane
  const lastSelected = activeSession.selectedPlanes[activeSession.selectedPlanes.length - 1] as SelectedPlaneEvent | undefined;
  if ((!lastSelected && activeSession.selectedPlanes.length === 0) || (lastSelected && (lastSelected.id !== planeId || (activeSession.selectedPlanes.length === 1 && snapshot.stats?.score && snapshot.stats.score >= 30000) || (activeSession.selectedPlanes.length === 2 && snapshot.stats?.score && snapshot.stats.score >= 80000)))) {
    const nextSelected: SelectedPlaneEvent = {
      id: planeId,
      timestamp: Date.now(),
    };
    
    activeSession.selectedPlanes.push(nextSelected);
    console.log(`[Content] Plane selected: ${planeId}, Tier ${activeSession.selectedPlanes.length}`, activeSession.selectedPlanes);
    
    // Persist active session state immediately
    persistState({ currentSession: activeSession });
  }
}

// Optimization: Lightweight, non-blocking click recorder
function recordClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) return;

  // 1. Check if the click occurred on or inside a plane cell (e.g. <td id="cell0">)
  const planeCell = target.closest<HTMLElement>('.planeOption, [id^="cell"]');

  if (planeCell) {
    const snapshot = snapshotLocalStorage();
    const previousSnapshot = lastKnownSnapshot;

    if (snapshot.stats?.score !== previousSnapshot.stats?.score) {
      lastKnownSnapshot = snapshot;
      // applySnapshotToActiveSession(snapshot); // Unnessasary?
    }

    handlePlaneClick(planeCell, snapshot);
    return; // ❌ Excludes this click from normal recordClick processing!
  }

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
    const meta = getMetadata(activeSession);
    if (!meta.leftClicks) meta.leftClicks = [];
    (meta.leftClicks as ClickEvent[]).push(click);
  }

  // NOTE: persistState() removed to prevent per-click disk write stalls.
}

function finalizeActiveSession(
  detectedBy: DetectionMethod = 'listener',
  details?: string
): Promise<void> {
  return new Promise((resolve) => {
    stopAutosave();

    if (!activeSession) {
      resolve();
      return;
    }

    console.log('[Content] Finalizing session');
    captureSnapshot();

    const sessionToSave = activeSession;
    activeSession = null;

    if (currentShotBurst) {
      finalizeCurrentShotBurst(sessionToSave);
      currentShotBurst = null;
    }

    if (details === 'manual stop') {
      appendDevEvent(sessionToSave, 'disconnect', detectedBy, details);
    } else {
      appendDevEvent(sessionToSave, 'graceful', detectedBy, details);
    }

    sessionToSave.endedAt = Date.now();
    sessionToSave.status = 'ended';
    sessionToSave.statsAtEnd = lastKnownSnapshot.stats;
    sessionToSave.recentStatsAtEnd = lastKnownSnapshot.recentStats;

    const bonusBefore =
      (getMetadata(sessionToSave).lastTrackedBonus as number | undefined) ??
      lastObservedBonusValue;
    const bonusAfter = lastKnownSnapshot.recentStats?.bonus;
    const timeSaved = lastKnownSnapshot.recentStats?.timeSaved ?? 0;
    const points = Number(lastKnownSnapshot.recentStats?.points ?? 0);
    const pointsAgainst = Number(lastKnownSnapshot.recentStats?.pointsAgainst ?? 0);
    const kills = Number(lastKnownSnapshot.recentStats?.kills ?? 0);
    const deaths = Number(lastKnownSnapshot.recentStats?.deaths ?? 0);

    if (
      typeof bonusBefore === 'number' &&
      typeof bonusAfter === 'number' &&
      bonusAfter > bonusBefore
    ) {
      appendGameBonusEntry(sessionToSave, 'game-bonus', 'finalization', bonusBefore);

      if (timeSaved > 0 && kills - deaths > 0) {
        const expectedPerformanceBonus =
          timeSaved * (kills - deaths + (points - pointsAgainst));
        const actualIncrease = bonusAfter - bonusBefore;

        if (
          (points > pointsAgainst && actualIncrease !== expectedPerformanceBonus) ||
          (pointsAgainst > points && actualIncrease === expectedPerformanceBonus)
        ) {
          getMetadata(sessionToSave).team = 'red';
        }

        if (actualIncrease > 0) {
          appendGameBonusEntry(
            sessionToSave,
            'performance-bonus',
            'finalization',
            actualIncrease
          );
        }
      }
    }

    // Single atomic write on session completion
    try {
      loadState((state) => {
        const nextSessions = [...(state.sessions ?? []), sessionToSave];
        let bestAllTimeRank = state.bestAllTimeRank;
        const newAllTimeHighScore = lastKnownSnapshot.stats?.allTimeHighScore;

        if (typeof newAllTimeHighScore === 'number' && newAllTimeHighScore > 0) {
          if (bestAllTimeRank === undefined || newAllTimeHighScore < bestAllTimeRank) {
            bestAllTimeRank = newAllTimeHighScore;
          }
        }
        chrome.storage.local.set(
          {
            [STORAGE_KEY]: {
              ...state,
              currentSession: undefined,
              currentSessionTabId: undefined,
              bestAllTimeRank,
              sessions: nextSessions,
              lastUpdated: Date.now(),
            },
          },
          () => {
            if (chrome.runtime.lastError) {
              console.error(
                '❌ [Content] Storage WRITE FAILED:',
                chrome.runtime.lastError.message
              );
            } else {
              console.log('✅ [Content] Game session successfully stored to disk!');
            }
            resolve();
          }
        );
      });
    } catch (err) {
      console.error('❌ [Content] Error during session finalization write:', err);
      resolve();
    }
  });
}

const STORAGE_EVENT_NAME = 'DOGFLIGHT_STORAGE_MUTATED';

function debounce(fn: Function, delayMs: number) {
  let timeoutId: number;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), delayMs);
  };
}

function initialize() {
  if (!window.location.origin.startsWith(DOGFLIGHT_ORIGIN)) return;

  // 1. Passive event listener (ensures priority stays with game rendering loop)
  document.addEventListener('click', recordClick, { capture: true, passive: true });

  // 2. Debounced storage snapshot capture
  const debouncedCapture = debounce(() => {
    captureSnapshot();
  }, 100);

  window.addEventListener(STORAGE_EVENT_NAME, () => {
    debouncedCapture();
  });

  // 3. Unload handling
  window.addEventListener('beforeunload', () => {
    void finalizeActiveSession('listener', 'beforeunload');
  });

  // 4. Runtime messaging
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'STOP_SESSION') {
      void finalizeActiveSession('listener', 'manual stop').then(() =>
        sendResponse({ ok: true })
      );
      return true;
    }
    return false;
  });

  captureSnapshot();
}

initialize();