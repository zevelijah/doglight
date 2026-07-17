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
  metadata?: Record<string, unknown>;
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
