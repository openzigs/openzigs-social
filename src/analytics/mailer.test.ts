import { describe, expect, it, vi } from "vitest";

import { createMailer, type MailTransport, type SmtpSettings } from "./mailer.js";

function settings(overrides: Partial<SmtpSettings> = {}): SmtpSettings {
  return {
    enabled: true,
    host: "smtp.example.com",
    port: 587,
    secure: false,
    from: "bot@example.com",
    to: "owner@example.com",
    ...overrides
  };
}

describe("createMailer", () => {
  it("returns null when SMTP is disabled or incomplete", () => {
    expect(createMailer({ settings: settings({ enabled: false }) })).toBeNull();
    expect(createMailer({ settings: settings({ host: undefined }) })).toBeNull();
    expect(createMailer({ settings: settings({ from: undefined }) })).toBeNull();
    expect(createMailer({ settings: settings({ to: undefined }) })).toBeNull();
  });

  it("builds a mailer that sends through the injected transport", async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const transport: MailTransport = { sendMail };
    const createTransport = vi.fn().mockReturnValue(transport);

    const mailer = createMailer({ settings: settings(), createTransport });
    expect(mailer).not.toBeNull();
    await mailer!.send("Subject", "# Body");

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.example.com", port: 587, secure: false })
    );
    expect(sendMail).toHaveBeenCalledWith({
      from: "bot@example.com",
      to: "owner@example.com",
      subject: "Subject",
      text: "# Body"
    });
  });

  it("attaches auth only when both user and password are present", () => {
    const createTransport = vi.fn().mockReturnValue({ sendMail: vi.fn() });
    createMailer({ settings: settings({ user: "u" }), password: "p", createTransport });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: { user: "u", pass: "p" } })
    );

    createTransport.mockClear();
    createMailer({ settings: settings({ user: "u" }), createTransport });
    expect(createTransport.mock.calls[0]![0].auth).toBeUndefined();
  });
});
