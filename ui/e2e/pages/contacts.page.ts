import type { Locator, Page, Route } from "@playwright/test";

import type {
  ContactDetail,
  GdprDeleteReceipt,
  ScoredContact,
  SuggestedMerge,
  TimelineMessage
} from "@/lib/crm";

export interface ContactsStubState {
  contacts: ScoredContact[];
  details: ContactDetail[];
  suggestions: SuggestedMerge[];
}

function envelope(body: Record<string, unknown>): string {
  return JSON.stringify({ timestamp: new Date().toISOString(), ...body });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sortTimeline(messages: TimelineMessage[]): TimelineMessage[] {
  return [...messages].sort((left, right) => {
    const leftTime = new Date(left.at).getTime();
    const rightTime = new Date(right.at).getTime();
    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.id - right.id;
  });
}

function contactFromDetail(contact: ContactDetail): ScoredContact {
  const { timeline: _timeline, ...scoredContact } = contact;
  return scoredContact;
}

function mergeDetails(survivor: ContactDetail, source: ContactDetail): ContactDetail {
  const linkedAccounts = [...survivor.linkedAccounts];
  for (const account of source.linkedAccounts) {
    if (
      linkedAccounts.some(
        (entry) =>
          entry.socialContactId === account.socialContactId &&
          entry.platformContactId === account.platformContactId
      )
    ) {
      continue;
    }
    linkedAccounts.push(account);
  }

  return {
    ...survivor,
    followerCount: Math.max(survivor.followerCount, source.followerCount),
    engagementCount: survivor.engagementCount + source.engagementCount,
    linkedAccounts,
    timeline: sortTimeline([...survivor.timeline, ...source.timeline]),
    updatedAt: new Date().toISOString()
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Page Object for the CRM contacts route (`/contacts`, epic #90). */
export class ContactsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly contactList: Locator;
  readonly detailRegion: Locator;
  readonly conversationHistory: Locator;
  readonly suggestedMergesHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Contacts", level: 1 });
    this.contactList = page.getByRole("list").first();
    this.detailRegion = page.getByRole("region", { name: "Conversation history" });
    this.conversationHistory = page.getByRole("region", { name: "Conversation history" });
    this.suggestedMergesHeading = page.getByRole("heading", { name: "Suggested merges" });
  }

  contact(name: string, bucket?: string): Locator {
    const suffix = bucket ? `[\\s\\S]*${escapeRegExp(bucket)}` : "";
    return this.page.getByRole("button", {
      name: new RegExp(`^${escapeRegExp(name)}${suffix}`)
    });
  }

  detailHeading(name: string): Locator {
    return this.page.getByRole("heading", { name, level: 2 });
  }

  timelineItems(): Locator {
    return this.conversationHistory.getByRole("listitem");
  }

  mergeButton(): Locator {
    return this.page.getByRole("button", { name: "Merge" });
  }

  suggestion(email: string): Locator {
    return this.page.getByRole("listitem").filter({ hasText: email });
  }

  async goto(): Promise<void> {
    await this.page.goto("/contacts");
  }

  async stubScenario(state: ContactsStubState): Promise<void> {
    const nextState = {
      contacts: clone(state.contacts),
      details: new Map(state.details.map((contact) => [contact.id, clone(contact)])),
      suggestions: clone(state.suggestions)
    };

    await this.page.route(/\/api\/contacts\/suggested-merges(?:\?.*)?$/, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({ suggestions: nextState.suggestions })
      })
    );

    await this.page.route(/\/api\/contacts\/merge$/, async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fulfill({
          status: 405,
          contentType: "application/json",
          body: JSON.stringify({ error: "method not allowed" })
        });
        return;
      }

      const payload = route.request().postDataJSON() as {
        survivorId?: number;
        sourceId?: number;
        mode?: "manual" | "suggested";
      };

      const survivorId = payload.survivorId;
      const sourceId = payload.sourceId;
      const survivor = survivorId !== undefined ? nextState.details.get(survivorId) : undefined;
      const source = sourceId !== undefined ? nextState.details.get(sourceId) : undefined;

      if (!survivor || !source) {
        await route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({ error: "invalid merge request" })
        });
        return;
      }

      const merged = mergeDetails(survivor, source);
      nextState.details.set(survivor.id, merged);
      nextState.details.delete(source.id);
      nextState.contacts = nextState.contacts
        .filter((contact) => contact.id !== source.id)
        .map((contact) => (contact.id === survivor.id ? contactFromDetail(merged) : contact));
      nextState.suggestions = nextState.suggestions.filter(
        (suggestion) => !suggestion.contacts.some((contact) => contact.id === source.id)
      );

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({ contact: merged, mode: payload.mode ?? "manual" })
      });
    });

    await this.page.route(/\/api\/contacts\/(\d+)(?:\?.*)?$/, (route: Route) => {
      const match = route
        .request()
        .url()
        .match(/\/api\/contacts\/(\d+)(?:\?.*)?$/);
      const id = match ? Number(match[1]) : Number.NaN;
      const contact = nextState.details.get(id);

      if (!contact) {
        void route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "contact not found" })
        });
        return;
      }

      void route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({ contact })
      });
    });

    await this.page.route(/\/api\/contacts(?:\?.*)?$/, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({ contacts: nextState.contacts })
      })
    );
  }

  // ─────────────────────── GDPR delete (#138) ───────────────────────────

  /** The "Delete" trigger button in the contact-detail header. */
  deleteButton(): Locator {
    return this.page.getByRole("button", { name: "Delete", exact: true });
  }

  /** The GDPR delete confirmation dialog. */
  deleteDialog(): Locator {
    return this.page.getByRole("dialog");
  }

  /** Dialog heading that includes the contact name. */
  deleteDialogTitle(name: string): Locator {
    return this.page.getByRole("heading", { name: `Delete ${name}?` });
  }

  /** "Cancel" button inside the delete dialog. */
  cancelDeleteButton(): Locator {
    return this.page.getByRole("button", { name: "Cancel" });
  }

  /** Confirm-delete button inside the dialog ("Delete contact"). */
  confirmDeleteButton(): Locator {
    return this.page.getByRole("button", { name: "Delete contact" });
  }

  /** "Delete this contact only" radio inside the cascade group. */
  deleteScopesSingle(): Locator {
    return this.page.getByTestId("delete-scope-single");
  }

  /** "Delete contact and all merged contacts" radio inside the cascade group. */
  deleteScopesCascade(): Locator {
    return this.page.getByTestId("delete-scope-cascade");
  }

  /** Inline error message shown inside the dialog on API failure. */
  deleteErrorMessage(): Locator {
    return this.page.getByTestId("delete-error");
  }

  /**
   * Registers a DELETE /api/contacts/:id stub.  Must be called **after**
   * `stubScenario` so that it takes precedence (Playwright routes are LIFO).
   * Non-DELETE requests for the same URL fall back to the `stubScenario` handler.
   */
  async stubDeleteContact(
    id: number,
    opts: { receipt?: GdprDeleteReceipt; statusCode?: number; error?: string } = {}
  ): Promise<void> {
    await this.page.route(new RegExp(`/api/contacts/${id}(?:\\?.*)?$`), async (route: Route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback();
        return;
      }
      const status = opts.statusCode ?? 200;
      if (status >= 400) {
        await route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ error: opts.error ?? "contact not found" })
        });
        return;
      }
      const receipt: GdprDeleteReceipt = opts.receipt ?? {
        deletedAt: new Date().toISOString(),
        contactId: String(id),
        rowsDeleted: {
          contacts: 1,
          social_messages: 5,
          auto_reply_audit: 2,
          platform_insights_raw: 3
        }
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ receipt })
      });
    });
  }
}
