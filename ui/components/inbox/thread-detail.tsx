"use client";

import * as React from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { InboxMessage, InboxThreadDetail, ReplyKind } from "@/lib/inbox";
import { limitsFor } from "@/lib/inbox";
import { PlatformBadge } from "./platform-badge";
import { ReplyComposer } from "./reply-composer";

/** Caption shown in place of the DM section for comments-only platforms. */
export const LINKEDIN_DM_NOTICE =
  "LinkedIn DMs require the Compliance Partner Program — not supported in v1.";

/** Resolve the DM-unsupported caption for a comments-only platform. */
export function dmUnsupportedNotice(platform: string): string {
  if (platform.toLowerCase() === "linkedin") return LINKEDIN_DM_NOTICE;
  return `Direct messages aren't supported for ${limitsFor(platform).label} in v1.`;
}

export interface ThreadDetailProps {
  thread?: InboxThreadDetail;
  loading?: boolean;
  error?: string;
  onReply: (body: string, kind: ReplyKind) => void;
  sending?: boolean;
  replyError?: string;
}

function MessageBubble({ message }: { message: InboxMessage }) {
  const outbound = message.direction === "outbound";
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm",
          outbound ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {message.body}
      </div>
    </div>
  );
}

function MessageList({ messages, empty }: { messages: InboxMessage[]; empty: string }) {
  if (messages.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="flex flex-col gap-2 py-2">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
    </div>
  );
}

/**
 * Single-thread view (#76). Splits the conversation into Direct Messages and
 * Comments. For comments-only platforms (e.g. LinkedIn) the DM section is
 * hidden entirely and a caption explains why — the reply composer then targets
 * comments only.
 */
export function ThreadDetail({
  thread,
  loading,
  error,
  onReply,
  sending,
  replyError
}: ThreadDetailProps) {
  if (loading) {
    return (
      <p role="status" className="p-4 text-sm text-muted-foreground">
        Loading conversation…
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert" className="p-4 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!thread) {
    return (
      <p role="status" className="p-4 text-sm text-muted-foreground">
        Select a conversation to read it.
      </p>
    );
  }

  const name =
    thread.contact?.displayName ?? thread.contact?.handle ?? thread.subject ?? "Conversation";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <PlatformBadge platform={thread.platform} />
        <h2 className="truncate text-base font-semibold">{name}</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-4">
        {thread.dmSupported ? (
          <DmAndCommentTabs
            thread={thread}
            onReply={onReply}
            sending={sending}
            replyError={replyError}
          />
        ) : (
          <CommentsOnly
            thread={thread}
            onReply={onReply}
            sending={sending}
            replyError={replyError}
          />
        )}
      </div>
    </div>
  );
}

function DmAndCommentTabs({
  thread,
  onReply,
  sending,
  replyError
}: {
  thread: InboxThreadDetail;
  onReply: (body: string, kind: ReplyKind) => void;
  sending?: boolean;
  replyError?: string;
}) {
  const [tab, setTab] = React.useState<ReplyKind>("dm");
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as ReplyKind)} className="py-3">
      <TabsList>
        <TabsTrigger value="dm">Direct Messages</TabsTrigger>
        <TabsTrigger value="comment">Comments</TabsTrigger>
      </TabsList>
      <TabsContent value="dm">
        <MessageList messages={thread.dms} empty="No direct messages yet." />
      </TabsContent>
      <TabsContent value="comment">
        <MessageList messages={thread.comments} empty="No comments yet." />
      </TabsContent>
      <div className="border-t border-border pt-3">
        <ReplyComposer
          platform={thread.platform}
          kind={tab}
          onSend={(body) => onReply(body, tab)}
          sending={sending}
          error={replyError}
        />
      </div>
    </Tabs>
  );
}

function CommentsOnly({
  thread,
  onReply,
  sending,
  replyError
}: {
  thread: InboxThreadDetail;
  onReply: (body: string, kind: ReplyKind) => void;
  sending?: boolean;
  replyError?: string;
}) {
  return (
    <div className="py-3">
      <p
        role="note"
        data-testid="dm-unsupported-notice"
        className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground"
      >
        {dmUnsupportedNotice(thread.platform)}
      </p>
      <h3 className="text-sm font-medium">Comments</h3>
      <MessageList messages={thread.comments} empty="No comments yet." />
      <div className="border-t border-border pt-3">
        <ReplyComposer
          platform={thread.platform}
          kind="comment"
          onSend={(body) => onReply(body, "comment")}
          sending={sending}
          error={replyError}
        />
      </div>
    </div>
  );
}
