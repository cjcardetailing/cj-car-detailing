# Quick Setup Guide

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Email

Create a `.env` file in the project root with the following content:

```env
# Gmail Configuration (Recommended)
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
COMPANY_EMAIL=cjcardetailing.business@gmail.com
PORT=3000
```

### Getting Gmail App Password:

1. Go to [Google Account Settings](https://myaccount.google.com/)
2. Click **Security** in the left sidebar
3. Enable **2-Step Verification** if not already enabled
4. Under **2-Step Verification**, click **App passwords**
5. Generate a new app password for "Mail"
6. Copy the 16-character password and use it in `.env`

**Important**: Use the App Password, NOT your regular Gmail password!

## Step 3: Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000`

## Step 4: Test the Booking System

1. Open `http://localhost:3000/booking.html`
2. Fill out the booking form
3. Submit a test booking
4. Check your email (`cjcardetailing.business@gmail.com`) for the notification

## Troubleshooting

### Email Not Sending?

- Verify your `.env` file exists and has correct values
- Make sure you're using an App Password for Gmail (not regular password)
- Check the server console for error messages
- Bookings will still be saved even if email fails

### Port Already in Use?

Change the port in `.env`:
```env
PORT=3001
```

### Database Issues?

The database (`bookings.db`) is created automatically. If you need to reset it:
1. Stop the server
2. Delete `bookings.db`
3. Restart the server

## Production Deployment

For production, consider:
- Using a more robust email service (SendGrid, Mailgun)
- Switching to PostgreSQL or MySQL
- Setting up proper environment variables on your hosting platform
- Enabling HTTPS
- Setting up a process manager (PM2)

