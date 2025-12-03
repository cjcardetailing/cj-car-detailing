# CJ Car Detailing Website

A modern, responsive car detailing website with booking functionality, portfolio showcase, customer reviews, and contact form.

## Features

- **Homepage** with hero section, features, and smooth scrolling navigation
- **Portfolio Gallery** showcasing past work with before/after examples
- **Customer Reviews** section with real testimonials
- **Contact Form** for customer inquiries
- **Booking System** with full backend integration:
  - Select date and time for service
  - Real-time slot availability checking
  - Prevents double-booking of time slots
  - Choose contact method (email or phone)
  - Provide full address for mobile service
  - Select service type and vehicle type
  - Add special instructions
  - Automatic email notifications to company

## Backend Features

- **SQLite Database** - Stores all bookings persistently
- **Slot Availability** - Prevents customers from booking already taken time slots
- **Email Notifications** - Automatically sends detailed booking information to `cjcardetailing.business@gmail.com`
- **RESTful API** - Clean API endpoints for booking management

## Getting Started

### Prerequisites

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)

### Installation

1. Navigate to the project directory:
   ```bash
   cd "Car Washing Website"
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up email configuration:
   - Copy `.env.example` to `.env` (if it doesn't exist, create a `.env` file)
   - Edit `.env` and add your email credentials (see Email Setup below)

4. Start the server:
   ```bash
   npm start
   ```

5. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

The server will start on port 3000 by default. The database (`bookings.db`) will be created automatically on first run.

### Email Setup

The booking system sends email notifications when a booking is made. You need to configure email settings in the `.env` file.

#### Option 1: Gmail (Recommended)

1. Create a `.env` file in the project root
2. Add the following:
   ```env
   EMAIL_SERVICE=gmail
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=your-app-password
   COMPANY_EMAIL=cjcardetailing.business@gmail.com
   PORT=3000
   ```

3. **Important**: For Gmail, you need to use an **App Password**, not your regular password:
   - Go to your Google Account settings
   - Security → 2-Step Verification (must be enabled)
   - App passwords → Generate a new app password
   - Use this app password in the `.env` file

#### Option 2: Custom SMTP

If you're using a different email provider:
```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-password
COMPANY_EMAIL=cjcardetailing.business@gmail.com
PORT=3000
```

**Note**: If email configuration is not set up, bookings will still be saved to the database, but email notifications will be skipped.

## File Structure

```
Car Washing Website/
├── index.html          # Homepage with portfolio, reviews, and contact
├── booking.html        # Dedicated booking page
├── styles.css          # All CSS styling
├── script.js           # Frontend JavaScript functionality
├── server.js           # Express.js backend server
├── database.js         # SQLite database operations
├── email.js            # Email notification functionality
├── package.json        # Node.js dependencies
├── .env                # Environment variables (create from .env.example)
├── .env.example        # Example environment configuration
├── .gitignore          # Git ignore rules
├── bookings.db         # SQLite database (created automatically)
└── README.md           # This file
```

## Customization

### Update Business Information

1. **Company Name**: CJ Car Detailing is already set throughout the files
2. **Contact Information**: Update phone, email, and address in:
   - `index.html` - Contact section
   - `booking.html` - Booking info sidebar

3. **Service Prices**: Update pricing in `booking.html` service type dropdown:
   ```html
   <option value="exterior">Exterior Wash Only - $25</option>
   ```

### Add Real Portfolio Images

Replace the placeholder divs in `index.html` portfolio section with actual images:

```html
<!-- Replace this -->
<div class="image-placeholder">...</div>

<!-- With this -->
<img src="path/to/your/image.jpg" alt="Portfolio item description">
```

### Modify Service Times

Edit the time options in `booking.html`:

```html
<select id="serviceTime" name="serviceTime">
    <option value="08:00">8:00 AM</option>
    <!-- Add or modify times -->
</select>
```

## How Booking Works

1. **Customer fills out booking form** on `booking.html`
2. **Frontend validates** the form data
3. **Availability check** - System checks if the selected date/time slot is available
4. **Booking creation** - If available, booking is saved to SQLite database
5. **Email notification** - Company email (`cjcardetailing.business@gmail.com`) receives detailed booking information
6. **Confirmation** - Customer sees success message

### Database

All bookings are stored in a SQLite database (`bookings.db`). The database includes:
- Customer information (name, contact method, email/phone)
- Service details (date, time, type, vehicle type)
- Service location (full address)
- Special instructions
- Booking status and timestamps

### API Endpoints

- `POST /api/bookings` - Create a new booking
- `POST /api/check-availability` - Check if a time slot is available
- `GET /api/bookings` - Get all bookings (for admin use)

### View Stored Bookings

You can view bookings by:
1. Using a SQLite browser tool (like [DB Browser for SQLite](https://sqlitebrowser.org/))
2. Or accessing the API endpoint: `GET http://localhost:3000/api/bookings`
3. Or adding an admin interface (future enhancement)

## Browser Compatibility

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Production Deployment

When deploying to production:

1. **Set environment variables** on your hosting platform
2. **Use a production database** (consider PostgreSQL or MySQL for better scalability)
3. **Set up proper email service** (SendGrid, Mailgun, or AWS SES)
4. **Enable HTTPS** for secure data transmission
5. **Set up process manager** (PM2, systemd, etc.) to keep server running
6. **Configure CORS** properly for your domain
7. **Set up backups** for the database

### Recommended Hosting Options

- **Heroku** - Easy deployment, supports Node.js
- **DigitalOcean** - VPS with full control
- **AWS/Google Cloud** - Scalable cloud hosting
- **Vercel/Netlify** - For frontend (would need separate backend)

## Future Enhancements

Consider adding:

- [x] Backend server integration for booking storage
- [x] Email notification system
- [ ] Admin dashboard to view/manage bookings
- [ ] Calendar integration for availability
- [ ] Payment processing
- [ ] Customer account system
- [ ] SMS notifications
- [ ] Real-time booking calendar
- [ ] Photo upload for portfolio
- [ ] Booking cancellation functionality
- [ ] Email confirmations to customers

## Support

For questions or issues, please contact your developer or refer to the code comments in the HTML, CSS, and JavaScript files.

## License

This website is created for CJ Car Detailing business use.

---

**Note**: Remember to replace placeholder contact information and add your actual business details before going live!

