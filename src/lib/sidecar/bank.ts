import { invoke } from "@tauri-apps/api/core";
import type { Booking } from "$lib/bank/match";

export type BankParseResult = {
  success: true;
  format: "camt" | "mt940";
  bookings: Booking[];
};

export type BankParseError = {
  success: false;
  error: { code: string; message: string; details: string };
};

export async function parseBankStatement(
  path: string,
  format: "auto" | "camt" | "mt940" = "auto",
): Promise<BankParseResult | BankParseError> {
  return invoke<BankParseResult | BankParseError>("parse_bank_statement", { path, format });
}
