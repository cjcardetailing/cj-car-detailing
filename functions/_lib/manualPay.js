export function isManualPayTableMissingError(err) {
  const msg = String(err?.message || err || "");
  return msg.includes("no such table: manual_pay_entries");
}
