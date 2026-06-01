/**
 * Auto-reply pipeline (epic #78, #80, #81, #82).
 *
 * Ties the brand-voice Linguistic Profiler (#79), the Hybrid-posture routing
 * decision (#81), and the SQLite audit trail (#82) into one orchestrator:
 *
 *   evaluate(request)
 *     1. score the draft against the workspace rulebook   → VoiceScore (#79)
 *     2. decide auto_send vs queue from the two scores     → RoutingDecision (#81)
 *     3. record the decision (prompt, draft, scores, route)→ audit row (#82)
 *     4a. auto_send (and posture enabled)  → send now, finalise `sent`
 *     4b. otherwise                        → leave `pending` for human approval
 *
 * Approval is **non-blocking**: a queued draft is persisted `pending` and
 * returned immediately so the HTTP request never hangs. When a human acts, the
 * caller invokes `resolve(auditId, …)` which sends the (optionally edited) text
 * and finalises the audit row — recording `human_override` when the text was
 * edited. The Hybrid master switch (`enabled`) forces every draft into the queue
 * when off, no matter how high it scores.
 *
 * All collaborators are injected so the orchestration is unit-testable without a
 * live model or connector.
 */
import { scoreVoice } from "../personality/profiler.js";
import type { BrandVoiceRepository } from "../personality/rulebook-repository.js";
import type { VoiceScore } from "../personality/types.js";
import { type AutoReplyAudit, type AutoReplyAuditRepository } from "./audit-repository.js";
import { decideRouting } from "./decision.js";
import type { RoutingDecision, RoutingThresholds } from "./types.js";

/** Context handed to the injected `send` function. */
export interface AutoReplyContext {
  threadId: string;
  contactId?: string;
  platform: string;
  prompt: string;
}

/** A draft to evaluate. */
export interface AutoReplyRequest {
  threadId: string;
  contactId?: string;
  platform?: string;
  /** The incoming message the draft replies to. */
  prompt: string;
  /** The model-generated draft text. */
  draft: string;
  /** Model confidence in [0,1] for this draft. */
  confidence: number;
  /** Optional model identifier that produced the draft. */
  model?: string;
}

/** Outcome of resolving a queued draft. */
export interface AutoReplyResolveInput {
  /** True to approve & send, false to reject. */
  approve: boolean;
  /** Edited reply text. When it differs from the draft, `human_override` is set. */
  editedText?: string;
}

/** The result of evaluating a draft. */
export interface AutoReplyResult {
  /** The persisted audit row. */
  audit: AutoReplyAudit;
  /** The routing verdict. */
  decision: RoutingDecision;
  /** The brand-voice score. */
  voice: VoiceScore;
  /** `sent` (auto-sent now) or `queued` (awaiting human approval). */
  status: "sent" | "queued";
}

/** Dependencies for {@link AutoReplyPipeline}. */
export interface AutoReplyPipelineDeps {
  rulebook: BrandVoiceRepository;
  audit: AutoReplyAuditRepository;
  /** Read fresh each call so a live config reload is honoured. */
  thresholds: () => RoutingThresholds;
  /** Hybrid master switch — when false every draft is queued. */
  enabled: () => boolean;
  /** Deliver the (final) reply text. May be async; throwing aborts the send. */
  send: (text: string, ctx: AutoReplyContext) => Promise<void> | void;
  /** Optional event sink for UI/socket updates. */
  emit?: (event: string, payload: unknown) => void;
}

/** Thrown when resolving an audit row that cannot be acted on. */
export class AutoReplyResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutoReplyResolveError";
  }
}

export class AutoReplyPipeline {
  private readonly deps: AutoReplyPipelineDeps;

  constructor(deps: AutoReplyPipelineDeps) {
    this.deps = deps;
  }

  /** Score, route, audit, and (when posture allows) auto-send a draft. */
  async evaluate(request: AutoReplyRequest): Promise<AutoReplyResult> {
    const rulebook = this.deps.rulebook.get();
    const voice = scoreVoice(request.draft, rulebook);
    const thresholds = this.deps.thresholds();
    const decision = decideRouting(
      { confidence: request.confidence, voiceMatch: voice.score },
      thresholds
    );

    const posturePermitsSend = this.deps.enabled() && decision.autoSend;
    const context: AutoReplyContext = {
      threadId: request.threadId,
      platform: request.platform ?? "",
      prompt: request.prompt,
      ...(request.contactId !== undefined ? { contactId: request.contactId } : {})
    };

    let audit = this.deps.audit.record({
      threadId: request.threadId,
      platform: request.platform ?? "",
      prompt: request.prompt,
      draftText: request.draft,
      confidence: request.confidence,
      voiceMatch: voice.score,
      toneMatch: voice.toneMatch,
      bannedHits: voice.bannedHits,
      decision: decision.action,
      ...(request.contactId !== undefined ? { contactId: request.contactId } : {}),
      ...(request.model !== undefined ? { model: request.model } : {})
    });

    if (posturePermitsSend) {
      await this.deps.send(request.draft, context);
      audit = this.deps.audit.finalize(audit.id, {
        outcome: "sent",
        finalText: request.draft
      });
      this.deps.emit?.("autoReply:sent", audit);
      return { audit, decision, voice, status: "sent" };
    }

    this.deps.emit?.("autoReply:queued", audit);
    return { audit, decision, voice, status: "queued" };
  }

  /** Resolve a queued (pending) draft from a human decision. */
  async resolve(auditId: number, input: AutoReplyResolveInput): Promise<AutoReplyAudit> {
    const existing = this.deps.audit.get(auditId);
    if (!existing) {
      throw new AutoReplyResolveError(`auto-reply audit row ${auditId} not found`);
    }
    if (existing.outcome !== "pending") {
      throw new AutoReplyResolveError(
        `auto-reply audit row ${auditId} already resolved (${existing.outcome})`
      );
    }

    if (!input.approve) {
      const audit = this.deps.audit.finalize(auditId, { outcome: "rejected" });
      this.deps.emit?.("autoReply:rejected", audit);
      return audit;
    }

    const finalText = input.editedText ?? existing.draftText;
    const humanOverride = finalText !== existing.draftText;
    await this.deps.send(finalText, {
      threadId: existing.threadId,
      platform: existing.platform,
      prompt: existing.prompt,
      ...(existing.contactId !== undefined ? { contactId: existing.contactId } : {})
    });
    const audit = this.deps.audit.finalize(auditId, {
      outcome: "sent",
      finalText,
      humanOverride
    });
    this.deps.emit?.("autoReply:sent", audit);
    return audit;
  }
}
