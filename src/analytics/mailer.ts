/**
 * Optional SMTP delivery for the weekly digest (epic #95, sub-issue #99).
 *
 * Thin nodemailer wrapper. The whole point is *optionality*: if the operator
 * never configured SMTP, {@link createMailer} returns `null` and the digest
 * goes out over Telegram alone — no transport is created, no connection is
 * attempted, nothing throws. Email is a bonus, not a hard dependency.
 *
 * The SMTP password (when auth is used) is passed in from the encrypted vault
 * by the caller; it is never read from plaintext config.
 */
import nodemailer from "nodemailer";

export interface SmtpSettings {
  enabled: boolean;
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  from?: string;
  to?: string;
}

export interface Mailer {
  send(subject: string, markdown: string): Promise<void>;
}

/** A transport shape compatible with nodemailer's `sendMail` (for testing). */
export interface MailTransport {
  sendMail(message: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
}

export interface CreateMailerDeps {
  settings: SmtpSettings;
  /** SMTP auth password from the vault (omit for unauthenticated relays). */
  password?: string;
  /** Injectable transport factory (tests pass a fake). */
  createTransport?: (opts: {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
  }) => MailTransport;
}

function isConfigured(
  s: SmtpSettings
): s is SmtpSettings & { host: string; from: string; to: string } {
  return s.enabled && Boolean(s.host) && Boolean(s.from) && Boolean(s.to);
}

/**
 * Build a {@link Mailer}, or `null` when SMTP is not fully configured (so the
 * caller can skip email delivery gracefully).
 */
export function createMailer(deps: CreateMailerDeps): Mailer | null {
  const { settings } = deps;
  if (!isConfigured(settings)) return null;

  const factory =
    deps.createTransport ??
    ((opts) => nodemailer.createTransport(opts) as unknown as MailTransport);

  const transport = factory({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    ...(settings.user && deps.password
      ? { auth: { user: settings.user, pass: deps.password } }
      : {})
  });

  return {
    async send(subject, markdown): Promise<void> {
      await transport.sendMail({
        from: settings.from,
        to: settings.to,
        subject,
        text: markdown
      });
    }
  };
}
