import { apiMatching } from "./api";
import type { MatchingAdapter } from "./types";

export type { MatchingAdapter } from "./types";
export { MATCHING_METHOD_NAMES } from "./types";

export function getMatchingAdapter(): MatchingAdapter {
  return apiMatching;
}

export const matching = new Proxy({} as MatchingAdapter, {
  get(_t, prop: string) {
    const adapter = getMatchingAdapter();
    const value = adapter[prop as keyof MatchingAdapter];
    return typeof value === "function" ? value.bind(adapter) : value;
  },
});
