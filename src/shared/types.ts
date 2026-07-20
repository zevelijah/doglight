export interface DogflightStats {
  shots?: number;
  hits?: number;
  damage?: number;
  kills?: number;
  bombers?: number;
  scouts?: number;
  score?: number;
  points?: number;
  pointsAgainst?: number;
  time?: number;
  timeSaved?: number;
  bonus?: number;
  games?: number;
  deaths?: number;
  weeklyHighScore?: number;
  monthlyHighScore?: number;
  allTimeHighScore?: number;
}

export interface ClickEvent {
  id: string;
  timestamp: number;
  button: 'left' | 'right';
  x: number;
  y: number;
  pageX: number;
  pageY: number;
}

export interface SessionDevEvent {
  timestamp: number;
  type: 'connect' | 'disconnect' | 'non-disconnect';
  detectedBy: 'message' | 'listener' | 'game-count-change';
  details?: string;
}

export interface ShotBurstEvent {
  id: string;
  timestamp: number;
  type: 'right-click' | 'shots-increase' | 'hits-increase' | 'bomber-kill' | 'scout-kill' | 'player-kill';
  message?: string;
}

export interface ShotBurst {
  id: string;
  startedAt: number;
  endedAt?: number;
  startedShots?: number;
  startedHits?: number;
  x?: number;
  y?: number;
  pageX?: number;
  pageY?: number;
  events: ShotBurstEvent[];
}

export interface GameBonusEntry {
  id: string;
  timestamp: number;
  message: string;
  source: 'live' | 'finalization';
  amount?: number;
}

export interface GameSession {
  id: string;
  startedAt: number;
  endedAt?: number;
  status: 'active' | 'ended';
  statsAtStart?: DogflightStats;
  statsAtEnd?: DogflightStats;
  recentStatsAtStart?: DogflightStats;
  recentStatsAtEnd?: DogflightStats;
  clicks: ClickEvent[];
  metadata?: Record<string, unknown> & {
    devEvents?: SessionDevEvent[];
    shotBursts?: ShotBurst[];
    gameBonuses?: GameBonusEntry[];
    leftClicks?: ClickEvent[];
    team?: 'green' | 'red';
    lastTrackedBonus?: number;
  };
}

export interface ExtensionState {
  currentSession?: GameSession;
  sessions: GameSession[];
  latestStats?: DogflightStats;
  latestRecentStats?: DogflightStats;
  latestName?: string;
  latestUid?: string;
  lastUpdated?: number;
}
