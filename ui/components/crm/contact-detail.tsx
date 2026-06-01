import * as React from "react";

import { cn } from "@/lib/utils";
import { bucketMetaFor, type ContactDetail } from "@/lib/crm";
import { PlatformBadge } from "@/components/inbox/platform-badge";

export interface ContactDetailViewProps {
  contact?: ContactDetail;
  loading?: boolean;
  error?: string;
}

function formatTimestamp(value: string): string {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function contactName(contact: ContactDetail): string {
  if (contact.displayName) return contact.displayName;
  const handle = contact.linkedAccounts[0]?.handle;
  if (handle) return `@${handle}`;
  return contact.email ?? `Contact #${contact.id}`;
}

/**
 * Contact detail (#93): identity header with lead score, the linked
 * platform-native accounts, and the unified conversation timeline aggregated
 * chronologically across every linked account.
 */
export function ContactDetailView({ contact, loading, error }: ContactDetailViewProps) {
  if (loading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading contact…</p>;
  }
  if (error) {
    return (
      <p className="p-4 text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }
  if (!contact) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Select a contact to see their profile and conversation history.
      </p>
    );
  }

  const bucket = bucketMetaFor(contact.leadScore.bucket);

  return (
    <div className="flex h-full flex-col" data-testid="contact-detail">
      <header className="border-b p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-lg font-semibold">{contactName(contact)}</h2>
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
              bucket.className
            )}
            data-testid="lead-bucket"
          >
            {bucket.label} · {Math.round(contact.leadScore.score * 100)}
          </span>
        </div>
        {contact.email && <p className="mt-1 text-sm text-muted-foreground">{contact.email}</p>}
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <div className="flex gap-1">
            <dt>Followers</dt>
            <dd className="font-medium text-foreground">
              {contact.followerCount.toLocaleString()}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>Engagements (7d)</dt>
            <dd className="font-medium text-foreground">{contact.engagementCount}</dd>
          </div>
        </dl>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {contact.linkedAccounts.map((account) => (
            <span
              key={account.socialContactId}
              className="inline-flex items-center gap-1"
              data-testid="linked-account"
            >
              <PlatformBadge platform={account.platform} />
              {account.handle && (
                <span className="text-xs text-muted-foreground">@{account.handle}</span>
              )}
            </span>
          ))}
        </div>
      </header>

      <section className="flex-1 overflow-y-auto p-4" aria-label="Conversation history">
        <h3 className="mb-2 text-sm font-medium">Conversation history</h3>
        {contact.timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <ol className="space-y-3" data-testid="timeline">
            {contact.timeline.map((message) => {
              const outbound = message.direction === "outbound";
              return (
                <li
                  key={message.id}
                  className={cn("flex flex-col", outbound ? "items-end" : "items-start")}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                      outbound ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}
                  >
                    {message.body}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <PlatformBadge platform={message.platform} />
                    <time dateTime={message.at}>{formatTimestamp(message.at)}</time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
