function getInitials(name) {
    const clean = String(name || '').trim();
    if (!clean) return 'AN';
    const parts = clean.split(/\s+/).filter(Boolean).slice(0, 2);
    return parts.map(part => part[0].toUpperCase()).join('');
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function starText(stars) {
    const value = Number(stars);
    const clamped = Math.max(1, Math.min(5, Number.isFinite(value) ? value : 1));
    return '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
}

function formatDate(isoDate) {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    }).format(date);
}

function renderReviews(reviews) {
    const list = document.getElementById('allReviewsList');
    const empty = document.getElementById('reviewsEmptyState');
    if (!list || !empty) return;

    if (!Array.isArray(reviews) || reviews.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    list.innerHTML = reviews.map(review => `
        <article class="review-card">
            <div class="review-header">
                <div class="reviewer-info">
                    <div class="reviewer-avatar">${escapeHtml(getInitials(review.name))}</div>
                    <div>
                        <h4 class="reviewer-name">${escapeHtml(review.name || 'Anonymous')}</h4>
                        <div class="review-stars">${starText(review.stars)}</div>
                    </div>
                </div>
            </div>
            <p class="review-text">${escapeHtml(review.description)}</p>
            <span class="review-date">${formatDate(review.createdAt)}</span>
        </article>
    `).join('');
}

async function loadReviews() {
    const response = await fetch('/api/reviews');
    const data = await parseResponseJson(response);
    if (!response.ok) {
        throw new Error(data.error || 'Failed to load reviews');
    }
    renderReviews(data.reviews || []);
}

async function parseResponseJson(response) {
    const text = await response.text();
    if (!text) return {};

    try {
        return JSON.parse(text);
    } catch {
        return {};
    }
}

function showFormMessage(message, isError = false) {
    const messageEl = document.getElementById('reviewFormMessage');
    if (!messageEl) return;
    messageEl.textContent = message;
    messageEl.classList.toggle('error', isError);
}

async function submitReview(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    showFormMessage('Submitting review...');

    const payload = {
        name: String(formData.get('name') || '').trim(),
        stars: Number(formData.get('stars')),
        description: String(formData.get('description') || '').trim()
    };

    try {
        const response = await fetch('/api/reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await parseResponseJson(response);

        if (!response.ok) {
            throw new Error(data.error || 'Failed to submit review');
        }

        form.reset();
        showFormMessage('Thanks for your feedback. Your review has been posted.');
        await loadReviews();
    } catch (error) {
        showFormMessage(error.message || 'Could not submit your review.', true);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('reviewForm');
    if (form) {
        form.addEventListener('submit', submitReview);
    }

    try {
        await loadReviews();
    } catch {
        showFormMessage('Could not load reviews right now. Please refresh and try again.', true);
    }
});
