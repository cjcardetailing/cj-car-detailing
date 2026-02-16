import { requireRole } from "../../../_lib/requireAuth.js";
import { formatAUD } from "../../../_lib/money.js";
import { isManualPayTableMissingError } from "../../../_lib/manualPay.js";

export async function onRequestGet(context){
  const { env, request } = context;
  const auth = await requireRole(env, request, "EMPLOYEE");
  if (!auth.ok) return auth.res;

  // NOTE: totals should include completed jobs too (so employee sees real pay history)
  let week;
  let month;
  let year;
  try {
    const q = async (bookingsWhereSql, manualWhereSql) =>
      env.DB.prepare(
        `SELECT
           (
             COALESCE((
               SELECT SUM(ba.employee_pay_cents)
               FROM booking_assignments ba
               JOIN bookings b ON b.id = ba.booking_id
               WHERE ba.employee_user_id = ?
                 AND ${bookingsWhereSql}
             ), 0)
             +
             COALESCE((
               SELECT SUM(mpe.pay_cents)
               FROM manual_pay_entries mpe
               WHERE mpe.employee_user_id = ?
                 AND ${manualWhereSql}
             ), 0)
           ) AS pay_cents,
           (
             COALESCE((
               SELECT COUNT(*)
               FROM booking_assignments ba
               JOIN bookings b ON b.id = ba.booking_id
               WHERE ba.employee_user_id = ?
                 AND ${bookingsWhereSql}
             ), 0)
             +
             COALESCE((
               SELECT COUNT(*)
               FROM manual_pay_entries mpe
               WHERE mpe.employee_user_id = ?
                 AND ${manualWhereSql}
             ), 0)
           ) AS jobs`
      ).bind(auth.user.id, auth.user.id, auth.user.id, auth.user.id).first();

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
  } catch (err) {
    if (!isManualPayTableMissingError(err)) throw err;
    const q = async (whereSql) =>
      env.DB.prepare(
        `SELECT COALESCE(SUM(ba.employee_pay_cents),0) AS pay_cents,
                COALESCE(COUNT(*),0) AS jobs
         FROM booking_assignments ba
         JOIN bookings b ON b.id = ba.booking_id
         WHERE ba.employee_user_id = ?
           AND ${whereSql}`
      ).bind(auth.user.id).first();

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
    ok:true,
    week: { ...week, pay_fmt: formatAUD(week.pay_cents) },
    month:{ ...month, pay_fmt: formatAUD(month.pay_cents) },
    year: { ...year, pay_fmt: formatAUD(year.pay_cents) }
  }), { status:200, headers:{ "content-type":"application/json" }});
}
