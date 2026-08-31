export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailAdapter {
  send(message: MailMessage): Promise<void>;
}

/** Local / CI sink — never calls Resend or any external API. */
export class ConsoleMailAdapter implements MailAdapter {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    if (process.env.NODE_ENV === "production") {
      throw new Error("ConsoleMailAdapter must not be used in production");
    }
    const redacted = {
      to: message.to,
      subject: message.subject,
      text: message.text.replace(
        /([A-Za-z0-9_-]{20,})/g,
        (m) => `${m.slice(0, 4)}…[REDACTED]`
      ),
    };
    console.info("[mail:console]", JSON.stringify(redacted));
  }
}

/** Explicit no-op driver for tests that assert queueing without delivery. */
export class DisabledMailAdapter implements MailAdapter {
  async send(_message: MailMessage): Promise<void> {
    return;
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
        html: message.html ?? `<p>${message.text}</p>`,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend failed: ${res.status} ${body.slice(0, 200)}`);
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
      opts.resendFrom ?? "Hel Calafkaaga <support@helcalafkaaga.com>"
    );
  }
  return new ConsoleMailAdapter();
}
