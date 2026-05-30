"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLATFORM_LIMITS, type InboxFilters } from "@/lib/inbox";

export interface InboxFiltersBarProps {
  filters: InboxFilters;
  onChange: (next: InboxFilters) => void;
}

const PLATFORM_OPTIONS = Object.entries(PLATFORM_LIMITS).map(([value, meta]) => ({
  value,
  label: meta.label
}));

/**
 * Filter controls for the unified inbox (#77): a platform/account selector and
 * a full-text search box that drive the thread-list query parameters.
 */
export function InboxFiltersBar({ filters, onChange }: InboxFiltersBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1">
        <Label htmlFor="inbox-platform">Platform</Label>
        <select
          id="inbox-platform"
          aria-label="Filter by platform"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-48"
          value={filters.platform ?? ""}
          onChange={(e) => onChange({ ...filters, platform: e.target.value || undefined })}
        >
          <option value="">All platforms</option>
          {PLATFORM_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor="inbox-search">Search</Label>
        <Input
          id="inbox-search"
          type="search"
          aria-label="Search messages"
          placeholder="Search messages…"
          value={filters.search ?? ""}
          onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}
