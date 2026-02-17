const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const { sendContactEmail } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;
const REVIEWS_FILE = path.join(__dirname, 'reviews-data.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// API Routes

async function ensureReviewsFile() {
    try {
        await fs.access(REVIEWS_FILE);
    } catch {
        await fs.writeFile(REVIEWS_FILE, '[]', 'utf8');
    }
}

async function readReviews() {
    await ensureReviewsFile();
    const raw = await fs.readFile(REVIEWS_FILE, 'utf8');
    const reviews = JSON.parse(raw);
    if (!Array.isArray(reviews)) return [];
    return reviews;
}

async function writeReviews(reviews) {
    await fs.writeFile(REVIEWS_FILE, JSON.stringify(reviews, null, 2), 'utf8');
}

// Get all customer reviews (bad and good)
app.get('/api/reviews', async (req, res) => {
    try {
        const reviews = await readReviews();
        reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.status(200).json({ success: true, reviews });
    } catch (error) {
        console.error('Error loading reviews:', error);
        res.status(500).json({ error: 'Failed to load reviews.' });
    }
});

// Submit a customer review
app.post('/api/reviews', async (req, res) => {
    try {
        const { name, stars, description } = req.body || {};
        const starsNumber = Number(stars);
        const cleanName = String(name || '').trim();
        const cleanDescription = String(description || '').trim();

        if (!Number.isInteger(starsNumber) || starsNumber < 1 || starsNumber > 5) {
            return res.status(400).json({ error: 'Please choose a star rating between 1 and 5.' });
        }

        if (!cleanDescription) {
            return res.status(400).json({ error: 'Review description is required.' });
        }

        if (cleanDescription.length > 1200) {
            return res.status(400).json({ error: 'Review description is too long.' });
        }

        const reviews = await readReviews();
        const newReview = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            name: cleanName || 'Anonymous',
            stars: starsNumber,
            description: cleanDescription,
            createdAt: new Date().toISOString()
        };

        reviews.push(newReview);
        await writeReviews(reviews);

        res.status(201).json({ success: true, review: newReview });
    } catch (error) {
        console.error('Error saving review:', error);
        res.status(500).json({ error: 'Failed to save review. Please try again later.' });
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

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Make sure to configure your email settings in the .env file`);
});
 
