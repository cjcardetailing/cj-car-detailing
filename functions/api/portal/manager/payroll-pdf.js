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
  const employeeUserIdRaw = url.searchParams.get("employee_user_id");
  const employeeUserId = employeeUserIdRaw ? Number(employeeUserIdRaw) : null;
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoRe.test(from) || !isoRe.test(to) || from >= to || (employeeUserIdRaw && !Number.isFinite(employeeUserId))) {
    return new Response("Invalid from/to. Use YYYY-MM-DD and ensure from < to.", { status: 400 });
  }

  const rows = await env.DB.prepare(
    `WITH payroll_rows AS (
      SELECT
        ba.employee_user_id AS employee_user_id,
        ba.employee_pay_cents AS employee_pay_cents,
        ba.total_price_cents AS total_price_cents,
        ba.manager_each_cents AS manager_each_cents,
        ba.cars_count AS cars_count,
        1 AS jobs
      FROM booking_assignments ba
      JOIN bookings b ON b.id = ba.booking_id
      WHERE datetime(b.start_time) >= datetime(?) AND datetime(b.start_time) < datetime(?)
        AND (? IS NULL OR ba.employee_user_id = ?)

      UNION ALL

      SELECT
        mpe.employee_user_id AS employee_user_id,
        mpe.pay_cents AS employee_pay_cents,
        0 AS total_price_cents,
        0 AS manager_each_cents,
        mpe.cars_count AS cars_count,
        1 AS jobs
      FROM manual_pay_entries mpe
      WHERE datetime(mpe.job_time) >= datetime(?) AND datetime(mpe.job_time) < datetime(?)
        AND (? IS NULL OR mpe.employee_user_id = ?)
    )
    SELECT
        pr.employee_user_id,
        u.username,
        u.email,
        u.phone,
        ep.full_name,
        ep.bank_bsb_enc,
        ep.bank_account_enc,
        SUM(pr.employee_pay_cents) AS employee_pay_cents,
        SUM(pr.total_price_cents) AS total_price_cents,
        SUM(pr.cars_count) AS cars_washed,
        SUM(pr.jobs) AS jobs
     FROM payroll_rows pr
     JOIN users u ON u.id = pr.employee_user_id
     LEFT JOIN employee_profiles ep ON ep.user_id = u.id
     GROUP BY pr.employee_user_id
     ORDER BY employee_pay_cents DESC`
  ).bind(
    from, to, employeeUserId, employeeUserId,
    from, to, employeeUserId, employeeUserId
  ).all();

  const totals = await env.DB.prepare(
    `WITH total_rows AS (
      SELECT
        ba.employee_user_id AS employee_user_id,
        ba.total_price_cents AS total_price_cents,
        ba.employee_pay_cents AS employee_pay_cents,
        ba.manager_each_cents AS manager_each_cents,
        ba.cars_count AS cars_count
      FROM booking_assignments ba
      JOIN bookings b ON b.id = ba.booking_id
      WHERE datetime(b.start_time) >= datetime(?) AND datetime(b.start_time) < datetime(?)
        AND (? IS NULL OR ba.employee_user_id = ?)

      UNION ALL

      SELECT
        mpe.employee_user_id AS employee_user_id,
        0 AS total_price_cents,
        mpe.pay_cents AS employee_pay_cents,
        0 AS manager_each_cents,
        mpe.cars_count AS cars_count
      FROM manual_pay_entries mpe
      WHERE datetime(mpe.job_time) >= datetime(?) AND datetime(mpe.job_time) < datetime(?)
        AND (? IS NULL OR mpe.employee_user_id = ?)
    )
    SELECT
       SUM(total_price_cents) AS total_cents,
       SUM(employee_pay_cents) AS employee_cents,
       SUM(manager_each_cents) AS manager_each_sum,
       SUM(cars_count) AS cars_washed
    FROM total_rows`
  ).bind(
    from, to, employeeUserId, employeeUserId,
    from, to, employeeUserId, employeeUserId
  ).first();

  const lines = [];
  lines.push("CJ Detailing - Payroll Report");
  lines.push(`Date Range: ${toDMY(from)} to ${toDMY(to)}`);
  lines.push(`Generated: ${new Date().toLocaleString("en-AU")}`);
  lines.push("");
  lines.push(`Total Revenue:   ${formatAUD(totals?.total_cents || 0)}`);
  lines.push(`Employee Wages:  ${formatAUD(totals?.employee_cents || 0)}`);
  lines.push(`Per Manager:     ${formatAUD(totals?.manager_each_sum || 0)}`);
  lines.push(`Cars Washed:     ${Number(totals?.cars_washed || 0)}`);
  lines.push("Pay Rule:        Auto 20% rounded up to nearest $5 per booking + manual pay entries");
  lines.push("");
  lines.push("Employee Details");
  lines.push("--------------------------------------------------------------------------------");
  lines.push("Name                 User       Cars  Jobs  Earned       Rate   Email");
  lines.push("--------------------------------------------------------------------------------");

  for (const r of (rows.results || [])) {
    const bsb = r.bank_bsb_enc ? await decryptString(env, r.bank_bsb_enc) : "-";
    const acc = r.bank_account_enc ? await decryptString(env, r.bank_account_enc) : "-";
    const total = r.total_price_cents || 0;
    const effectiveRate = total > 0 ? Math.round(((r.employee_pay_cents || 0) / total) * 1000) / 10 : 0;
    const line = [
      clip(r.full_name || "-", 20).padEnd(20, " "),
      clip(r.username || "-", 10).padEnd(10, " "),
      String(r.cars_washed || 0).padStart(4, " "),
      String(r.jobs || 0).padStart(4, " "),
      clip(formatAUD(r.employee_pay_cents || 0), 12).padEnd(12, " "),
      clip(`${effectiveRate}%`, 6).padEnd(6, " "),
      clip(r.email || "-", 30),
    ].join(" ");
    lines.push(line);
    if (bsb !== "-" || acc !== "-") lines.push(`  bank: ${clip(bsb, 12)} / ${clip(acc, 16)}`);
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
