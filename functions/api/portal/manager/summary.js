import { requireRole } from "../../../_lib/requireAuth.js";
import { formatAUD } from "../../../_lib/money.js";
import { isManualPayTableMissingError } from "../../../_lib/manualPay.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;
  const managerUserId = Number(auth.user.id) || 0;

  // Use AU localtime for both booking time and "now"
  let week;
  let month;
  let year;
  try {
    const q = async (bookingsWhereSql, manualWhereSql) =>
      env.DB.prepare(
        `SELECT
           (
             COALESCE((
               SELECT SUM(ba.total_price_cents)
               FROM booking_assignments ba
               JOIN bookings b ON b.id = ba.booking_id
               WHERE ${bookingsWhereSql}
             ), 0)
           ) AS total_cents,
           (
             COALESCE((
               SELECT SUM(ba.employee_pay_cents)
               FROM booking_assignments ba
               JOIN bookings b ON b.id = ba.booking_id
               WHERE ${bookingsWhereSql}
             ), 0)
             +
             COALESCE((
               SELECT SUM(mpe.pay_cents)
               FROM manual_pay_entries mpe
               WHERE ${manualWhereSql}
             ), 0)
           ) AS employee_cents,
           (
             COALESCE((
               SELECT SUM(ba.manager_each_cents)
               FROM booking_assignments ba
               JOIN bookings b ON b.id = ba.booking_id
               WHERE ${bookingsWhereSql}
             ), 0)
           ) AS manager_each_cents,
          (
            COALESCE((
              SELECT SUM(mpe.pay_cents)
              FROM manual_pay_entries mpe
              WHERE ${manualWhereSql}
                AND mpe.employee_user_id = ${managerUserId}
            ), 0)
          ) AS my_manual_cents,
          (
            COALESCE((
              SELECT COUNT(*)
              FROM manual_pay_entries mpe
              WHERE ${manualWhereSql}
                AND mpe.employee_user_id = ${managerUserId}
            ), 0)
          ) AS my_manual_jobs,
           (
             COALESCE((
               SELECT COUNT(*)
               FROM booking_assignments ba
               JOIN bookings b ON b.id = ba.booking_id
               WHERE ${bookingsWhereSql}
             ), 0)
             +
             COALESCE((
               SELECT COUNT(*)
               FROM manual_pay_entries mpe
               WHERE ${manualWhereSql}
             ), 0)
           ) AS jobs`
      ).first();

    week = await q(`
      datetime(b.start_time,'localtime') >= datetime('now','localtime','weekday 1','-7 days')
      AND datetime(b.start_time,'localtime') <  datetime('now','localtime','weekday 1')
    `, `
      datetime(mpe.job_time,'localtime') >= datetime('now','localtime','weekday 1','-7 days')
      AND datetime(mpe.job_time,'localtime') <  datetime('now','localtime','weekday 1')
    `);

    month = await q(`
      strftime('%Y-%m', datetime(b.start_time,'localtime')) = strftime('%Y-%m','now','localtime')
    `, `
      strftime('%Y-%m', datetime(mpe.job_time,'localtime')) = strftime('%Y-%m','now','localtime')
    `);

    year = await q(`
      strftime('%Y', datetime(b.start_time,'localtime')) = strftime('%Y','now','localtime')
    `, `
      strftime('%Y', datetime(mpe.job_time,'localtime')) = strftime('%Y','now','localtime')
    `);

    // Dashboard card represents "Your earnings".
    // Add manual pay rows that were assigned directly to this manager account.
    for (const bucket of [week, month, year]) {
      bucket.manager_each_cents = Number(bucket.manager_each_cents || 0) + Number(bucket.my_manual_cents || 0);
      bucket.jobs = Number(bucket.jobs || 0) + Number(bucket.my_manual_jobs || 0);
    }
  } catch (err) {
    if (!isManualPayTableMissingError(err)) throw err;
    const q = async (whereSql) =>
      env.DB.prepare(
        `SELECT
           COALESCE(SUM(ba.total_price_cents),0) AS total_cents,
           COALESCE(SUM(ba.employee_pay_cents),0) AS employee_cents,
           COALESCE(SUM(ba.manager_each_cents),0) AS manager_each_cents,
           COALESCE(COUNT(*),0) AS jobs
         FROM booking_assignments ba
         JOIN bookings b ON b.id = ba.booking_id
         WHERE ${whereSql}`
      ).first();

    week = await q(`
      datetime(b.start_time,'localtime') >= datetime('now','localtime','weekday 1','-7 days')
      AND datetime(b.start_time,'localtime') <  datetime('now','localtime','weekday 1')
    `);
    month = await q(`
      strftime('%Y-%m', datetime(b.start_time,'localtime')) = strftime('%Y-%m','now','localtime')
    `);
    year = await q(`
      strftime('%Y', datetime(b.start_time,'localtime')) = strftime('%Y','now','localtime')
    `);
  }

  return new Response(JSON.stringify({
    ok: true,
    week:  { ...week,  total_fmt: formatAUD(week.total_cents),  employee_fmt: formatAUD(week.employee_cents),  manager_each_fmt: formatAUD(week.manager_each_cents) },
    month: { ...month, total_fmt: formatAUD(month.total_cents), employee_fmt: formatAUD(month.employee_cents), manager_each_fmt: formatAUD(month.manager_each_cents) },
    year:  { ...year,  total_fmt: formatAUD(year.total_cents),  employee_fmt: formatAUD(year.employee_cents),  manager_each_fmt: formatAUD(year.manager_each_cents) }
  }), { status: 200, headers: { "content-type": "application/json" } });
}
