export function parsePriceCentsFromTitle(title) {
    // Looks for "$45" or "$45.00" anywhere in the title
    const m = (title || "").match(/\$([0-9]+(?:\.[0-9]{1,2})?)/);
    if (!m) return null;
    const dollars = parseFloat(m[1]);
    if (!Number.isFinite(dollars)) return null;
    return Math.round(dollars * 100);
  }
  
  export function employeePayCents(totalCents) {
    // 20% then round UP to nearest $5
    const raw = Math.ceil(totalCents * 0.2);
    const fiveDollars = 500;
    return Math.ceil(raw / fiveDollars) * fiveDollars;
  }
  
  export function managerEachCents(totalCents, employeePay) {
    const remaining = Math.max(0, totalCents - employeePay);
    // split evenly; if odd cent, manager1 effectively gets +1 over time, but cents rarely odd
    return Math.floor(remaining / 2);
  }
  
  export function formatAUD(cents) {
    const v = (cents || 0) / 100;
    return v.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
  }
  