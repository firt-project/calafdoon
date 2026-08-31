"use client";

import { useCallback, useEffect, useState } from "react";
import { apiModeration } from "./api";

export function useMyBlocks() {
  const [apiData, setApiData] = useState<unknown>(undefined);
  useEffect(() => {
    let c = false;
    void apiModeration
      .listMyBlocks()
      .then((d) => {
        if (!c) setApiData(d);
      })
      .catch(() => {
        if (!c) setApiData(null);
      });
    return () => {
      c = true;
    };
  }, []);
  return apiData;
}

export function useBlockUser() {
  return useCallback(
    async (
      args: { blockedUserId: string; reason?: string } | string,
      reason?: string
    ) => {
      const blockedUserId =
        typeof args === "string" ? args : args.blockedUserId;
      const r = typeof args === "string" ? reason : args.reason;
      return apiModeration.blockUser(blockedUserId, r);
    },
    []
  );
}

export function useUnblockUser() {
  return useCallback(
    async (args: { blockedUserId: string } | string) => {
      const blockedUserId =
        typeof args === "string" ? args : args.blockedUserId;
      return apiModeration.unblockUser(blockedUserId);
    },
    []
  );
}

export function useReportUser() {
  return useCallback(
    async (body: {
      reportedUserId?: string;
      userId?: string;
      reason: string;
      details?: string;
      alsoBlock?: boolean;
    }) => {
      const reportedUserId = body.reportedUserId ?? body.userId;
      if (!reportedUserId) throw new Error("reportedUserId required");
      return apiModeration.reportUser({
        userId: reportedUserId,
        reason: body.reason,
        details: body.details,
        alsoBlock: body.alsoBlock,
      });
    },
    []
  );
}
