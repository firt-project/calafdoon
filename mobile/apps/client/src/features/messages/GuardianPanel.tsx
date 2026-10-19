import { useCallback, useEffect, useState } from "react";
import { Copy, Share2, Users } from "lucide-react";
import { Share } from "@capacitor/share";
import { apiClient, subscribeRealtime } from "@hel/api-client";
import { BottomSheet } from "@/ui/mobile-kit";
import { userFacingError } from "@/platform/errors";
import { hapticError, hapticSuccess } from "@/platform/haptics";

export type Chaperone = {
  id: string;
  status: "pending" | "active";
  guardianName: string;
  relationship: string;
  invitedByMe: boolean;
  invitedByName: string;
  expiresAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  link: string | null;
};

const RELATIONSHIPS: Array<[string, string]> = [
  ["father", "Father"],
  ["mother", "Mother"],
  ["brother", "Brother"],
  ["sister", "Sister"],
  ["uncle", "Uncle"],
  ["aunt", "Aunt"],
  ["imam", "Imam / elder"],
  ["other", "Other"],
];
const relLabel = (v: string) => RELATIONSHIPS.find(([k]) => k === v)?.[1].toLowerCase() ?? v;

/** Guardian (wali) following a chat: loads the state and keeps it fresh in real time. */
export function useChaperones(conversationId: string) {
  const [items, setItems] = useState<Chaperone[]>([]);
  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<{ items: Chaperone[] }>(
        `/conversations/${encodeURIComponent(conversationId)}/chaperones`
      );
      setItems(res.items ?? []);
    } catch {
      /* optional feature: never block the chat */
    }
  }, [conversationId]);
  useEffect(() => {
    void load();
    return subscribeRealtime("chaperone:updated", (p) => {
      const c = (p as { conversationId?: string } | undefined)?.conversationId;
      if (!c || c === conversationId) void load();
    });
  }, [conversationId, load]);
  return { items, reload: load };
}

export function GuardianBanners({
  conversationId,
  items,
  peerName,
  reload,
}: {
  conversationId: string;
  items: Chaperone[];
  peerName: string;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const base = `/conversations/${encodeURIComponent(conversationId)}/chaperones`;

  async function run(id: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(id);
    setNote(null);
    try {
      await fn();
      await hapticSuccess();
      if (done) setNote(done);
      await reload();
    } catch (e) {
      await hapticError();
      setNote(userFacingError(e));
    } finally {
      setBusy(null);
    }
  }

  async function shareLink(c: Chaperone) {
    if (!c.link) return;
    try {
      await Share.share({
        title: "HelCalaf guardian link",
        text: `Assalamu alaikum ${c.guardianName}, you can follow my conversation here (read-only):`,
        url: c.link,
        dialogTitle: "Send the link to your guardian",
      });
    } catch {
      /* cancelled */
    }
  }

  async function copyLink(c: Chaperone) {
    if (!c.link) return;
    try {
      await navigator.clipboard.writeText(c.link);
      setNote("Link copied. Send it to your guardian.");
    } catch {
      setNote(c.link);
    }
  }

  if (items.length === 0) return null;
  return (
    <div className="gd-wrap">
      {note && <p className="gd-note">{note}</p>}
      {items.map((c) => {
        if (c.status === "pending" && !c.invitedByMe) {
          return (
            <div key={c.id} className="gd-card gd-ask">
              <p>
                <strong>{c.invitedByName}</strong> would like to add their guardian, <strong>{c.guardianName}</strong> (
                {relLabel(c.relationship)}), to follow this chat. They can only read text messages — no photos — and you
                or {c.invitedByName} can end it any time.
              </p>
              <div className="gd-actions">
                <button type="button" className="btn btn-primary" disabled={busy === c.id} onClick={() => void run(c.id, () => apiClient.post(`${base}/${c.id}/respond`, { accept: true }))}>
                  Accept
                </button>
                <button type="button" className="btn btn-secondary" disabled={busy === c.id} onClick={() => void run(c.id, () => apiClient.post(`${base}/${c.id}/respond`, { accept: false }))}>
                  Decline
                </button>
              </div>
            </div>
          );
        }
        if (c.status === "pending") {
          return (
            <div key={c.id} className="gd-card">
              <p>
                <Users size={15} aria-hidden /> Waiting for <strong>{peerName}</strong> to agree to add{" "}
                <strong>{c.guardianName}</strong> ({relLabel(c.relationship)}).
              </p>
              <div className="gd-actions">
                <button type="button" className="btn btn-ghost" disabled={busy === c.id} onClick={() => void run(c.id, () => apiClient.delete(`${base}/${c.id}`), "Request cancelled.")}>
                  Cancel request
                </button>
              </div>
            </div>
          );
        }
        return (
          <div key={c.id} className="gd-card gd-active">
            <p>
              <Users size={15} aria-hidden /> <strong>{c.guardianName}</strong> ({relLabel(c.relationship)}, invited by{" "}
              {c.invitedByMe ? "you" : c.invitedByName}) follows this chat, read-only.
              {c.invitedByMe && c.viewCount > 0 ? ` Opened ${c.viewCount} time${c.viewCount === 1 ? "" : "s"}.` : ""}
            </p>
            <div className="gd-actions">
              {c.invitedByMe && c.link && (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => void shareLink(c)}>
                    <Share2 size={15} /> Share link
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => void copyLink(c)}>
                    <Copy size={15} /> Copy
                  </button>
                </>
              )}
              <button type="button" className="btn btn-ghost" disabled={busy === c.id} onClick={() => void run(c.id, () => apiClient.delete(`${base}/${c.id}`), "Guardian removed.")}>
                Remove
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GuardianSheet({
  open,
  onClose,
  conversationId,
  peerName,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  peerName: string;
  onSent: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [rel, setRel] = useState("father");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/conversations/${encodeURIComponent(conversationId)}/chaperones`, {
        guardianName: name.trim(),
        relationship: rel,
      });
      await hapticSuccess();
      setName("");
      onClose();
      await onSent();
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} title="Add a guardian to this chat" onClose={onClose}>
      <div className="stack">
        <p className="muted small" style={{ margin: 0 }}>
          Family involvement is part of marriage. Add your guardian (wali) so they can follow this conversation.{" "}
          <strong>{peerName}</strong> has to agree first. Your guardian can only read text messages — no photos, no
          replying — and either of you can end it at any time.
        </p>
        <input className="gd-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Guardian's name" maxLength={60} aria-label="Guardian's name" />
        <div className="gd-chips" role="radiogroup" aria-label="Relationship">
          {RELATIONSHIPS.map(([key, label]) => (
            <button key={key} type="button" role="radio" aria-checked={rel === key} className={`gd-chip${rel === key ? " on" : ""}`} onClick={() => setRel(key)}>
              {label}
            </button>
          ))}
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <button type="button" className="btn btn-primary btn-block" disabled={busy || name.trim().length < 2} onClick={() => void send()}>
          {busy ? "Sending…" : `Ask ${peerName} to agree`}
        </button>
      </div>
    </BottomSheet>
  );
}
