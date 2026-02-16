/**
 * Cal.com API integration for CJ Detailing portal
 * Fetches past (revenue) and upcoming (jobs) bookings
 * 
 * Cal.com API key: Settings > Security in Cal.com
 * Add CAL_COM_API_KEY to .env
 */

require('dotenv').config();

const CAL_API = 'https://api.cal.com/v2/bookings';
const CAL_API_KEY = process.env.CAL_COM_API_KEY;

// Event type slugs to base price (single car)
const EVENT_PRICES = {
    'exterior-detail': 45,
    'exterior-detail-45-pay-cash': 45,
    'interior-detail': 75,
    'interior-detail-75-pay-cash': 75,
    'interior-exterior-detail': 100,
    'interior-exterior-detail-100-pay-cash': 100,
};

/** Get base price from event type slug */
function getBasePrice(eventType) {
    if (!eventType) return 0;
    const slug = typeof eventType === 'string' ? eventType : (eventType.slug || eventType.title || '');
    return EVENT_PRICES[slug] || 0;
}

/** Round up to nearest $5 */
function roundUp5(n) {
    return Math.ceil(n / 5) * 5;
}

/** Employee pay: 20% of total, rounded up to nearest $5 */
function calcEmployeePay(totalAmount, numCars = 1) {
    const total = totalAmount * numCars;
    const percent = total * 0.2;
    return roundUp5(percent);
}

/** Manager share: (total - employee pay) / 2 per manager */
function calcManagerShare(totalAmount, numCars, employeePay) {
    const total = totalAmount * numCars;
    const afterEmployee = total - employeePay;
    return afterEmployee / 2;
}

/** Extract number of cars from booking fields (Cal.com custom question) */
function getNumCarsFromBooking(booking) {
    const responses = booking.bookingFieldsResponses || booking.attendees?.[0]?.bookingFieldsResponses || {};
    const keys = Object.keys(responses).map((k) => k.toLowerCase());
    for (const k of keys) {
        if (
            k.includes('car') ||
            k.includes('number') ||
            k.includes('quantity') ||
            k.includes('how many')
        ) {
            const val = responses[k] || responses[Object.keys(responses).find((x) => x.toLowerCase() === k)];
            const n = parseInt(String(val).replace(/\D/g, ''), 10);
            return isNaN(n) || n < 1 ? 1 : n;
        }
    }
    return 1;
}

/** Fetch bookings from Cal.com API */
async function fetchBookings(status = 'past', options = {}) {
    if (!CAL_API_KEY) {
        console.warn('CAL_COM_API_KEY not set - Cal.com data will be empty');
        return { data: [], pagination: {} };
    }

    const params = new URLSearchParams({ status, take: 100 });
    if (options.afterStart) params.set('afterStart', options.afterStart);
    if (options.beforeEnd) params.set('beforeEnd', options.beforeEnd);

    const url = `${CAL_API}?${params.toString()}`;
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${CAL_API_KEY}`,
            'Content-Type': 'application/json',
            'cal-api-version': '2024-08-13',
        },
    });

    if (!res.ok) {
        const text = await res.text();
        console.error('Cal.com API error:', res.status, text);
        throw new Error(`Cal.com API error: ${res.status}`);
    }

    return res.json();
}

/** Get date range for period */
function getDateRange(period) {
    const now = new Date();
    let start, end;
    switch (period) {
        case 'week':
            start = new Date(now);
            start.setDate(start.getDate() - start.getDay());
            start.setHours(0, 0, 0, 0);
            end = new Date(start);
            end.setDate(end.getDate() + 7);
            break;
        case 'month':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            break;
        case 'year':
            start = new Date(now.getFullYear(), 0, 1);
            end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
            break;
        default:
            start = new Date(0);
            end = new Date();
    }
    return { start: start.toISOString(), end: end.toISOString() };
}

/** Get past bookings with revenue calculations */
async function getPastBookings(period = 'month') {
    const { start, end } = getDateRange(period);
    const result = await fetchBookings('past', { afterStart: start, beforeEnd: end });

    const bookings = result.data || [];
    let totalRevenue = 0;
    let totalEmployeePay = 0;
    const byBooking = [];

    for (const b of bookings) {
        if (b.status === 'cancelled') continue;

        const eventType = b.eventType || {};
        const slug = eventType.slug || eventType.title || '';
        const basePrice = getBasePrice(slug) || 0;
        const numCars = getNumCarsFromBooking(b);
        const amount = basePrice * numCars;
        const empPay = calcEmployeePay(basePrice, numCars);
        const managerShare = calcManagerShare(basePrice, numCars, empPay);

        totalRevenue += amount;
        totalEmployeePay += empPay;

        byBooking.push({
            id: b.uid || b.id,
            title: b.title,
            start: b.start,
            end: b.end,
            amount,
            numCars,
            employeePay: empPay,
            managerShare,
            slug,
        });
    }

    const totalManagerShare = totalRevenue - totalEmployeePay;
    const perManager = totalManagerShare / 2;

    return {
        totalRevenue,
        totalEmployeePay,
        totalManagerShare,
        perManager,
        bookings: byBooking,
        period,
    };
}

/** Get upcoming bookings for jobs list */
async function getUpcomingBookings() {
    const result = await fetchBookings('upcoming');
    const bookings = (result.data || []).filter((b) => b.status !== 'cancelled');

    return bookings.map((b) => {
        const eventType = b.eventType || {};
        const slug = eventType.slug || eventType.title || '';
        const basePrice = getBasePrice(slug) || 0;
        const numCars = getNumCarsFromBooking(b);
        const amount = basePrice * numCars;
        const empPay = calcEmployeePay(basePrice, numCars);
        const attendees = b.attendees || [];
        const location = b.location || '';

        return {
            id: b.uid || b.id,
            title: b.title,
            start: b.start,
            end: b.end,
            location,
            numCars,
            amount,
            employeePay: empPay,
            attendees: attendees.map((a) => ({ name: a.name, email: a.email })),
        };
    });
}

module.exports = {
    getPastBookings,
    getUpcomingBookings,
    calcEmployeePay,
    calcManagerShare,
    roundUp5,
};
