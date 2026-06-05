"use client";

import * as React from "react";

import { useSocket } from "@/app/providers";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import {
  useContact,
  useContacts,
  useDeleteContact,
  useMergeContacts,
  useSuggestedMerges
} from "@/lib/crm";
import { ContactDetailView } from "./contact-detail";
import { ContactList } from "./contact-list";
import { SuggestedMerges } from "./suggested-merges";

/**
 * Light CRM orchestration (#93/#94). Wires the scored contact list, the contact
 * detail + conversation timeline, and the suggested-merge queue. The list and
 * suggestions refetch on the `crm:merge` socket event; manual merges fold a
 * source identity into a survivor through the server's merge endpoint.
 */
export function ContactsView() {
  const socket = useSocket();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = React.useState<number | null>(null);

  const contactsQuery = useContacts(socket);
  const contactQuery = useContact(selectedId);
  const suggestionsQuery = useSuggestedMerges();
  const mergeContacts = useMergeContacts();
  const deleteContactMutation = useDeleteContact();

  const handleMerge = (survivorId: number, sourceId: number): void => {
    mergeContacts.mutate(
      { survivorId, sourceId },
      {
        onSuccess: () => {
          toast({ title: "Contacts merged" });
          if (selectedId === sourceId) setSelectedId(survivorId);
        },
        onError: (err: unknown) =>
          toast({
            title: "Merge failed",
            description: err instanceof Error ? err.message : "Unknown error",
            variant: "destructive"
          })
      }
    );
  };

  const handleDelete = async (id: number, cascade: boolean): Promise<void> => {
    const receipt = await deleteContactMutation.mutateAsync({ id, cascade });
    toast({
      title: "Contact deleted",
      description: `Removed ${receipt.rowsDeleted.contacts} contact, ${receipt.rowsDeleted.social_messages} message(s), ${receipt.rowsDeleted.auto_reply_audit} audit row(s).`
    });
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
        <p className="text-sm text-muted-foreground">
          A lightweight CRM: lead scores, unified conversation history, and cross-platform identity
          merging.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Card className="overflow-hidden">
          <ContactList
            contacts={contactsQuery.data ?? []}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={contactsQuery.isLoading}
            error={contactsQuery.isError ? "Could not load contacts." : undefined}
          />
        </Card>
        <Card className="min-h-80 overflow-hidden">
          <ContactDetailView
            contact={contactQuery.data}
            loading={selectedId !== null && contactQuery.isLoading}
            error={contactQuery.isError ? "Could not load contact." : undefined}
            onDelete={handleDelete}
            deleting={deleteContactMutation.isPending}
          />
        </Card>
      </div>

      <Card>
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold">Suggested merges</h2>
          <p className="text-sm text-muted-foreground">
            Identities that share an email address — confirm to fold them into one.
          </p>
        </div>
        <SuggestedMerges
          suggestions={suggestionsQuery.data ?? []}
          onMerge={handleMerge}
          merging={mergeContacts.isPending}
          loading={suggestionsQuery.isLoading}
          error={suggestionsQuery.isError ? "Could not load suggestions." : undefined}
        />
      </Card>
    </div>
  );
}
