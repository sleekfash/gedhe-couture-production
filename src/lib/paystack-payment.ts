export interface PaystackChargeSnapshot {
  status?: string;
  amount?: number;
  currency?: string;
}

export type PaystackChargeFailure = "transaction_not_successful" | "amount_or_currency_mismatch";

export function validatePaystackCharge(
  charge: PaystackChargeSnapshot,
  expectedMinor: number,
  expectedCurrency: string,
): PaystackChargeFailure | null {
  if (charge.status !== "success") return "transaction_not_successful";
  if (
    charge.amount !== expectedMinor ||
    (charge.currency ?? "").toUpperCase() !== expectedCurrency.toUpperCase()
  ) {
    return "amount_or_currency_mismatch";
  }
  return null;
}
