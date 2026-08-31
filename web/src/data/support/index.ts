import { apiSupport } from "./api";
import type { SupportAdapter } from "./types";

export type { SupportAdapter } from "./types";
export { SUPPORT_METHOD_NAMES } from "./types";

export function getSupportAdapter(): SupportAdapter {
  return apiSupport;
}

export const support = new Proxy({} as SupportAdapter, {
  get(_t, prop: string) {
    const adapter = getSupportAdapter();
    const value = adapter[prop as keyof SupportAdapter];
    if (typeof value === "function") return value.bind(adapter);
    return value;
  },
});
