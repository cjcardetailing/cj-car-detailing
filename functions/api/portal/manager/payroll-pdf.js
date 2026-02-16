import { requireRole } from "../../../_lib/requireAuth.js";
import { decryptString } from "../../../_lib/crypto.js";
import { formatAUD } from "../../../_lib/money.js";

function byteLen(str) {
  return new TextEncoder().encode(str).length;
}

function pdfEscape(str) {
  return String(str ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function toDMY(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso || "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function clip(s, n) {
  const t = String(s ?? "");
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 1))}...`;
}

function buildPdf(pagesLines) {
  const pageCount = pagesLines.length || 1;
  const objects = [];

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;

  const kids = [];
  for (let i = 0; i < pageCount; i++) {
    const pageObj = 3 + i * 2;
    const contentObj = 4 + i * 2;
    kids.push(`${pageObj} 0 R`);

    const lines = pagesLines[i] || [""];
    let y = 805;
    let content = "BT\n/F1 10 Tf\n";
    for (const line of lines) {
      content += `1 0 0 1 36 ${y} Tm (${pdfEscape(line)}) Tj\n`;
      y -= 14;
    }
    content += "ET";

    objects[contentObj] = `<< /Length ${byteLen(content)} >>\nstream\n${content}\nendstream`;
    objects[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Courier >> >> >> /Contents ${contentObj} 0 R >>`;
  }

  objects[2] = `<< /Type /Pages /Count ${pageCount} /Kids [${kids.join(" ")}] >>`;

  let out = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = byteLen(out);
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = byteLen(out);
  out += `xref\n0 ${objects.length}\n`;
  out += "0000000000 65535 f \n";
  for (let i = 1; i < objects.length; i++) {
    out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return new TextEncoder().encode(out);
}

function paginateLines(lines, linesPerPage = 54) {
  if (!lines.length) return [[""]];
  const pages = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }
  return pages;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  const url = new URL(request.url);
  const from = String(url.searchParams.get("from") || "");
  const to = String(url.searchParams.get("to") || "");
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoRe.test(from) || !isoRe.test(to) || from >= to) {
    return new Response("Invalid from/to. Use YYYY-MM-DD and ensure from < to.", { status: 400 });
  }

  const rows = await env.DB.prepare(
    `SELECT
        ba.employee_user_id,
        u.username,
        u.email,
        u.phone,
        ep.full_name,
        ep.bank_bsb_enc,
        ep.bank_account_enc,
        SUM(ba.employee_pay_cents) AS employee_pay_cents,
        COUNT(*) AS jobs
     FROM booking_assignments ba
     JOIN bookings b ON b.id = ba.booking_id
     JOIN users u ON u.id = ba.employee_user_id
     LEFT JOIN employee_profiles ep ON ep.user_id = u.id
     WHERE datetime(b.start_time) >= datetime(?) AND datetime(b.start_time) < datetime(?)
     GROUP BY ba.employee_user_id
     ORDER BY employee_pay_cents DESC`
  ).bind(from, to).all();

  const totals = await env.DB.prepare(
    `SELECT
       SUM(ba.total_price_cents) AS total_cents,
       SUM(ba.employee_pay_cents) AS employee_cents,
       SUM(ba.manager_each_cents) AS manager_each_sum
     FROM booking_assignments ba
     JOIN bookings b ON b.id = ba.booking_id
     WHERE datetime(b.start_time) >= datetime(?) AND datetime(b.start_time) < datetime(?)`
  ).bind(from, to).first();

  const lines = [];
  lines.push("CJ Detailing - Payroll Report");
  lines.push(`Date Range: ${toDMY(from)} to ${toDMY(to)}`);
  lines.push(`Generated: ${new Date().toLocaleString("en-AU")}`);
  lines.push("");
  lines.push(`Total Revenue:   ${formatAUD(totals?.total_cents || 0)}`);
  lines.push(`Employee Wages:  ${formatAUD(totals?.employee_cents || 0)}`);
  lines.push(`Per Manager:     ${formatAUD(totals?.manager_each_sum || 0)}`);
  lines.push("");
  lines.push("Employee Details");
  lines.push("--------------------------------------------------------------------------------");
  lines.push("Name                 Username   Jobs  Owed         BSB      Account       Email");
  lines.push("--------------------------------------------------------------------------------");

  for (const r of (rows.results || [])) {
    const bsb = r.bank_bsb_enc ? await decryptString(env, r.bank_bsb_enc) : "-";
    const acc = r.bank_account_enc ? await decryptString(env, r.bank_account_enc) : "-";
    const line = [
      clip(r.full_name || "-", 20).padEnd(20, " "),
      clip(r.username || "-", 10).padEnd(10, " "),
      String(r.jobs || 0).padStart(4, " "),
      clip(formatAUD(r.employee_pay_cents || 0), 11).padEnd(11, " "),
      clip(bsb || "-", 8).padEnd(8, " "),
      clip(acc || "-", 13).padEnd(13, " "),
      clip(r.email || "-", 28),
    ].join(" ");
    lines.push(line);
    if (r.phone) lines.push(`  phone: ${clip(r.phone, 40)}`);
  }

  if (!(rows.results || []).length) {
    lines.push("No payroll rows for this date range.");
  }

  const pdfBytes = buildPdf(paginateLines(lines));
  const filename = `payroll_${toDMY(from).replaceAll("/", "-")}_to_${toDMY(to).replaceAll("/", "-")}.pdf`;

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
