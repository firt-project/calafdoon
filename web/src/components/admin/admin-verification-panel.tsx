"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, CheckCircle2, XCircle } from "lucide-react";
import { apiClient } from "@/data/api-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getSafeUserError } from "@/lib/safe-error";

type Item = {
  id: string;
  name: string;
  age: number | null;
  prompt: string;
  submittedAt: string;
  selfieUrl: string | null;
  profilePhotoUrl: string | null;
};

export function AdminVerificationPanel() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const fetchItems = useCallback(async (): Promise<Item[]> => {
    try {
      const res = await apiClient.get<{ items: Item[] }>("/admin/verifications");
      return res.items ?? [];
    } catch (e) {
      toast.error(getSafeUserError(e, "Could not load verifications."));
      return [];
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void fetchItems().then((list) => {
      if (alive) setItems(list);
    });
    return () => {
      alive = false;
    };
  }, [fetchItems]);

  const act = async (id: string, path: "approve" | "reject", body: object = {}) => {
    setBusyId(id);
    try {
      await apiClient.post(`/admin/verifications/${id}/${path}`, body);
      toast.success(path === "approve" ? "Member verified." : "Selfie rejected.");
      setRejectingId(null);
      setReason("");
      setItems(await fetchItems());
    } catch (e) {
      toast.error(getSafeUserError(e, "Action failed."));
    } finally {
      setBusyId(null);
    }
  };

  if (items === null) {
    return <Skeleton className="h-48 w-full rounded-2xl" />;
  }
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <BadgeCheck className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 font-medium">Nothing to review</p>
        <p className="text-sm text-muted-foreground">New selfies will appear here.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((v) => (
        <article key={v.id} className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div>
            <p className="font-semibold">
              {v.name}
              {v.age != null ? `, ${v.age}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Pose asked: {v.prompt} · {new Date(v.submittedAt).toLocaleString()}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Selfie", v.selfieUrl],
              ["Profile photo", v.profilePhotoUrl],
            ].map(([label, url]) => (
              <figure key={label} className="space-y-1">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={label ?? ""} className="aspect-[3/4] w-full rounded-xl object-cover" />
                ) : (
                  <div className="flex aspect-[3/4] items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground">
                    Unavailable
                  </div>
                )}
                <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
              </figure>
            ))}
          </div>
          {rejectingId === v.id ? (
            <div className="space-y-2">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Tell the member why (e.g. face not clearly visible)"
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busyId === v.id || reason.trim().length < 3}
                  onClick={() => void act(v.id, "reject", { reason: reason.trim() })}
                >
                  Reject selfie
                </Button>
                <Button variant="outline" size="sm" onClick={() => setRejectingId(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" disabled={busyId === v.id} onClick={() => void act(v.id, "approve")}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busyId === v.id}
                onClick={() => setRejectingId(v.id)}
              >
                <XCircle className="mr-1 h-4 w-4" /> Reject
              </Button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
