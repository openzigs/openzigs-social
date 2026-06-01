"use client";

import { formatCompact, type TopPost } from "@/lib/analytics";
import { postLimitsFor } from "@/lib/compose";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface TopPostsListProps {
  posts: TopPost[];
  loading?: boolean;
}

function fmtTime(epoch: number | null): string {
  return epoch ? new Date(epoch).toLocaleDateString() : "—";
}

/**
 * Top posts per platform (#97): the highest-engagement posts in the selected
 * window, ranked. Grouped by platform so each network's leaderboard reads on
 * its own.
 */
export function TopPostsList({ posts, loading }: TopPostsListProps) {
  const byPlatform = new Map<string, TopPost[]>();
  for (const post of posts) {
    const list = byPlatform.get(post.platform) ?? [];
    list.push(post);
    byPlatform.set(post.platform, list);
  }
  const platforms = [...byPlatform.keys()].sort();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top posts</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading top posts…</p>
        ) : platforms.length === 0 ? (
          <p className="text-sm text-muted-foreground" role="status">
            No engagement to rank yet.
          </p>
        ) : (
          <div className="space-y-4">
            {platforms.map((platform) => (
              <div key={platform} data-testid={`top-posts-${platform}`}>
                <h3 className="mb-1 text-sm font-medium">{postLimitsFor(platform).label}</h3>
                <ol className="space-y-1">
                  {byPlatform
                    .get(platform)!
                    .sort((a, b) => a.rank - b.rank)
                    .map((post) => (
                      <li
                        key={post.externalId}
                        className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                            #{post.rank}
                          </span>
                          <span className="truncate">{post.externalId}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                          <span className="font-medium tabular-nums text-foreground">
                            {formatCompact(post.engagement)}
                          </span>
                          <span>{fmtTime(post.publishedAt)}</span>
                        </span>
                      </li>
                    ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
