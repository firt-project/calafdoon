"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/data/api-client";

type View = {
  guardianName: string;
  invitedByName: string;
  otherName: string;
  expiresAt: string;
  messages: Array<{ id: string; from: string; fromInviter: boolean; text: string; at: string }>;
};

/** Read-only chat for a guardian (wali). No account needed: the private link is the credential. */
export function GuardianChatView({ token }: { token: string }) {
  const [view, setView] = useState<View | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "invalid">("loading");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await apiClient.get<View>(`/guardian/${encodeURIComponent(token)}`);
        if (!alive) return;
        setView(res);
        setState("ok");
      } catch {
        if (alive) setState("invalid");
      }
    };
    void load();
    const t = window.setInterval(() => void load(), 20_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [token]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [view?.messages.length]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col bg-background px-4 py-6">
      <header className="mb-4 rounded-2xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">HelCalaf · Guardian view</p>
        {state === "ok" && view ? (
          <>
            <h1 className="mt-1 text-lg font-semibold">
              {view.invitedByName} &amp; {view.otherName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Assalamu alaikum {view.guardianName}. {view.invitedByName} asked you to follow this conversation, and{" "}
              {view.otherName} agreed. This page is read-only: you can read the messages but cannot reply, and photos are
              not shown. Either of them can end your access at any time.
            </p>
          </>
        ) : (
          <h1 className="mt-1 text-lg font-semibold">
            {state === "loading" ? "Loading…" : "This link is not valid"}
          </h1>
        )}
      </header>

      {state === "invalid" && (
        <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          This guardian link has ended, expired, or was never valid. Ask {`the member`} who sent it to share a new one from
          the HelCalaf app.
        </p>
      )}

      {state === "ok" && view && (
        <>
          <ol className="flex-1 space-y-2" aria-label="Conversation">
            {view.messages.length === 0 && (
              <li className="text-center text-sm text-muted-foreground">No messages yet.</li>
            )}
            {view.messages.map((m) => (
              <li key={m.id} className={m.fromInviter ? "flex justify-start" : "flex justify-end"}>
                <div
                  className={
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm " +
                    (m.fromInviter ? "bg-muted" : "bg-primary/15")
                  }
                >
                  <p className="text-[11px] font-semibold text-muted-foreground">{m.from}</p>
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
                    {new Date(m.at).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
            <div ref={endRef} />
          </ol>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Link valid until {new Date(view.expiresAt).toLocaleDateString()}. Please keep this link private.
          </p>
        </>
      )}
    </main>
  );
}
