"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { pivotEngagement, type EngagementPoint } from "@/lib/analytics";
import { postLimitsFor } from "@/lib/compose";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Stable per-platform stroke colors (falls back to a hash for unknowns). */
const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#d6249f",
  facebook: "#1877f2",
  threads: "#000000",
  linkedin: "#0a66c2",
  pinterest: "#e60023",
  tiktok: "#25f4ee",
  twitter: "#1d9bf0"
};

function colorFor(platform: string): string {
  return PLATFORM_COLORS[platform.toLowerCase()] ?? "#64748b";
}

export interface EngagementChartProps {
  points: EngagementPoint[];
  loading?: boolean;
}

/**
 * Multi-series engagement-over-time line chart (#97). One line per platform;
 * the flat server series is pivoted into per-day rows client-side so toggling
 * the platform filter never refetches.
 */
export function EngagementChart({ points, loading }: EngagementChartProps) {
  const { rows, platforms } = pivotEngagement(points);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Engagement over time</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading engagement…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground" role="status">
            No engagement recorded yet.
          </p>
        ) : (
          <div className="w-full" data-testid="engagement-chart">
            {/* Explicit numeric height (matches the former h-72 / 18rem box) so
                ResponsiveContainer always measures a positive box and never logs
                the width(-1)/height(-1) first-paint warning (issue #168). */}
            <ResponsiveContainer width="100%" height={288} minHeight={288}>
              <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="capturedFor" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                {platforms.map((platform) => (
                  <Line
                    key={platform}
                    type="monotone"
                    dataKey={platform}
                    name={postLimitsFor(platform).label}
                    stroke={colorFor(platform)}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
