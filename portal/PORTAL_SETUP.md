# CJ Detailing Employee Portal – Setup Guide

## 1. Install Dependencies

```bash
npm install
```

## 2. Environment Variables

Add to your `.env` file:

```env
# Existing email settings...

# Portal auth (required in production)
JWT_SECRET=your-secure-random-secret-at-least-32-chars

# Cal.com API (for revenue & jobs data)
# Get from: Cal.com → Settings → Security → API Keys
CAL_COM_API_KEY=cal_live_xxxxx

# Portal base URL (for reset links & emails)
PORTAL_BASE_URL=https://cjdetailing.shop

# Optional: Manager emails for seed script
MANAGER1_EMAIL=your@email.com
MANAGER2_EMAIL=other@email.com
```

## 3. Seed Manager Accounts

Create the two manager accounts (`cj000001`, `cj000002`):

```bash
node portal/seed-managers.js
```

**IMPORTANT**: Save the printed passwords – they cannot be recovered. Store them in a password manager.

## 4. Cal.com Configuration

1. Go to [Cal.com Settings → Security](https://app.cal.com/settings/security) and create an API key.
2. Add it to `.env` as `CAL_COM_API_KEY`.
3. To capture **number of cars** per booking: add a custom question to your Cal.com event types (e.g. “How many cars?”) – the portal will try to extract this for multi-car pricing.

## 5. Run the Server

```bash
npm start
```

Visit **http://localhost:3000/portal** to log in (or your production URL).

## 6. Access & URLs

- **Login**: `/portal` or `https://cjdetailing.shop/portal`
- **Manager dashboard**: `/portal/manager.html`
- **Employee dashboard**: `/portal/employee.html`
- **Password reset**: `/portal/reset.html?token=...` (sent via email)

The portal is not linked from the main site – share the link only with managers and employees.

## Username Format

- **Managers**: `cj000001`, `cj000002` (no signup – pre-seeded)
- **Employees**: `cj100001`, `cj100002`, … (created by managers)

## Pay Calculation

- **Employee**: 20% of booking total, rounded up to nearest $5
- **Managers**: Remaining amount split 50/50
- Multi-car bookings: total = price × number of cars (from Cal.com question if available)
