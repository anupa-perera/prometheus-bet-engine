export const EXTERNAL_URLS = {
  OPENROUTER_API: 'https://openrouter.ai/api/v1/chat/completions',
  APP_URL: 'https://betting-engine.local', // Used for OpenRouter Referer
  FLASHSCORE_BASE: 'https://www.flashscore.com/',
};

export const EVENT_STATUS = {
  SCHEDULED: 'SCHEDULED',
  IN_PLAY: 'IN_PLAY',
  FINISHED: 'FINISHED',
} as const;

export const MARKET_STATUS = {
  OPEN: 'OPEN',
  LOCKED: 'LOCKED',
  RESULTED: 'RESULTED',
} as const;
