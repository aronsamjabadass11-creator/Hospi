import type { FreshnessLevel, FreshnessResult } from './types.ts';

export interface FreshnessThresholds {
  greenMaxHours: number;
  yellowMaxHours: number;
}

export const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds = {
  greenMaxHours: 2,
  yellowMaxHours: 6,
};

export function formatRelativeTime(isoTimestamp: string | null | undefined, nowMs = Date.now()): string {
  if (!isoTimestamp) return 'No update recorded';
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) return 'Invalid timestamp';

  const diffMs = Math.max(0, nowMs - parsed);
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  const remMinutes = diffMinutes % 60;
  if (diffHours < 24) {
    return remMinutes > 0 ? `${diffHours}h ${remMinutes}m ago` : `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ${diffHours % 24}h ago`;
}

export function formatTimestamp(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return 'Unavailable';
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return 'Unavailable';
  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function evaluateFreshness(
  isoTimestamp: string | null | undefined,
  thresholds: FreshnessThresholds = DEFAULT_FRESHNESS_THRESHOLDS,
  nowMs = Date.now()
): FreshnessResult {
  if (!isoTimestamp) {
    return {
      level: 'UNKNOWN',
      label: 'Unknown',
      description: 'No resource update timestamp is available.',
      hoursAgo: null,
      relativeTime: 'No update recorded',
      requiresWarning: true,
    };
  }

  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) {
    return {
      level: 'UNKNOWN',
      label: 'Unknown',
      description: 'Resource timestamp could not be verified.',
      hoursAgo: null,
      relativeTime: 'Invalid timestamp',
      requiresWarning: true,
    };
  }

  const hoursAgo = Math.max(0, (nowMs - parsed) / (1000 * 60 * 60));
  const relativeTime = formatRelativeTime(isoTimestamp, nowMs);

  if (hoursAgo <= thresholds.greenMaxHours) {
    return {
      level: 'GREEN',
      label: 'Current',
      description: `Updated within the last ${thresholds.greenMaxHours} hours (prototype threshold).`,
      hoursAgo,
      relativeTime,
      requiresWarning: false,
    };
  }

  if (hoursAgo <= thresholds.yellowMaxHours) {
    return {
      level: 'YELLOW',
      label: 'Reverify',
      description: `Updated over ${thresholds.greenMaxHours} hours ago; confirm by phone before travel.`,
      hoursAgo,
      relativeTime,
      requiresWarning: true,
    };
  }

  return {
    level: 'RED',
    label: 'Outdated',
    description: `Last updated over ${thresholds.yellowMaxHours} hours ago; data may no longer reflect current beds.`,
    hoursAgo,
    relativeTime,
    requiresWarning: true,
  };
}

export function pickWorstOrLatestFreshness(levels: FreshnessLevel[]): FreshnessLevel {
  if (levels.length === 0) return 'UNKNOWN';
  if (levels.includes('GREEN')) return 'GREEN';
  if (levels.includes('YELLOW')) return 'YELLOW';
  if (levels.includes('RED')) return 'RED';
  return 'UNKNOWN';
}
