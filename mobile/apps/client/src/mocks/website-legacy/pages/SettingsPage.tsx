import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { bumpData, useApp } from "@/hooks/use-app";
import { storageService, StorageError } from "@/storage/storage-service";
import { safeErrorMessage } from "@/utils/cn";

export function SettingsPage() {
  const { session, refresh } = useApp();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function exportData() {
    setError(null);
    try {
      const json = storageService.exportJson();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hel-calafkaaga-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess("Export downloaded.");
    } catch (err) {
      setError(safeErrorMessage(err, "Export failed."));
    }
  }

  async function importData(file: File | null) {
    if (!file) return;
    setError(null);
    setSuccess(null);
    try {
      const text = await file.text();
      storageService.importJson(text);
      bumpData();
      refresh();
      setSuccess("Import successful. Reloaded local data.");
    } catch (err) {
      if (err instanceof StorageError) setError(err.message);
      else setError(safeErrorMessage(err, "Import failed."));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function deleteAll() {
    try {
      storageService.clear();
      bumpData();
      refresh();
      setConfirmOpen(false);
      setSuccess("All local data deleted.");
      navigate("/");
    } catch (err) {
      setError(safeErrorMessage(err, "Could not delete data."));
    }
  }

  const content = (
    <section className="section" style={{ paddingTop: session ? "0.5rem" : undefined }}>
      <div className={session ? "stack" : "container-narrow stack"}>
        <h1 className="font-display">Local data &amp; settings</h1>
        <p className="muted">
          Hel Calafkaaga runs entirely in your browser. Accounts, profile answers, likes, chats,
          and notifications are stored with a storage service backed by localStorage. No backend
          or database server is required.
        </p>
        {error && <div className="form-error">{error}</div>}
        {success && <div className="form-success">{success}</div>}

        <article className="card" style={{ padding: "1.25rem" }}>
          <h2 className="font-display" style={{ marginTop: 0 }}>
            Export
          </h2>
          <p className="muted">Download all locally stored data as a JSON backup file.</p>
          <button type="button" className="btn btn-primary" onClick={exportData}>
            Export JSON
          </button>
        </article>

        <article className="card" style={{ padding: "1.25rem" }}>
          <h2 className="font-display" style={{ marginTop: 0 }}>
            Import
          </h2>
          <p className="muted">
            Restore a previously exported JSON file. Invalid files are rejected with a clear error.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => void importData(e.target.files?.[0] ?? null)}
          />
        </article>

        <article className="card" style={{ padding: "1.25rem" }}>
          <h2 className="font-display" style={{ marginTop: 0 }}>
            Delete all local data
          </h2>
          <p className="muted">
            Permanently removes accounts, profiles, chats, and session data from this browser.
          </p>
          <button type="button" className="btn btn-danger" onClick={() => setConfirmOpen(true)}>
            Delete all local data
          </button>
        </article>
      </div>

      {confirmOpen && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true">
          <div className="dialog">
            <h2 className="font-display" style={{ marginTop: 0 }}>
              Delete everything?
            </h2>
            <p className="muted">
              This cannot be undone unless you have an exported JSON backup.
            </p>
            <div className="row">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={deleteAll}>
                Yes, delete all
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  if (session) return content;
  return <MarketingLayout>{content}</MarketingLayout>;
}
