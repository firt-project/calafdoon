import { sanitizeLogMessage } from "../observability/log-redact";
import { escapeHtml } from "../mail/html-escape";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailAdapter {
  send(message: MailMessage): Promise<void>;
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Local / CI sink — never calls Resend or any external API. */
export class ConsoleMailAdapter implements MailAdapter {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    if (isProductionRuntime()) {
      throw new Error(
        "MAIL_DRIVER=console cannot send email in production. Set MAIL_DRIVER=resend and RESEND_API_KEY."
      );
    }
    // Mail delivery still receives the full message; logs get a sanitized copy.
    const redacted = {
      to: message.to,
      subject: message.subject,
      text: sanitizeLogMessage(message.text),
    };
    console.info("[mail:console]", JSON.stringify(redacted));
  }
}

/** Explicit no-op driver for tests that assert queueing without delivery. */
export class DisabledMailAdapter implements MailAdapter {
  async send(_message: MailMessage): Promise<void> {
    if (isProductionRuntime()) {
      throw new Error(
        "MAIL_DRIVER=disabled cannot send email in production. Set MAIL_DRIVER=resend and RESEND_API_KEY."
      );
    }
  }
}

/**
 * Resend driver — only used when MAIL_DRIVER=resend AND RESEND_API_KEY is set.
 * Phase 8 never enables this against production audiences in local tests.
 */
export class ResendMailAdapter implements MailAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async send(message: MailMessage): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html:
          message.html ??
          `<p>${escapeHtml(message.text).replace(/\n/g, "<br/>")}</p>`,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend failed: ${res.status} ${body.slice(0, 300)}`);
    }
    try {
      const payload = (await res.json()) as { id?: string };
      if (payload.id) {
        console.info("[mail:resend]", JSON.stringify({ id: payload.id, to: message.to }));
      }
    } catch {
      // Response body optional — send already succeeded.
    }
  }
}

export function createMailAdapter(opts: {
  driver: string;
  resendApiKey?: string;
  resendFrom?: string;
}): MailAdapter {
  if (opts.driver === "disabled") return new DisabledMailAdapter();
  if (opts.driver === "resend") {
    if (!opts.resendApiKey) {
      throw new Error("RESEND_API_KEY required when MAIL_DRIVER=resend");
    }
    return new ResendMailAdapter(
      opts.resendApiKey,
      opts.resendFrom ?? "Hel Calafkaaga <noreply@helcalafkaaga.com>"
    );
  }
  if (isProductionRuntime() && opts.driver !== "resend") {
    console.error(
      `[mail] WARNING: MAIL_DRIVER=${opts.driver || "console"} in production — password reset emails will fail until MAIL_DRIVER=resend is set.`
    );
  }
  return new ConsoleMailAdapter();
}
