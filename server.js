const express = require('express');
const cors = require('cors');
const path = require('path');
const { sendContactEmail } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// API Routes

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

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Make sure to configure your email settings in the .env file`);
});

