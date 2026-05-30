"use client";

import * as React from "react";

import { useSocket } from "@/app/providers";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import {
  markThreadRead,
  useInboxThread,
  useInboxThreads,
  useSendReply,
  type InboxFilters,
  type ReplyKind
} from "@/lib/inbox";
import { InboxFiltersBar } from "./inbox-filters";
import { ThreadDetail } from "./thread-detail";
import { ThreadList } from "./thread-list";

/**
 * Unified inbox orchestration (#76/#77). Wires the filter bar, the live thread
 * list, and the thread detail + reply composer together. The list refetches on
 * `inbox:*` socket events; selecting a thread marks it read; replies are sent
 * through the server's reply endpoint (DMs via the #144 sender registry).
 */
export function InboxView() {
  const socket = useSocket();
  const { toast } = useToast();
  const [filters, setFilters] = React.useState<InboxFilters>({});
  const [selectedId, setSelectedId] = React.useState<number | null>(null);

  const threadsQuery = useInboxThreads(filters, socket);
  const threadQuery = useInboxThread(selectedId);
  const sendReply = useSendReply(selectedId);

  const handleSelect = (id: number): void => {
    setSelectedId(id);
    void markThreadRead(id).then(() => {
      if (socket) return; // socket event will refetch; otherwise refetch manually
      void threadsQuery.refetch();
    });
  };

  const handleReply = (body: string, kind: ReplyKind): void => {
    sendReply.mutate(
      { body, kind },
      {
        onSuccess: () => toast({ title: "Reply sent" }),
        onError: (err: unknown) =>
          toast({
            title: "Reply failed",
            description: err instanceof Error ? err.message : "Unknown error",
            variant: "destructive"
          })
      }
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Unified DMs and comments across every connected platform.
        </p>
      </div>

      <InboxFiltersBar filters={filters} onChange={setFilters} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Card className="overflow-hidden">
          <ThreadList
            threads={threadsQuery.data ?? []}
            selectedId={selectedId}
            onSelect={handleSelect}
            loading={threadsQuery.isLoading}
            error={threadsQuery.isError ? "Could not load conversations." : undefined}
          />
        </Card>
        <Card className="min-h-80 overflow-hidden">
          <ThreadDetail
            thread={threadQuery.data}
            loading={selectedId !== null && threadQuery.isLoading}
            error={threadQuery.isError ? "Could not load conversation." : undefined}
            onReply={handleReply}
            sending={sendReply.isPending}
            replyError={sendReply.isError ? "Reply failed." : undefined}
          />
        </Card>
      </div>
    </div>
  );
}
