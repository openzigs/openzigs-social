import * as React from "react";

import { Button } from "@/components/ui/button";
import { PlatformBadge } from "@/components/inbox/platform-badge";
import type { ScoredContact, SuggestedMerge } from "@/lib/crm";

export interface SuggestedMergesProps {
  suggestions: SuggestedMerge[];
  onMerge: (survivorId: number, sourceId: number) => void;
  merging?: boolean;
  loading?: boolean;
  error?: string;
}

function contactName(contact: ScoredContact): string {
  if (contact.displayName) return contact.displayName;
  const handle = contact.linkedAccounts[0]?.handle;
  if (handle) return `@${handle}`;
  return contact.email ?? `Contact #${contact.id}`;
}

function platformsOf(contact: ScoredContact): string[] {
  return Array.from(new Set(contact.linkedAccounts.map((a) => a.platform)));
}

/**
 * Suggested-merge queue (#94): pairs of identities that share a normalised
 * email. The first contact is treated as the survivor; merging folds the
 * second into it. The merge endpoint validates the request server-side.
 */
export function SuggestedMerges({
  suggestions,
  onMerge,
  merging,
  loading,
  error
}: SuggestedMergesProps) {
  if (loading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading suggestions…</p>;
  }
  if (error) {
    return (
      <p className="p-4 text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }
  if (suggestions.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground" data-testid="no-suggestions">
        No suggested merges. Identities sharing an email will appear here.
      </p>
    );
  }

  return (
    <ul className="divide-y" data-testid="suggested-merges">
      {suggestions.map((suggestion, index) => {
        const [survivor, source] = suggestion.contacts;
        return (
          <li
            key={`${suggestion.email}-${survivor.id}-${source.id}-${index}`}
            className="flex flex-col gap-2 p-4"
          >
            <p className="text-sm text-muted-foreground">
              Shared email <span className="font-medium text-foreground">{suggestion.email}</span>
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 text-sm">
                {[survivor, source].map((contact) => (
                  <div key={contact.id} className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{contactName(contact)}</span>
                    {platformsOf(contact).map((platform) => (
                      <PlatformBadge key={platform} platform={platform} />
                    ))}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                disabled={merging}
                onClick={() => onMerge(survivor.id, source.id)}
              >
                Merge
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
