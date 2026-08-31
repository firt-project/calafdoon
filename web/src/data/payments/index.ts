import { apiPayments } from "./api";
import type { PaymentsAdapter } from "./types";

export type { PaymentsAdapter } from "./types";
export {
  PAYMENTS_METHOD_NAMES,
  EVC_METHOD_NAMES,
  WAAFI_METHOD_NAMES,
} from "./types";

export function getPaymentsAdapter(): PaymentsAdapter {
  return apiPayments;
}

export const payments = new Proxy({} as PaymentsAdapter, {
  get(_t, prop: string) {
    const adapter = getPaymentsAdapter();
    const value = adapter[prop as keyof PaymentsAdapter];
    if (typeof value === "function") return value.bind(adapter);
    return value;
  },
});
