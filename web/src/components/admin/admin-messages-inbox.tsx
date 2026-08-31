"use client";

import { ApiAdminMessagesInbox } from "./admin-messages-inbox.api";

interface AdminMessagesInboxProps {
  onOpenUser: (profileId: string) => void;
}

export function AdminMessagesInbox(props: AdminMessagesInboxProps) {
  return <ApiAdminMessagesInbox {...props} />;
}
