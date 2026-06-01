import * as React from "react";

import { cn } from "@/lib/utils";
import { bucketMetaFor, type ScoredContact } from "@/lib/crm";
import { PlatformBadge } from "@/components/inbox/platform-badge";

export interface ContactListProps {
  contacts: ScoredContact[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  loading?: boolean;
  error?: string;
}

function contactName(contact: ScoredContact): string {
  if (contact.displayName) return contact.displayName;
  const handle = contact.linkedAccounts[0]?.handle;
  if (handle) return `@${handle}`;
  return contact.email ?? `Contact #${contact.id}`;
}

/**
 * Scored contact list (#93). Each row surfaces the lead-score bucket badge and
 * the platforms the identity spans, so a human can triage at a glance.
 */
export function ContactList({ contacts, selectedId, onSelect, loading, error }: ContactListProps) {
  if (loading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading contacts…</p>;
  }
  if (error) {
    return (
      <p className="p-4 text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }
  if (contacts.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No contacts yet. They appear here as conversations arrive.
      </p>
    );
  }

  return (
    <ul className="divide-y" data-testid="contact-list">
      {contacts.map((contact) => {
        const bucket = bucketMetaFor(contact.leadScore.bucket);
        const platforms = Array.from(new Set(contact.linkedAccounts.map((a) => a.platform)));
        return (
          <li key={contact.id}>
            <button
              type="button"
              onClick={() => onSelect(contact.id)}
              aria-current={selectedId === contact.id}
              className={cn(
                "flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/60",
                selectedId === contact.id && "bg-muted"
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="truncate font-medium">{contactName(contact)}</span>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    bucket.className
                  )}
                  data-testid="lead-bucket"
                >
                  {bucket.label}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {platforms.map((platform) => (
                  <PlatformBadge key={platform} platform={platform} />
                ))}
                <span>{contact.engagementCount} eng / 7d</span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
