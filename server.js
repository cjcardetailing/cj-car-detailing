const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase, createBooking, getBookings, checkSlotAvailability } = require('./database');
const { sendBookingEmail, sendContactEmail } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Initialize database on startup
initDatabase();

// API Routes

// Check if a time slot is available
app.post('/api/check-availability', async (req, res) => {
    try {
        const { serviceDate, serviceTime } = req.body;
        
        if (!serviceDate || !serviceTime) {
            return res.status(400).json({ 
                error: 'Service date and time are required' 
            });
        }

        const isAvailable = await checkSlotAvailability(serviceDate, serviceTime);
        
        res.json({ 
            available: isAvailable,
            date: serviceDate,
            time: serviceTime
        });
    } catch (error) {
        console.error('Error checking availability:', error);
        res.status(500).json({ error: 'Failed to check availability' });
    }
});

// Submit a booking
app.post('/api/bookings', async (req, res) => {
    try {
        const bookingData = req.body;

        // Validate required fields
        const requiredFields = ['customerName', 'serviceDate', 'serviceTime', 'serviceType', 'vehicleType', 'address', 'city', 'state', 'postcode'];
        for (const field of requiredFields) {
            if (!bookingData[field]) {
                return res.status(400).json({ 
                    error: `Missing required field: ${field}` 
                });
            }
        }

        // Check if contact method is provided
        if (!bookingData.contactMethod) {
            return res.status(400).json({ 
                error: 'Contact method is required' 
            });
        }

        if (bookingData.contactMethod === 'email' && !bookingData.email) {
            return res.status(400).json({ 
                error: 'Email is required when email contact method is selected' 
            });
        }

        if (bookingData.contactMethod === 'phone' && !bookingData.phone) {
            return res.status(400).json({ 
                error: 'Phone number is required when phone contact method is selected' 
            });
        }

        // Check if slot is still available
        const isAvailable = await checkSlotAvailability(bookingData.serviceDate, bookingData.serviceTime);
        if (!isAvailable) {
            return res.status(409).json({ 
                error: 'This time slot is no longer available. Please select another time.' 
            });
        }

        // Create booking
        let booking;
        try {
            booking = await createBooking(bookingData);
        } catch (error) {
            // Handle slot conflict specifically
            if (error.code === 'SLOT_TAKEN' || error.message.includes('UNIQUE constraint')) {
                return res.status(409).json({ 
                    error: 'This time slot is no longer available. Please select another time.' 
                });
            }
            throw error; // Re-throw other errors
        }

        // Send email notification
        try {
            await sendBookingEmail(booking);
        } catch (emailError) {
            console.error('Failed to send email notification:', emailError);
            // Don't fail the booking if email fails, but log it
        }

        res.status(201).json({ 
            success: true,
            message: 'Booking created successfully',
            booking: booking
        });
    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({ 
            error: 'Failed to create booking. Please try again later.' 
        });
    }
});

// Get all bookings (for admin purposes - you might want to add authentication)
app.get('/api/bookings', async (req, res) => {
    try {
        const bookings = await getBookings();
        res.json(bookings);
    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

// Submit contact form message
app.post('/api/contact', async (req, res) => {
    try {
        const contactData = req.body;

        // Validate required fields
        if (!contactData.name || !contactData.email || !contactData.message) {
            return res.status(400).json({ 
                error: 'Name, email, and message are required' 
            });
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(contactData.email)) {
            return res.status(400).json({ 
                error: 'Invalid email address' 
            });
        }

        // Add timestamp
        contactData.timestamp = new Date().toISOString();

        // Send email notification
        try {
            await sendContactEmail(contactData);
        } catch (emailError) {
            console.error('Failed to send contact email notification:', emailError);
            // Don't fail the contact submission if email fails, but log it
        }

        res.status(200).json({ 
            success: true,
            message: 'Your message has been sent successfully. We will get back to you soon!'
        });
    } catch (error) {
        console.error('Error processing contact form:', error);
        res.status(500).json({ 
            error: 'Failed to send message. Please try again later.' 
        });
    }
});

// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/booking.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'booking.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Make sure to configure your email settings in the .env file`);
});

