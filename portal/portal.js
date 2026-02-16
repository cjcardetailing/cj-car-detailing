/**
 * Portal shared - auth, API client, redirects
 */

const API = '/api/portal';

function getToken() {
    return localStorage.getItem('portal_token') || sessionStorage.getItem('portal_token');
}

function getSessionToken() {
    return localStorage.getItem('portal_session');
}

function setTokens(token, sessionToken, remember) {
    if (remember && sessionToken) {
        localStorage.setItem('portal_token', token);
        localStorage.setItem('portal_session', sessionToken);
    } else {
        sessionStorage.setItem('portal_token', token);
    }
}

function clearAuth() {
    localStorage.removeItem('portal_token');
    localStorage.removeItem('portal_session');
    sessionStorage.removeItem('portal_token');
}

function getAuthHeader() {
    const token = getToken() || getSessionToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...getAuthHeader(), ...options.headers };
    const res = await fetch(API + url, { ...options, headers });
    if (res.status === 401) {
        clearAuth();
        window.location.href = '/portal/';
        throw new Error('Session expired');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

function isManager(username) {
    return /^cj0\d{5}$/.test(username);
}

function redirectByRole(user) {
    if (user.role === 'manager' || isManager(user.username)) {
        window.location.href = '/portal/manager.html';
    } else {
        window.location.href = '/portal/employee.html';
    }
}

function formatCurrency(n) {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n || 0);
}

function formatDate(s) {
    return new Date(s).toLocaleDateString('en-AU', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

if (typeof window !== 'undefined') {
    window.Portal = { API, getToken, getSessionToken, setTokens, clearAuth, getAuthHeader, api, isManager, redirectByRole, formatCurrency, formatDate };
}
