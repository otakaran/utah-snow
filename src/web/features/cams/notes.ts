// The words a cam tile shows when live video stops or needs a tap (spec §8.3). One place so tiles and players agree.
export const NOTE = {
  idle: 'Paused to save data – tap to resume',
  liveFailed: 'Live unavailable – tap to retry',
  unsupported: 'Live video does not play in this browser',
  ytError: 'Stream restarting',
  ytUnknown: 'Status unknown – tap to try',
  tapToLoad: 'Tap to load',
} as const;
