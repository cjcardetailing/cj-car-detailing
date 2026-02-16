import { requireRole } from "../../../_lib/requireAuth.js";
import { formatAUD } from "../../../_lib/money.js";
import { isManualPayTableMissingError } from "../../../_lib/manualPay.js";

function toDMY(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso || "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function perCarRateCentsFromTitle(title) {
  const t = String(title || "").toLowerCase();
  const isInsideAndOut = t.includes("inside and out") || t.includes("inside & out");
  const hasInside = t.includes("inside") || t.includes("interior");
  const hasOutside = t.includes("outside") || t.includes("exterior");
  if (isInsideAndOut || (hasInside && hasOutside)) return 2000;
  if (hasInside) return 1500;
  if (hasOutside) return 1000;
  return null;
}

function serviceLabelFromTitle(title) {
  const t = String(title || "").toLowerCase();
  const isInsideAndOut = t.includes("inside and out") || t.includes("inside & out");
  const hasInside = t.includes("inside") || t.includes("interior");
  const hasOutside = t.includes("outside") || t.includes("exterior");
  if (isInsideAndOut || (hasInside && hasOutside)) return "Inside + Outside";
  if (hasInside) return "Inside";
  if (hasOutside) return "Outside";
  const raw = String(title || "").trim();
  return raw || "Car wash";
}

function toDisplayDateTime(value) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value || "");
  return dt.toLocaleString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderSlipSection({ employeeName, rows, from, to }) {
  let totalCars = 0;
  let totalPayCents = 0;

  const lineRows = rows.map((row) => {
    const cars = Math.max(0, Number(row.cars_count || 0));
    const fallbackRate = cars > 0
      ? Math.round(Number(row.employee_pay_cents || 0) / cars)
      : Number(row.employee_pay_cents || 0);
    const rateCents = perCarRateCentsFromTitle(row.title) ?? Math.max(0, fallbackRate);
    const thisPayCents = rateCents * cars;
    totalCars += cars;
    totalPayCents += thisPayCents;
    return `
      <tr>
        <td>
          <div class="service">${escapeHtml(serviceLabelFromTitle(row.title))}</div>
          <div class="meta">${escapeHtml(toDisplayDateTime(row.start_time))}</div>
        </td>
        <td class="num">${cars}</td>
        <td class="money">${escapeHtml(formatAUD(rateCents))}</td>
        <td class="money strong">${escapeHtml(formatAUD(thisPayCents))}</td>
      </tr>
    `;
  }).join("");

  const tableBody = lineRows || `
    <tr>
      <td colspan="4" class="empty">No jobs in this pay period.</td>
    </tr>
  `;

  return `
    <section class="slip-page">
      <header class="slip-header">
        <div class="logo-wrap">
          <img class="logo" src="/images/favicon.png" alt="CJ logo" onerror="this.src='/favicon.png'"/>
        </div>
        <div class="head-right">
          <h1>Pay Slip</h1>
          <div class="detail"><span>Employee</span><b>${escapeHtml(employeeName)}</b></div>
          <div class="detail"><span>Period</span><b>${escapeHtml(toDMY(from))} - ${escapeHtml(toDMY(to))}</b></div>
        </div>
      </header>

      <table class="slip-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Amount of Cars</th>
            <th>Rate (Per Car)</th>
            <th>This Pay</th>
          </tr>
        </thead>
        <tbody>
          ${tableBody}
        </tbody>
        <tfoot>
          <tr>
            <td class="strong">Total</td>
            <td class="num strong">${totalCars}</td>
            <td></td>
            <td class="money strong">${escapeHtml(formatAUD(totalPayCents))}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  `;
}

function renderPayslipHtml(slipHtml) {
  const generatedAt = new Date().toLocaleString("en-AU");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>My Pay Slip</title>
  <style>
    :root {
      --ink: #171717;
      --muted: #666;
      --line: #d9d9d9;
      --bg: #f5f5f5;
      --card: #ffffff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--ink);
      background: var(--bg);
    }
    .topbar {
      position: sticky;
      top: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 18px;
      background: #111;
      color: #fff;
      z-index: 5;
    }
    .topbar button {
      border: 0;
      padding: 10px 14px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    .wrap {
      max-width: 980px;
      margin: 22px auto;
      padding: 0 10px 30px;
    }
    .slip-page {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 26px;
      margin-bottom: 18px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .slip-header {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: flex-start;
      margin-bottom: 20px;
    }
    .logo-wrap {
      flex: 0 0 auto;
      width: 220px;
    }
    .logo {
      width: 190px;
      height: 190px;
      object-fit: contain;
      border-radius: 12px;
      display: block;
    }
    .head-right h1 {
      margin: 0 0 12px;
      font-size: 38px;
      line-height: 1;
    }
    .detail {
      display: grid;
      grid-template-columns: 90px 1fr;
      gap: 10px;
      margin: 7px 0;
      align-items: baseline;
    }
    .detail span {
      color: var(--muted);
      font-size: 14px;
    }
    .detail b {
      font-size: 17px;
    }
    .slip-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .slip-table th, .slip-table td {
      border-bottom: 1px solid var(--line);
      padding: 12px 10px;
      text-align: left;
      vertical-align: top;
    }
    .slip-table th {
      font-size: 15px;
      background: #f9f9f9;
    }
    .slip-table td:nth-child(2),
    .slip-table td:nth-child(3),
    .slip-table td:nth-child(4),
    .slip-table th:nth-child(2),
    .slip-table th:nth-child(3),
    .slip-table th:nth-child(4) {
      text-align: right;
      white-space: nowrap;
    }
    .service {
      font-weight: 600;
    }
    .meta {
      margin-top: 4px;
      color: var(--muted);
      font-size: 13px;
    }
    .empty {
      color: var(--muted);
      text-align: center !important;
      padding: 24px !important;
    }
    .money { font-variant-numeric: tabular-nums; }
    .num { font-variant-numeric: tabular-nums; }
    .strong { font-weight: 700; }
    tfoot td {
      border-top: 2px solid #222;
      border-bottom: 0;
      padding-top: 14px;
    }
    @media print {
      body { background: #fff; }
      .topbar { display: none; }
      .wrap { max-width: none; margin: 0; padding: 0; }
      .slip-page {
        border: 0;
        border-radius: 0;
        margin: 0;
        min-height: 100vh;
      }
      @page { size: A4; margin: 10mm; }
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div>Payslip generated: ${escapeHtml(generatedAt)}</div>
    <button onclick="window.print()">Print / Save PDF</button>
  </div>
  <main class="wrap">
    ${slipHtml}
  </main>
</body>
</html>`;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "EMPLOYEE");
  if (!auth.ok) return auth.res;

  const employeeUserId = Number(auth.user.id);
  const period = await env.DB.prepare(
    `SELECT
      date('now','localtime','weekday 1','-7 days') AS from_date,
      date('now','localtime','weekday 1') AS to_date_exclusive`
  ).first();

  const from = String(period?.from_date || "");
  const to = String(period?.to_date_exclusive || "");

  const userRow = await env.DB.prepare(
    `SELECT u.username, ep.full_name
     FROM users u
     LEFT JOIN employee_profiles ep ON ep.user_id = u.id
     WHERE u.id = ?
     LIMIT 1`
  ).bind(employeeUserId).first();

  let rows;
  try {
    rows = await env.DB.prepare(
      `SELECT
         start_time,
         title,
         cars_count,
         employee_pay_cents
       FROM (
         SELECT
           b.start_time AS start_time,
           b.title AS title,
           ba.cars_count AS cars_count,
           ba.employee_pay_cents AS employee_pay_cents
         FROM booking_assignments ba
         JOIN bookings b ON b.id = ba.booking_id
         WHERE ba.employee_user_id = ?
           AND datetime(b.start_time) >= datetime(?)
           AND datetime(b.start_time) < datetime(?)

         UNION ALL

         SELECT
           mpe.job_time AS start_time,
           mpe.job_type AS title,
           mpe.cars_count AS cars_count,
           mpe.pay_cents AS employee_pay_cents
         FROM manual_pay_entries mpe
         WHERE mpe.employee_user_id = ?
           AND datetime(mpe.job_time) >= datetime(?)
           AND datetime(mpe.job_time) < datetime(?)
       )
       ORDER BY datetime(start_time) ASC`
    ).bind(employeeUserId, from, to, employeeUserId, from, to).all();
  } catch (err) {
    if (!isManualPayTableMissingError(err)) throw err;
    rows = await env.DB.prepare(
      `SELECT
         b.start_time AS start_time,
         b.title AS title,
         ba.cars_count AS cars_count,
         ba.employee_pay_cents AS employee_pay_cents
       FROM booking_assignments ba
       JOIN bookings b ON b.id = ba.booking_id
       WHERE ba.employee_user_id = ?
         AND datetime(b.start_time) >= datetime(?)
         AND datetime(b.start_time) < datetime(?)
       ORDER BY datetime(b.start_time) ASC`
    ).bind(employeeUserId, from, to).all();
  }

  const employeeName = userRow?.full_name || userRow?.username || "Employee";
  const slipHtml = renderSlipSection({
    employeeName,
    rows: rows.results || [],
    from,
    to,
  });

  const html = renderPayslipHtml(slipHtml);
  const filename = `payslip_${toDMY(from).replaceAll("/", "-")}_to_${toDMY(to).replaceAll("/", "-")}.html`;
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
