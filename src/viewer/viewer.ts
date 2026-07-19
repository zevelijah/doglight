import type { ExtensionState, GameSession, GameBonusEntry, ClickEvent, ShotBurst, ShotBurstEvent } from '../shared/types';

const STORAGE_KEY = 'doglight_state';

type MetricValue = number | undefined;

const isPopupView = new URLSearchParams(window.location.search).get('mode') === 'popup';

function formatStats(value: Record<string, unknown> | undefined) {
  if (!value) return 'None';
  return `${value.score ?? 'n/a'} / ${value.kills ?? 'n/a'} kills / ${value.games ?? 'n/a'} games`;
}

function toDisplayTime(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  return new Date(value).toLocaleString();
}

function formatMetric(value: MetricValue) {
  return typeof value === 'number' ? value.toString() : 'n/a';
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getResult(recentStats: Record<string, unknown> | undefined) {
  const points = Number(recentStats?.points ?? 0);
  const pointsAgainst = Number(recentStats?.pointsAgainst ?? 0);
  const time = Number(recentStats?.time ?? 0);
  const shots = Number(recentStats?.shots ?? 0);
  if (points !== 100 && pointsAgainst !== 100 && (time < 1198 || shots === 0)) return 'Disconnected';
  if (points === pointsAgainst) return 'Tied';
  if (points > pointsAgainst) return 'Won';
  if (points < pointsAgainst) return 'Lost';
}

function getSessionResult(session: GameSession, recentStats: Record<string, unknown> | undefined) {
  const result = getResult(recentStats);
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

function renderOverview(state: ExtensionState) {
  const container = document.getElementById('overviewContainer');
  if (!container) return;

  const openFullPageButton = document.getElementById('openFullPage');
  if (openFullPageButton) {
    openFullPageButton.hidden = !isPopupView;
  }

  const allTimeStats = state.latestStats as Record<string, unknown> | undefined;
  const latestRecent = state.latestRecentStats as Record<string, unknown> | undefined;
  const totalGames = Number(allTimeStats?.games ?? 0);

  const rankingFields = [
    ['Weekly High Score', allTimeStats?.weeklyHighScore],
    ['Monthly High Score', allTimeStats?.monthlyHighScore],
    ['All Time High Score', allTimeStats?.allTimeHighScore],
  ];
  const rankingText = rankingFields
    .filter(([, value]) => typeof value === 'number' && Number(value) !== -1)
    .map(([label, value]) => `${label}: ${value}`)
    .join('   ');

  container.innerHTML = `
    <details class="overview-details">
      <summary>Overall stats</summary>
      <div class="overview-line">${rankingText || 'No rankings yet'}     Games: ${totalGames}     Best: ${rankingText || 'n/a'}</div>
      <div class="stat-grid">
        <div class="stat-row">Shots: ${formatMetric(allTimeStats?.shots as MetricValue)}</div>
        <div class="stat-row">Hits: ${formatMetric(allTimeStats?.hits as MetricValue)}</div>
        <div class="stat-row">Precision: ${getPrecision(allTimeStats as Record<string, unknown> | undefined)}</div>
        <div class="stat-row">Damage: ${formatMetric(allTimeStats?.damage as MetricValue)}</div>
        <div class="stat-row">Damage / shot: ${getDamagePerShot(allTimeStats as Record<string, unknown> | undefined)}</div>
        <div class="stat-row">Bombers: ${formatMetric(allTimeStats?.bombers as MetricValue)}</div>
        <div class="stat-row">Scouts: ${formatMetric(allTimeStats?.scouts as MetricValue)}</div>
        <div class="stat-row">Kills: ${formatMetric(allTimeStats?.kills as MetricValue)}</div>
        <div class="stat-row">Deaths: ${formatMetric(allTimeStats?.deaths as MetricValue)}</div>
        <div class="stat-row">Kills - Deaths: ${formatMetric((Number(allTimeStats?.kills ?? 0) - Number(allTimeStats?.deaths ?? 0)) as MetricValue)}</div>
        <div class="stat-row">Score: ${formatMetric(allTimeStats?.score as MetricValue)}</div>
        <div class="stat-row">Bonus: ${formatMetric(allTimeStats?.bonus as MetricValue)}</div>
      </div>
    </details>
    <details class="overview-details">
      <summary>Latest session snapshot</summary>
      <div class="overview-line">${latestRecent ? `Time: ${toDisplayTime(Number(latestRecent?.time))}` : 'No recent session data'}</div>
      <div class="stat-grid">
        <div class="stat-row">Points: ${formatMetric(latestRecent?.points as MetricValue)}</div>
        <div class="stat-row">Opponent points: ${formatMetric(latestRecent?.pointsAgainst as MetricValue)}</div>
        <div class="stat-row">Result: ${getResult(latestRecent as Record<string, unknown> | undefined)}</div>
        <div class="stat-row">Shots: ${formatMetric(latestRecent?.shots as MetricValue)}</div>
        <div class="stat-row">Hits: ${formatMetric(latestRecent?.hits as MetricValue)}</div>
        <div class="stat-row">Precision: ${getPrecision(latestRecent as Record<string, unknown> | undefined)}</div>
        <div class="stat-row">Damage: ${formatMetric(latestRecent?.damage as MetricValue)}</div>
        <div class="stat-row">Damage / shot: ${getDamagePerShot(latestRecent as Record<string, unknown> | undefined)}</div>
      </div>
    </details>
  `;
}

async function loadState(): Promise<ExtensionState> {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return (result[STORAGE_KEY] ?? { sessions: [] }) as ExtensionState;
}

async function saveState(state: ExtensionState) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function render(state: ExtensionState) {
  const statsSummary = document.getElementById('statsSummary');
  const recentSummary = document.getElementById('recentSummary');
  const sessionSummary = document.getElementById('sessionSummary');
  const sessionsSection = document.getElementById('sessionsSection');
  const sessionsList = document.getElementById('sessionsList');

  if (statsSummary) statsSummary.textContent = formatStats(state.latestStats as Record<string, unknown> | undefined);
  if (recentSummary) recentSummary.textContent = formatStats(state.latestRecentStats as Record<string, unknown> | undefined);
  if (sessionSummary) {
    const current = state.currentSession as GameSession | undefined;
    sessionSummary.textContent = current ? `${current.status} (${current.clicks.length} clicks)` : 'None';
  }

  renderOverview(state);

  if (!sessionsSection || !sessionsList) return;
  if (isPopupView) {
    sessionsSection.hidden = true;
    sessionsList.innerHTML = 'Loading…';
    return;
  }

  sessionsSection.hidden = false;
  const sessions = state.sessions ?? [];
  if (!sessions.length) {
    sessionsList.innerHTML = '<p>No sessions recorded yet.</p>';
    return;
  }

  sessionsList.innerHTML = '';
  sessions.forEach((session) => {
    const card = document.createElement('div');
    card.className = 'session-card';

    const summary = document.createElement('div');
    const recentStats = session.recentStatsAtEnd as Record<string, unknown> | undefined;
    const startTime = toDisplayTime(session.startedAt);
    const endTime = toDisplayTime(session.endedAt);
    const result = getSessionResult(session, recentStats);
    const resultClass = result === 'Won' ? 'win' : result === 'Lost' ? 'loss' : result === 'Tied' ? 'tie' : 'disconnect';
    const sessionName = escapeHtml((session.metadata?.dogflightName as string | undefined) ?? 'Unknown');
    const sessionUid = escapeHtml((session.metadata?.dogflightUid as string | undefined) ?? 'Unknown');
    const teamLabel = escapeHtml((session.metadata?.team as 'green' | 'red' | undefined) ?? 'green');
    const shotBursts = (session.metadata?.shotBursts as ShotBurst[] | undefined) ?? [];
    const gameBonuses = (session.metadata?.gameBonuses as GameBonusEntry[] | undefined) ?? [];
    const leftClicks = (session.metadata?.leftClicks as ClickEvent[] | undefined) ?? [];
    const guidedScouts = gameBonuses.filter((entry) => entry.message.includes('scouts guided')).reduce((total, entry) => total + Number(entry.amount ?? 0) / 2000, 0);
    const guidedBombers = gameBonuses.filter((entry) => entry.message.includes('bomber') && entry.message.includes('guided')).length;
    const bonusSummary = gameBonuses.filter((entry) => entry.message.includes('game bonuses') || entry.message.includes('performance bonus')).map((entry) => `${escapeHtml(entry.message)} (${entry.amount ?? 'n/a'})`).join('<br/>');

    summary.innerHTML = `
      <div>Time: ${escapeHtml(startTime)}     Result: <span class="result-value ${resultClass}">${escapeHtml(result)}</span></div>
      <details class="overview-details">
        <summary>Show game stats</summary>
        <div class="meta-group">
          <div class="meta">Name: ${sessionName}</div>
          <div class="meta">UID: ${sessionUid}</div>
          <div class="meta">Team: ${teamLabel}</div>
        </div>
        <div class="meta-group">
          <div class="meta">Start: ${escapeHtml(startTime)}</div>
          <div class="meta">End: ${escapeHtml(endTime || 'n/a')}</div>
          <div class="meta">Length: ${escapeHtml(recentStats?.time ? `${recentStats.time}` : 'n/a')}</div>
          <div class="meta">Time Saved: ${escapeHtml(recentStats?.timeSaved ?? 'n/a')}</div>
        </div>
        <div class="meta-group">
          <div class="meta">Your Team's Points: ${escapeHtml(recentStats?.points ?? 'n/a')}</div>
          <div class="meta">Opponent's Points: ${escapeHtml(recentStats?.pointsAgainst ?? 'n/a')}</div>
        </div>
        <div class="meta-group">
          <div class="meta">Shots: ${escapeHtml(recentStats?.shots ?? 'n/a')}</div>
          <div class="meta">Hits: ${escapeHtml(recentStats?.hits ?? 'n/a')}</div>
          <div class="meta">Precision: ${escapeHtml(getPrecision(recentStats))}</div>
        </div>
        <div class="meta-group">
          <div class="meta">Damage: ${escapeHtml(recentStats?.damage ?? 'n/a')}</div>
          <div class="meta">Damage / shot: ${escapeHtml(getDamagePerShot(recentStats))}</div>
        </div>
        <div class="meta-group">
          <div class="meta">Bomber Kills: ${escapeHtml(recentStats?.bombers ?? 'n/a')}</div>
          <div class="meta">Scout Kills: ${escapeHtml(recentStats?.scouts ?? 'n/a')}</div>
        </div>
        <div class="meta-group">
          <div class="meta">Player Kills: ${escapeHtml(recentStats?.kills ?? 'n/a')}</div>
          <div class="meta">Player Deaths: ${escapeHtml(recentStats?.deaths ?? 'n/a')}</div>
          <div class="meta">Kills - Deaths: ${escapeHtml(Number(recentStats?.kills ?? 0) - Number(recentStats?.deaths ?? 0))}</div>
        </div>
        <div class="meta-group">
          <div class="meta">Total Score: ${escapeHtml(recentStats?.score ?? 'n/a')}</div>
          <div class="meta">Bonus: ${escapeHtml(recentStats?.bonus ?? 'n/a')}</div>
        </div>
        <div class="meta-group">
          <div class="meta">Bombers guided: ${escapeHtml(guidedBombers)}</div>
          <div class="meta">Scouts guided: ${escapeHtml(guidedScouts.toFixed(0))}</div>
        </div>
        <div class="meta-group">
          <div class="meta">Game bonuses earned</div>
          <div class="meta">${bonusSummary || 'No bonus entries recorded.'}</div>
        </div>
      </details>
    `;

    const details = document.createElement('details');
    const summaryEl = document.createElement('summary');
    summaryEl.textContent = 'Show click locations';
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(
      session.clicks.map((click) => ({
        button: click.button,
        x: click.x,
        y: click.y,
        rawPageX: click.pageX,
        rawPageY: click.pageY,
      })),
      null,
      2,
    );
    details.appendChild(summaryEl);
    details.appendChild(pre);

    const shotBurstDetails = document.createElement('details');
    const shotBurstSummary = document.createElement('summary');
    shotBurstSummary.textContent = 'Shot bursts';
    const shotBurstPre = document.createElement('pre');
    shotBurstPre.textContent = shotBursts.length
      ? shotBursts
          .map((burst, index) => {
            const events = burst.events.map((event) => `${toDisplayTime(event.timestamp)} :: ${event.type} :: ${event.message ?? 'n/a'}`).join('\n');
            return `Burst ${index + 1}\n${events}`;
          })
          .join('\n\n')
      : 'No shot bursts recorded.';
    shotBurstDetails.appendChild(shotBurstSummary);
    shotBurstDetails.appendChild(shotBurstPre);

    const leftClicksDetails = document.createElement('details');
    const leftClicksSummary = document.createElement('summary');
    leftClicksSummary.textContent = 'Left clicks';
    const leftClicksPre = document.createElement('pre');
    leftClicksPre.textContent = leftClicks.length
      ? JSON.stringify(
          leftClicks.map((click) => ({
            timestamp: toDisplayTime(click.timestamp),
            x: click.x,
            y: click.y,
            pageX: click.pageX,
            pageY: click.pageY,
          })),
          null,
          2,
        )
      : 'No left clicks recorded.';
    leftClicksDetails.appendChild(leftClicksSummary);
    leftClicksDetails.appendChild(leftClicksPre);

    const devDetails = document.createElement('details');
    const devSummary = document.createElement('summary');
    devSummary.textContent = 'Dev mode';
    const devPre = document.createElement('pre');
    const devEvents = (session.metadata?.devEvents as Array<{ timestamp: number; type: string; detectedBy: string; details?: string }> | undefined) ?? [];
    devPre.textContent = devEvents.length
      ? devEvents
          .map((event) => {
            const time = toDisplayTime(event.timestamp);
            const details = event.details ? ` (${event.details})` : '';
            return `${event.type.toUpperCase()} @ ${time} via ${event.detectedBy}${details}`;
          })
          .join('\n')
      : 'No dev events recorded.';
    devDetails.appendChild(devSummary);
    devDetails.appendChild(devPre);

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete game';
    deleteButton.className = 'secondary';
    deleteButton.addEventListener('click', () => void deleteSession(session.id));

    card.appendChild(summary);
    card.appendChild(details);
    card.appendChild(shotBurstDetails);
    card.appendChild(leftClicksDetails);
    card.appendChild(devDetails);
    card.appendChild(deleteButton);
    sessionsList.appendChild(card);
  });
}

async function refresh() {
  const state = await loadState();
  render(state);
}

async function deleteSession(id: string) {
  const state = await loadState();
  state.sessions = (state.sessions ?? []).filter((session) => session.id !== id);
  if (state.currentSession?.id === id) {
    state.currentSession = undefined;
  }
  await saveState(state);
  await refresh();
}

async function exportJson() {
  const state = await loadState();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename: 'doglight-export.json', saveAs: true });
}

async function openFullPage() {
  const url = chrome.runtime.getURL('src/viewer/viewer.html');
  await chrome.tabs.create({ url });
}

document.getElementById('refresh')?.addEventListener('click', () => void refresh());
document.getElementById('export')?.addEventListener('click', () => void exportJson());
document.getElementById('openFullPage')?.addEventListener('click', () => void openFullPage());
refresh();
