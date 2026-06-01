"use client";

import { dayLabel, type HeatmapResponse } from "@/lib/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface HeatmapGridProps {
  data: HeatmapResponse | undefined;
  loading?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DAYS = Array.from({ length: 7 }, (_, d) => d);

/** Map a normalised intensity [0,1] to a Tailwind background class. */
function intensityClass(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "bg-muted";
  const ratio = value / max;
  if (ratio > 0.75) return "bg-primary";
  if (ratio > 0.5) return "bg-primary/70";
  if (ratio > 0.25) return "bg-primary/45";
  return "bg-primary/20";
}

/**
 * Posting-time heatmap (#98): a 7×24 day-of-week × hour-of-day grid where cell
 * shade encodes how many posts went out in that slot. The dense matrix is built
 * server-side; here we just paint it and surface the busiest slot.
 */
export function HeatmapGrid({ data, loading }: HeatmapGridProps) {
  const matrix = data?.matrix ?? [];
  const max = matrix.reduce((m, row) => Math.max(m, ...row), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Posting-time heatmap</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading heatmap…</p>
        ) : max === 0 ? (
          <p className="text-sm text-muted-foreground" role="status">
            No posts published yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-0.5" data-testid="heatmap-grid">
              <thead>
                <tr>
                  <th className="w-10" aria-hidden />
                  {HOURS.map((h) => (
                    <th
                      key={h}
                      className="px-0.5 text-center text-[10px] font-normal text-muted-foreground"
                    >
                      {h % 3 === 0 ? h : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((d) => (
                  <tr key={d}>
                    <th
                      scope="row"
                      className="pr-1 text-right text-xs font-normal text-muted-foreground"
                    >
                      {dayLabel(d)}
                    </th>
                    {HOURS.map((h) => {
                      const value = matrix[d]?.[h] ?? 0;
                      return (
                        <td
                          key={h}
                          className={cn("h-5 w-5 rounded-sm", intensityClass(value, max))}
                          title={`${dayLabel(d)} ${h}:00 — ${value} post(s)`}
                          aria-label={`${dayLabel(d)} ${h}:00, ${value} posts`}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
