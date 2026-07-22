import React, { useEffect, useState, useCallback } from 'react';
import type {
  ExtensionState,
  GameSession,
  GameBonusEntry,
  ClickEvent,
  ShotBurst,
  SessionDevEvent,
  SelectedPlaneEvent,
} from '../shared/types';

const STORAGE_KEY = 'doglight_state';
type MetricValue = number | undefined;

// --- COLOR CONSTANTS ---
const GRAPH_COLORS = {
  grid: '#374151',           // Faint dark gray
  gridText: '#9ca3af',       // Minute label text
  shotDot: '#22c55e',        // Bright green dot (New shot)
  hitDot: '#ef4444',         // Bright red dot (Hit)
  planeLine: '#ffffff',      // Bright white line (Plane)
  playerKillLine: '#ef4444', // Bright red line
  bomberKillLine: '#15803d', // Dark green line
  scoutKillLine: '#ca8a04',  // Dark yellow line
  bomberGuideLine: '#22c55e',// Bright green line
  scoutGuideLine: '#eab308', // Bright yellow line
  playerDeathLine: '#3b82f6',// Bright blue line
};

// --- HELPER FUNCTIONS ---

function formatStats(value: Record<string, unknown> | undefined) {
  if (!value) return 'None';
  return `${value.score ?? 'n/a'} / ${value.kills ?? 'n/a'} kills / ${value.games ?? 'n/a'} games`;
}

function toDisplayTime(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  return new Date(value).toLocaleString();
}

function displayBonusMessage(bonus: GameBonusEntry) {
  switch (bonus.type) {
    case 'scout-kill': return 'scout killed';
    case 'bomber-kill': return 'bomber killed';
    case 'bomber-guided': return '1 bomber (or 5 sct.) guided';
    case 'scouts-guided': return `${bonus.amount / 2000} scouts guided`;
    case 'game-bonus': return 'total game bonuses';
    case 'performance-bonus-detected': return 'performance bonus detected';
    case 'performance-bonus': return 'performance bonus';
    default: return 'unknown';
  }
}

function formatMetric(value: MetricValue) {
  return typeof value === 'number' ? value.toString() : 'n/a';
}

function getResult(recentStats: Record<string, unknown> | undefined, devEvent: SessionDevEvent | undefined) {
  const points = Number(recentStats?.points ?? 0);
  const pointsAgainst = Number(recentStats?.pointsAgainst ?? 0);
  const time = Number(recentStats?.time ?? 0);
  const shots = Number(recentStats?.shots ?? 0);
  if ((points !== 100 && pointsAgainst !== 100 && (time < 900 || shots === 0)) || devEvent?.type === 'disconnect') {
    return 'Disconnected';
  }
  if (points === pointsAgainst) return 'Tied';
  if (points > pointsAgainst) return 'Won';
  if (points < pointsAgainst) return 'Lost';
  return undefined;
}

function getSessionResult(session: GameSession, recentStats: Record<string, unknown> | undefined) {
  const devEvents = session.metadata?.devEvents as SessionDevEvent[] | undefined;
  const panicDevEvent = devEvents?.find((event) => event.type === 'disconnect');
  const result = getResult(recentStats, panicDevEvent);
  if (result === 'Won' && session.metadata?.team === 'red') return 'Lost';
  if (result === 'Lost' && session.metadata?.team === 'red') return 'Won';
  return result;
}

function getPrecision(recentStats: Record<string, unknown> | undefined) {
  const shots = Number(recentStats?.shots ?? 0);
  const hits = Number(recentStats?.hits ?? 0);
  if (!shots) return 'n/a';
  return (hits / shots).toFixed(3);
}

function getDamagePerShot(recentStats: Record<string, unknown> | undefined) {
  const shots = Number(recentStats?.shots ?? 0);
  const damage = Number(recentStats?.damage ?? 0);
  if (!shots) return 'n/a';
  return (damage / shots).toFixed(3);
}

function getPlaneNameByTier(id: number, tierIndex: number) {
  const tier = tierIndex + 1;
  if (tier === 1) return id === 0 ? 'Biplane' : 'Cavalier';
  if (tier === 2) return id === 0 ? 'Mikoy' : 'Stripey Plane';
  if (tier === 3) {
    if (id === 0) return 'Thunderbolt';
    if (id === 1) return 'Motsky';
    if (id === 2) return 'Barracuda';
  }
  return 'Plane';
}

function toDisplayPlane(selectedPlanes: SelectedPlaneEvent[] | undefined) {
  const namedPlanes: Record<string, string> = {};
  if (!selectedPlanes?.length) return ['unknown'];

  selectedPlanes.forEach((plane, index) => {
    const name = getPlaneNameByTier(plane.id, index);
    namedPlanes[name] = toDisplayTime(plane.timestamp);
  });
  return namedPlanes;
}

async function loadStateFromStorage(): Promise<ExtensionState> {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return (result[STORAGE_KEY] ?? { sessions: [] }) as ExtensionState;
}

async function saveStateToStorage(state: ExtensionState) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

// --- TOP SECTION GRAPH KEY/LEGEND COMPONENT ---

function TimelineLegend() {
  const legendItems = [
    { label: 'New Shot', color: GRAPH_COLORS.shotDot, type: 'dot' },
    { label: 'Hit', color: GRAPH_COLORS.hitDot, type: 'dot' },
    { label: 'New Plane', color: GRAPH_COLORS.planeLine, type: 'line' },
    { label: 'Player Kill', color: GRAPH_COLORS.playerKillLine, type: 'line' },
    { label: 'Bomber Kill', color: GRAPH_COLORS.bomberKillLine, type: 'line' },
    { label: 'Scout Kill', color: GRAPH_COLORS.scoutKillLine, type: 'line' },
    { label: 'Bomber Guided', color: GRAPH_COLORS.bomberGuideLine, type: 'line' },
    { label: 'Scout Guided', color: GRAPH_COLORS.scoutGuideLine, type: 'line' },
    { label: 'Player Death', color: GRAPH_COLORS.playerDeathLine, type: 'line' },
    { label: 'Minute Line', color: GRAPH_COLORS.grid, type: 'line' },
  ];

  return (
    <div style={{ background: '#111827', padding: '10px', borderRadius: '6px', marginTop: '12px', border: '1px solid #374151' }}>
      <h3 style={{ fontSize: '13px', margin: '0 0 8px 0', color: '#d1d5db' }}>Graph Key / Legend</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 16px', fontSize: '12px' }}>
        {legendItems.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {item.type === 'dot' ? (
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color, display: 'inline-block' }} />
            ) : (
              <span style={{ width: '12px', height: '3px', backgroundColor: item.color, display: 'inline-block' }} />
            )}
            <span style={{ color: '#9ca3af' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- SESSION SVG TIMELINE GRAPH COMPONENT ---

function SessionTimelineChart({ session }: { session: GameSession }) {
  const startTime = session.startedAt;
  const recentStats = session.recentStatsAtEnd as Record<string, unknown> | undefined;
  const durationMs = recentStats?.time ? Number(recentStats.time) * 1000 : (session.endedAt ? session.endedAt - startTime : 60000);
  const endTime = startTime + (durationMs > 0 ? durationMs : 60000);

  // SVG dimensions
  const width = 800;
  const height = 180;
  const marginTop = 30;
  const marginBottom = 30;
  const marginLeft = 20;
  const marginRight = 20;
  const chartWidth = width - marginLeft - marginRight;
  const chartHeight = height - marginTop - marginBottom;
  const centerY = marginTop + chartHeight / 2;

  // Scale timestamp to X coordinate
  const getX = (timestamp: number) => {
    const elapsed = timestamp - startTime;
    const ratio = Math.max(0, Math.min(1, elapsed / durationMs));
    return marginLeft + ratio * chartWidth;
  };

  // 1. Minute Grid Lines
  const totalMinutes = Math.ceil(durationMs / 60000);
  const minuteGridLines = [];
  for (let m = 0; m <= totalMinutes; m++) {
    const time = startTime + m * 60000;
    if (time > endTime + 5000) break;
    const x = getX(time);
    minuteGridLines.push(
      <g key={`min-${m}`}>
        <line x1={x} y1={marginTop} x2={x} y2={height - marginBottom} stroke={GRAPH_COLORS.grid} strokeWidth="1" strokeDasharray="2 2" />
        <text x={x} y={height - 8} fill={GRAPH_COLORS.gridText} fontSize="10" textAnchor="middle">
          {m}m
        </text>
      </g>
    );
  }

  // 2. Shots & Hits (Dots at Center Y)
  const shotDots: React.ReactNode[] = [];
  const shotBursts = (session.metadata?.shotBursts as ShotBurst[] | undefined) ?? [];
  shotBursts.forEach((burst, bIdx) => {
    (burst.events ?? []).forEach((ev, eIdx) => {
      const x = getX(ev.timestamp);
      if (ev.type === 'shots-increase') {
        shotDots.push(<circle key={`shot-${bIdx}-${eIdx}`} cx={x} cy={centerY} r="3" fill={GRAPH_COLORS.shotDot} />);
      } else if (ev.type === 'hits-increase') {
        shotDots.push(<circle key={`hit-${bIdx}-${eIdx}`} cx={x} cy={centerY} r="3" fill={GRAPH_COLORS.hitDot} />);
      }
    });
  });

  // 3. Vertical Event Lines
  const eventLines: React.ReactNode[] = [];

  // Plane Changes (Bright White + Top Label)
  (session.selectedPlanes ?? []).forEach((plane, pIdx) => {
    const x = getX(plane.timestamp);
    const label = getPlaneNameByTier(plane.id, pIdx);
    eventLines.push(
      <g key={`plane-${pIdx}`}>
        <line x1={x} y1={marginTop} x2={x} y2={height - marginBottom} stroke={GRAPH_COLORS.planeLine} strokeWidth="2" />
        <text x={x} y={marginTop - 8} fill={GRAPH_COLORS.planeLine} fontSize="10" textAnchor="middle" fontWeight="bold">
          {label}
        </text>
      </g>
    );
  });

  // Player Deaths (Bright Blue)
  ((session.metadata?.deathTimestamps as number[]) ?? []).forEach((timestamp, dIdx) => {
    const x = getX(timestamp);
    eventLines.push(
      <line key={`death-${dIdx}`} x1={x} y1={marginTop} x2={x} y2={height - marginBottom} stroke={GRAPH_COLORS.playerDeathLine} strokeWidth="2" />
    );
  });

  // Shot burst events (Player Kills)
  shotBursts.forEach((burst, bIdx) => {
    (burst.events ?? []).forEach((ev, eIdx) => {
      if (ev.type === 'player-kill') {
        const x = getX(ev.timestamp);
        eventLines.push(
          <line key={`pkill-${bIdx}-${eIdx}`} x1={x} y1={marginTop} x2={x} y2={height - marginBottom} stroke={GRAPH_COLORS.playerKillLine} strokeWidth="2" />
        );
      }
    });
  });

  // Game Bonuses (Bomber/Scout Kills & Guides)
  const gameBonuses = (session.metadata?.gameBonuses as GameBonusEntry[] | undefined) ?? [];
  gameBonuses.forEach((bonus, bgIdx) => {
    const x = getX(bonus.timestamp);
    if (bonus.type === 'bomber-kill') {
      eventLines.push(
        <line key={`bkill-${bgIdx}`} x1={x} y1={marginTop} x2={x} y2={height - marginBottom} stroke={GRAPH_COLORS.bomberKillLine} strokeWidth="2" />
      );
    } else if (bonus.type === 'scout-kill') {
      eventLines.push(
        <line key={`skill-${bgIdx}`} x1={x} y1={marginTop} x2={x} y2={height - marginBottom} stroke={GRAPH_COLORS.scoutKillLine} strokeWidth="2" />
      );
    } else if (bonus.type === 'bomber-guided') {
      eventLines.push(
        <line key={`bguide-${bgIdx}`} x1={x} y1={marginTop} x2={x} y2={height - marginBottom} stroke={GRAPH_COLORS.bomberGuideLine} strokeWidth="2" />
      );
    } else if (bonus.type === 'scouts-guided') {
      const count = Math.round(bonus.amount / 2000);
      eventLines.push(
        <g key={`sguide-${bgIdx}`}>
          <line x1={x} y1={marginTop} x2={x} y2={height - marginBottom} stroke={GRAPH_COLORS.scoutGuideLine} strokeWidth="2" />
          <text x={x} y={marginTop - 8} fill={GRAPH_COLORS.scoutGuideLine} fontSize="9" textAnchor="middle">
            {count} sct. guided
          </text>
        </g>
      );
    }
  });

  return (
    <div style={{ width: '100%', overflowX: 'auto', background: '#0a0e17', borderRadius: '6px', padding: '10px 0' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: '600px', height: 'auto', display: 'block' }}>
        {/* Minute Grid */}
        {minuteGridLines}

        {/* Center Line for Shots/Hits */}
        <line x1={marginLeft} y1={centerY} x2={width - marginRight} y2={centerY} stroke="#1f2937" strokeWidth="1" />

        {/* Vertical Event Lines */}
        {eventLines}

        {/* Center Shots & Hits Dots */}
        {shotDots}
      </svg>
    </div>
  );
}

// --- MAIN REACT APP ---

export default function App() {
  const [state, setState] = useState<ExtensionState | null>(null);
  const [visibleSessionCount, setVisibleSessionCount] = useState(10);
  const isPopupView = new URLSearchParams(window.location.search).get('mode') === 'popup';

  const refreshState = useCallback(async () => {
    const loaded = await loadStateFromStorage();
    setState(loaded);
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  if (!state) {
    return <div className="panel">Loading extension data…</div>;
  }

  const handleExportJson = async () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: 'doglight-export.json', saveAs: true });
  };

  const handleOpenFullPage = async () => {
    const url = chrome.runtime.getURL('src/viewer/viewer.html');
    await chrome.tabs.create({ url });
  };

  const handleStopSession = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'STOP_SESSION' }, () => {
        if (chrome.runtime.lastError) {
          chrome.runtime.sendMessage({ type: 'EMERGENCY_STOP_SESSION' });
        }
      });
    }
    await refreshState();
  };

  const handleEmergencyStop = async () => {
    if (state.currentSessionTabId !== undefined) {
      chrome.runtime.sendMessage({ type: 'EMERGENCY_STOP_SESSION' });
    }
    await refreshState();
  };

  const handleDeleteSession = async (id: string) => {
    const newState = {
      ...state,
      sessions: (state.sessions ?? []).filter((s) => s.id !== id),
      currentSession: state.currentSession?.id === id ? undefined : state.currentSession,
    };
    await saveStateToStorage(newState);
    setState(newState);
  };

  const handleSwitchTeam = async (id: string) => {
    const nextSessions = (state.sessions ?? []).map((session) => {
      if (session.id === id) {
        const currentTeam = session.metadata?.team ?? 'green';
        return {
          ...session,
          metadata: {
            ...(session.metadata ?? {}),
            team: currentTeam === 'green' ? 'red' : 'green',
          },
        };
      }
      return session;
    });

    const newState = { ...state, sessions: nextSessions } as ExtensionState;
    await saveStateToStorage(newState);
    setState(newState);
  };

  const allTimeStats = state.latestStats as Record<string, unknown> | undefined;
  const latestRecent = state.latestRecentStats as Record<string, unknown> | undefined;
  const devEvents = state.currentSession?.metadata?.devEvents as SessionDevEvent[] | undefined;
  const panicDevEvent = devEvents?.find((e) => e.type === 'disconnect');

  const rankingFields = [
    ['Weekly High Score', allTimeStats?.weeklyHighScore],
    ['Monthly High Score', allTimeStats?.monthlyHighScore],
    ['All Time High Score', allTimeStats?.allTimeHighScore],
  ];
  const rankingText = rankingFields
    .filter(([, value]) => typeof value === 'number' && Number(value) !== -1)
    .map(([label, value]) => `${label}: ${value}`)
    .join('   ');

  const rawSessions = state.sessions ?? [];
  const reversedSessions = [...rawSessions].reverse();
  const visibleSessions = reversedSessions.slice(0, visibleSessionCount);

  return (
    <div>
      {/* Control Panel */}
      <div className="panel">
        <h1>DogLight</h1>
        <div className="row">
          Latest stats: <span>{formatStats(state.latestStats as Record<string, unknown> | undefined)}</span>
        </div>
        <div className="row">
          Latest recent stats: <span>{formatStats(state.latestRecentStats as Record<string, unknown> | undefined)}</span>
        </div>
        <div className="row">
          Active session:{' '}
          <span>
            {state.currentSession
              ? `${state.currentSession.status} (${state.currentSession.clicks?.length ?? 0} clicks)`
              : 'None'}
          </span>
        </div>

        {/* Overview Section */}
        <div id="overviewContainer">
          <details className="overview-details">
            <summary>Overall stats</summary>
            <div className="overview-line">
              {rankingText || 'No rankings yet'} Games: {Number(allTimeStats?.games ?? 0)} Best:{' '}
              {rankingText || 'n/a'}
            </div>
            <div className="stat-grid">
              <div className="stat-row">Shots: {formatMetric(allTimeStats?.shots as MetricValue)}</div>
              <div className="stat-row">Hits: {formatMetric(allTimeStats?.hits as MetricValue)}</div>
              <div className="stat-row">Precision: {getPrecision(allTimeStats)}</div>
              <div className="stat-row">Damage: {formatMetric(allTimeStats?.damage as MetricValue)}</div>
              <div className="stat-row">Damage / shot: {getDamagePerShot(allTimeStats)}</div>
              <div className="stat-row">Bombers: {formatMetric(allTimeStats?.bombers as MetricValue)}</div>
              <div className="stat-row">Scouts: {formatMetric(allTimeStats?.scouts as MetricValue)}</div>
              <div className="stat-row">Kills: {formatMetric(allTimeStats?.kills as MetricValue)}</div>
              <div className="stat-row">Deaths: {formatMetric(allTimeStats?.deaths as MetricValue)}</div>
              <div className="stat-row">
                Kills - Deaths:{' '}
                {formatMetric((Number(allTimeStats?.kills ?? 0) - Number(allTimeStats?.deaths ?? 0)) as MetricValue)}
              </div>
              <div className="stat-row">Score: {formatMetric(allTimeStats?.score as MetricValue)}</div>
              <div className="stat-row">Bonus: {formatMetric(allTimeStats?.bonus as MetricValue)}</div>
            </div>
          </details>

          <details className="overview-details">
            <summary>Latest session snapshot</summary>
            <div className="overview-line">
              {latestRecent ? `Time: ${toDisplayTime(Number(latestRecent?.time))}` : 'No recent session data'}
            </div>
            <div className="stat-grid">
              <div className="stat-row">Points: {formatMetric(latestRecent?.points as MetricValue)}</div>
              <div className="stat-row">Opponent points: {formatMetric(latestRecent?.pointsAgainst as MetricValue)}</div>
              <div className="stat-row">Result: {getResult(latestRecent, panicDevEvent)}</div>
              <div className="stat-row">Shots: {formatMetric(latestRecent?.shots as MetricValue)}</div>
              <div className="stat-row">Hits: {formatMetric(latestRecent?.hits as MetricValue)}</div>
              <div className="stat-row">Precision: {getPrecision(latestRecent)}</div>
              <div className="stat-row">Damage: {formatMetric(latestRecent?.damage as MetricValue)}</div>
              <div className="stat-row">Damage / shot: {getDamagePerShot(latestRecent)}</div>
            </div>
          </details>

          {/* Graph Legend (Full Page View Only) */}
          {!isPopupView && <TimelineLegend />}
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px' }}>
          <button onClick={refreshState}>Refresh</button>
          <button className="secondary" onClick={handleExportJson}>
            Export JSON
          </button>
          <button className="secondary" onClick={handleStopSession}>
            Stop Session
          </button>
          <button className="dangerous" onClick={handleEmergencyStop}>
            Emergency Stop Session
          </button>
          {isPopupView && (
            <button className="secondary" onClick={handleOpenFullPage}>
              Open full viewer
            </button>
          )}
        </div>
      </div>

      {/* Sessions List Section */}
      {!isPopupView && (
        <div className="panel">
          <h2>Saved game sessions</h2>
          {rawSessions.length === 0 ? (
            <p>No sessions recorded yet.</p>
          ) : (
            <div>
              {visibleSessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onDelete={() => handleDeleteSession(session.id)}
                  onSwitchTeam={() => handleSwitchTeam(session.id)}
                />
              ))}

              {visibleSessionCount < reversedSessions.length && (
                <div className="load-more-container">
                  <button
                    className="primary"
                    onClick={() => setVisibleSessionCount((prev) => prev + 10)}
                  >
                    Load More Games ({reversedSessions.length - visibleSessionCount} remaining)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- SUB-COMPONENT: SESSION CARD ---

interface SessionCardProps {
  session: GameSession;
  onDelete: () => void;
  onSwitchTeam: () => void;
}

function SessionCard({ session, onDelete, onSwitchTeam }: SessionCardProps) {
  const recentStats = session.recentStatsAtEnd as Record<string, unknown> | undefined;
  const startTime = toDisplayTime(session.startedAt);
  const endTime = toDisplayTime(session.endedAt);
  const result = getSessionResult(session, recentStats);

  const resultClass =
    result === 'Won' ? 'win' : result === 'Lost' ? 'loss' : result === 'Tied' ? 'tie' : 'disconnect';

  const sessionName = (session.metadata?.dogflightName as string | undefined) ?? 'Unknown';
  const sessionUid = (session.metadata?.dogflightUid as string | undefined) ?? 'Unknown';
  const teamLabel = (session.metadata?.team as 'green' | 'red' | undefined) ?? 'green';
  const shotBursts = (session.metadata?.shotBursts as ShotBurst[] | undefined) ?? [];
  const gameBonuses = (session.metadata?.gameBonuses as GameBonusEntry[] | undefined) ?? [];
  const leftClicks = (session.metadata?.leftClicks as ClickEvent[] | undefined) ?? [];
  const selectedPlanes = session.selectedPlanes ?? [];
  const deathTimestamps = (session.metadata?.deathTimestamps as number[] | undefined) ?? [];
  const planesDisplay = toDisplayPlane(selectedPlanes);

  const guidedScouts = gameBonuses
    .filter((entry) => String(entry?.type ?? '').includes('scouts-guided'))
    .reduce((total, entry) => total + Number(entry.amount ?? 0) / 2000, 0);

  const guidedBombers = gameBonuses.filter((entry) => {
    const typeStr = String(entry?.type ?? '');
    return typeStr === 'bomber-guided' && typeStr.includes('guided');
  }).length;

  const bothBonusSummary = gameBonuses
    .filter((entry) => {
      const typeStr = String(entry?.type ?? '');
      return typeStr === 'game-bonus' || typeStr === 'performance-bonus';
    })
    .map((entry) => {
      const isGameBonus = String(entry?.type ?? '') === 'game-bonus';
      return `${isGameBonus ? 'Game bonus' : 'Performance bonus'} (${entry.amount ?? 'n/a'})`;
    });

  const devEvents =
    (session.metadata?.devEvents as Array<{
      timestamp: number;
      type: string;
      detectedBy: string;
      details?: string;
    }> | undefined) ?? [];

  return (
    <div className="session-card">
      <div>
        Time: {startTime} Result:{' '}
        <span className={`result-value ${resultClass}`}>{result}</span>
      </div>

      <details className="overview-details">
        <summary>Show game stats</summary>
        <div className="meta-group">
          <div className="meta">Name: {sessionName}</div>
          <div className="meta">UID: {sessionUid}</div>
          <div className="meta">Team: {teamLabel}</div>
        </div>
        <div className="meta-group">
          <div className="meta">Start: {startTime}</div>
          <div className="meta">End: {endTime || 'n/a'}</div>
          <div className="meta">Length: {recentStats?.time ? `${recentStats.time}` : 'n/a'}</div>
          <div className="meta">Time Saved: {formatMetric(recentStats?.timeSaved as MetricValue)}</div>
        </div>
        <div className="meta-group">
          <div className="meta">Your Team's Points: {formatMetric(recentStats?.points as MetricValue)}</div>
          <div className="meta">Opponent's Points: {formatMetric(recentStats?.pointsAgainst as MetricValue)}</div>
        </div>
        <div className="meta-group">
          <div className="meta">Shots: {formatMetric(recentStats?.shots as MetricValue)}</div>
          <div className="meta">Hits: {formatMetric(recentStats?.hits as MetricValue)}</div>
          <div className="meta">Precision: {getPrecision(recentStats)}</div>
        </div>
        <div className="meta-group">
          <div className="meta">Damage: {formatMetric(recentStats?.damage as MetricValue)}</div>
          <div className="meta">Damage / shot: {getDamagePerShot(recentStats)}</div>
        </div>
        <div className="meta-group">
          <div className="meta">Bomber Kills: {formatMetric(recentStats?.bombers as MetricValue)}</div>
          <div className="meta">Scout Kills: {formatMetric(recentStats?.scouts as MetricValue)}</div>
        </div>
        <div className="meta-group">
          <div className="meta">Player Kills: {formatMetric(recentStats?.kills as MetricValue)}</div>
          <div className="meta">Player Deaths: {formatMetric(recentStats?.deaths as MetricValue)}</div>
          <div className="meta">
            Kills - Deaths: {Number(recentStats?.kills ?? 0) - Number(recentStats?.deaths ?? 0)}
          </div>
        </div>
        <div className="meta-group">
          <div className="meta">Total Score: {formatMetric(recentStats?.score as MetricValue)}</div>
          <div className="meta">Bonus: {formatMetric(recentStats?.bonus as MetricValue)}</div>
        </div>
        <div className="meta-group">
          <div className="meta">Bombers guided: {guidedBombers}</div>
          <div className="meta">Scouts guided: {guidedScouts.toFixed(0)}</div>
        </div>
        <div className="meta-group">
          <div className="meta">
            {bothBonusSummary.length > 0
              ? bothBonusSummary.map((b, i) => <div key={i}>{b}</div>)
              : 'No bonus entries recorded.'}
          </div>
        </div>
      </details>

      <details>
        <summary>Shot bursts</summary>
        <pre>
          {shotBursts.length
            ? shotBursts
                .map((burst, burstIdx) => {
                  const eventsArr = burst?.events ?? [];
                  const events = eventsArr
                    .map((event) => `${toDisplayTime(event.timestamp)} :: ${String(event.type ?? 'unknown')}`)
                    .join('\n');
                  return `Burst ${burstIdx + 1} ${
                    burst.x !== undefined ? `(Coords.: ${burst.x}, ${burst.y})` : 'n/a'
                  }\n${events}`;
                })
                .join('\n\n')
            : 'No shot bursts recorded.'}
        </pre>
      </details>

      <details>
        <summary>Game bonuses</summary>
        <pre>
          {gameBonuses.length
            ? JSON.stringify(
                gameBonuses.map((bonus) => ({
                  timestamp: toDisplayTime(bonus.timestamp),
                  message: displayBonusMessage(bonus),
                  source: bonus.source,
                  amount: bonus.amount ?? 'n/a',
                })),
                null,
                2
              )
            : 'No game bonuses recorded.'}
        </pre>
      </details>

      <details>
        <summary>Left clicks</summary>
        <pre>
          {leftClicks.length
            ? JSON.stringify(
                leftClicks.map((click) => ({
                  timestamp: toDisplayTime(click.timestamp),
                  x: click.x,
                  y: click.y,
                  pageX: click.pageX,
                  pageY: click.pageY,
                })),
                null,
                2
              )
            : 'No left clicks recorded.'}
        </pre>
      </details>

      <details>
        <summary>Planes used</summary>
        <pre>
          {typeof planesDisplay === 'string' ? planesDisplay : JSON.stringify(planesDisplay, null, 2)}
        </pre>
      </details>

      <details>
        <summary>Deaths</summary>
        <pre>
          {deathTimestamps.length
            ? deathTimestamps.map((timestamp) => toDisplayTime(timestamp)).join('\n')
            : 'No deaths recorded.'}
        </pre>
      </details>

      <details>
        <summary>Dev mode</summary>
        <pre>
          {devEvents.length
            ? devEvents
                .map((event) => {
                  const time = toDisplayTime(event.timestamp);
                  const details = event.details ? ` (${event.details})` : '';
                  const eventType = String(event?.type ?? 'UNKNOWN').toUpperCase();
                  return `${eventType} @ ${time} via ${event.detectedBy}${details}`;
                })
                .join('\n')
            : 'No dev events recorded.'}
        </pre>
      </details>

      {/* NEW: Timeline Graph Dropdown */}
      <details style={{ marginTop: '10px' }}>
        <summary style={{ fontWeight: 'bold', color: '#60a5fa' }}>Timeline Graph</summary>
        <div style={{ marginTop: '8px' }}>
          <SessionTimelineChart session={session} />
        </div>
      </details>

      <div className="ending-buttons">
        <button className="secondary" onClick={onSwitchTeam}>
          Switch team
        </button>
        <button className="secondary" onClick={onDelete}>
          Delete game
        </button>
      </div>
    </div>
  );
}