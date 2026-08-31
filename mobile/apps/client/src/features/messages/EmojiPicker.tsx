import { useEffect, useMemo, useState } from "react";
import { prefsStore } from "@/platform/secure-storage";
import { EMOJI_CATEGORIES, RECENT_KEY } from "./emoji-data";

type Props = {
  open: boolean;
  locale: "en" | "so";
  onClose: () => void;
  onPick: (emoji: string) => void;
  title: string;
  recentLabel: string;
  searchLabel: string;
};

export default function EmojiPicker({
  open,
  locale,
  onClose,
  onPick,
  title,
  recentLabel,
  searchLabel,
}: Props) {
  const [recent, setRecent] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState(EMOJI_CATEGORIES[0]?.id ?? "smileys");

  useEffect(() => {
    if (!open) return;
    void prefsStore.get(RECENT_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) setRecent(parsed.map(String).slice(0, 24));
      } catch {
        /* ignore */
      }
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function pick(emoji: string) {
    onPick(emoji);
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, 24);
    setRecent(next);
    await prefsStore.set(RECENT_KEY, JSON.stringify(next));
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter((e) =>
      e.includes(q)
    );
  }, [query]);

  if (!open) return null;

  return (
    <>
      <button type="button" className="sheet-backdrop" aria-label="Close" onClick={onClose} />
      <div className="sheet emoji-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-handle" />
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>{title}</h2>
        <input
          className="field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchLabel}
          aria-label={searchLabel}
        />
        {recent.length > 0 && !query && (
          <div className="emoji-section">
            <p className="muted small">{recentLabel}</p>
            <div className="emoji-grid">
              {recent.map((e) => (
                <button
                  key={`r-${e}`}
                  type="button"
                  className="emoji-btn"
                  aria-label={e}
                  onClick={() => void pick(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        {!query && (
          <div className="emoji-tabs" role="tablist">
            {EMOJI_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={tab === c.id}
                className={tab === c.id ? "btn btn-primary" : "btn btn-ghost"}
                onClick={() => setTab(c.id)}
              >
                {locale === "so" ? c.labelSo : c.labelEn}
              </button>
            ))}
          </div>
        )}
        <div className="emoji-grid" style={{ maxHeight: "40vh", overflow: "auto" }}>
          {(filtered ??
            EMOJI_CATEGORIES.find((c) => c.id === tab)?.emojis ??
            []
          ).map((e, i) => (
            <button
              key={`${e}-${i}`}
              type="button"
              className="emoji-btn"
              aria-label={e}
              onClick={() => void pick(e)}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
