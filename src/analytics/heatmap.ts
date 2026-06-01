/**
 * Pure posting-time heatmap bucketing (epic #95, sub-issue #98).
 *
 * Buckets published posts into a 7×24 day-of-week × hour-of-day grid in a
 * configured IANA timezone. Timezone handling is done via `Intl.DateTimeFormat`
 * (the only correct way — rolling your own offset maths is how you end up an
 * hour wrong twice a year), and the day-of-week is derived from the *local*
 * calendar date so a post at 23:30 never leaks into the wrong day.
 */
import type { HeatmapBucket, PublishedPost } from "./types.js";

const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;

/** Throws a descriptive error if `timezone` is not a valid IANA zone. */
function assertValidTimeZone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new RangeError(`invalid analytics timezone: ${timezone}`);
  }
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
}

function localParts(epochMs: number, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit"
  }).formatToParts(new Date(epochMs));

  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  // Some engines render midnight as hour "24"; normalise to 0.
  const hour = get("hour") % HOURS_PER_DAY;
  return { year: get("year"), month: get("month"), day: get("day"), hour };
}

/** Day-of-week (0 = Sunday) for a post's *local* calendar date in `timezone`. */
export function localDayOfWeek(epochMs: number, timezone: string): number {
  const { year, month, day } = localParts(epochMs, timezone);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Local hour-of-day (0..23) for a post in `timezone`. */
export function localHourOfDay(epochMs: number, timezone: string): number {
  return localParts(epochMs, timezone).hour;
}

export interface HeatmapInput {
  posts: readonly PublishedPost[];
  timezone: string;
  /** When set, only bucket posts for this platform. */
  platform?: string;
}

/**
 * Bucket published posts into per-(platform, dayOfWeek, hourOfDay) counts.
 * Only non-empty buckets are returned, deterministically ordered. Posts with a
 * non-finite `publishedAt` are skipped (they have no place on the clock).
 */
export function bucketPublishTimes(input: HeatmapInput): HeatmapBucket[] {
  assertValidTimeZone(input.timezone);
  const counts = new Map<string, HeatmapBucket>();

  for (const post of input.posts) {
    if (input.platform !== undefined && post.platform !== input.platform) continue;
    if (!Number.isFinite(post.publishedAt)) continue;
    const dayOfWeek = localDayOfWeek(post.publishedAt, input.timezone);
    const hourOfDay = localHourOfDay(post.publishedAt, input.timezone);
    const key = `${post.platform}\u0000${dayOfWeek}\u0000${hourOfDay}`;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { platform: post.platform, dayOfWeek, hourOfDay, count: 1 });
  }

  return [...counts.values()].sort(
    (a, b) =>
      a.platform.localeCompare(b.platform) || a.dayOfWeek - b.dayOfWeek || a.hourOfDay - b.hourOfDay
  );
}

/**
 * Expand sparse buckets into a dense 7×24 matrix (`matrix[day][hour] = count`),
 * summing across platforms. Handy for the dashboard grid which always renders
 * every cell.
 */
export function toHeatmapMatrix(buckets: readonly HeatmapBucket[]): number[][] {
  const matrix: number[][] = Array.from({ length: DAYS_PER_WEEK }, () =>
    new Array<number>(HOURS_PER_DAY).fill(0)
  );
  for (const bucket of buckets) {
    if (bucket.dayOfWeek < 0 || bucket.dayOfWeek >= DAYS_PER_WEEK) continue;
    if (bucket.hourOfDay < 0 || bucket.hourOfDay >= HOURS_PER_DAY) continue;
    matrix[bucket.dayOfWeek]![bucket.hourOfDay]! += bucket.count;
  }
  return matrix;
}
