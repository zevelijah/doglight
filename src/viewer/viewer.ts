import type { ExtensionState, GameSession } from '../shared/types';

const STORAGE_KEY = 'doglight_state';

function formatStats(value: Record<string, unknown> | undefined) {
  if (!value) return 'None';
  return `${value.score ?? 'n/a'} / ${value.kills ?? 'n/a'} kills / ${value.games ?? 'n/a'} games`;
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
  const sessionsList = document.getElementById('sessionsList');

  if (statsSummary) statsSummary.textContent = formatStats(state.latestStats as Record<string, unknown> | undefined);
  if (recentSummary) recentSummary.textContent = formatStats(state.latestRecentStats as Record<string, unknown> | undefined);
  if (sessionSummary) {
    const current = state.currentSession as GameSession | undefined;
    sessionSummary.textContent = current ? `${current.status} (${current.clicks.length} clicks)` : 'None';
  }

  if (!sessionsList) return;
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
    summary.innerHTML = `
      <strong>${session.status.toUpperCase()} • ${new Date(session.startedAt).toLocaleString()}</strong>
      <div class="meta">Clicks: ${session.clicks.length} • Started: ${new Date(session.startedAt).toLocaleString()}</div>
      <div class="meta">Stats at start: ${session.statsAtStart ? JSON.stringify(session.statsAtStart) : 'n/a'}</div>
      <div class="meta">Recent stats at end: ${session.recentStatsAtEnd ? JSON.stringify(session.recentStatsAtEnd) : 'n/a'}</div>
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

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete game';
    deleteButton.className = 'secondary';
    deleteButton.addEventListener('click', () => void deleteSession(session.id));

    card.appendChild(summary);
    card.appendChild(details);
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
