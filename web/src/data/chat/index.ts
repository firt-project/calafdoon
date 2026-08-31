import { apiChat } from "./api";
import type { ChatAdapter } from "./types";

export type { ChatAdapter } from "./types";
export { CHAT_METHOD_NAMES } from "./types";

export function getChatAdapter(): ChatAdapter {
  return apiChat;
}

export const chat = new Proxy({} as ChatAdapter, {
  get(_t, prop: string) {
    const adapter = getChatAdapter();
    const value = adapter[prop as keyof ChatAdapter];
    return typeof value === "function" ? value.bind(adapter) : value;
  },
});
