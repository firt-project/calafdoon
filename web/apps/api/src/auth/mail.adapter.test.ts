import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConsoleMailAdapter } from "./mail.adapter";

describe("ConsoleMailAdapter redaction (M1)", () => {
  it("does not log invite token query values", async () => {
    const adapter = new ConsoleMailAdapter();
    const token = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGh";
    const logs: string[] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      await adapter.send({
        to: "invitee@example.com",
        subject: "invite",
        text: `Accept: https://www.helcalafkaaga.com/admin/invite?token=${token}`,
      });
    } finally {
      console.info = original;
    }
    assert.equal(logs.length, 1);
    assert.equal(logs[0]!.includes(token), false);
    assert.match(logs[0]!, /token=%5BRedacted%5D|token=\[Redacted\]/i);
  });
});
