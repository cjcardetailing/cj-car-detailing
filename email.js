const nodemailer = require('nodemailer');
require('dotenv').config();

// Create transporter for sending emails
function createTransporter() {
    // Check if using Gmail with App Password
    if (process.env.EMAIL_SERVICE === 'gmail' && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
        return nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD // Use App Password, not regular password
            }
        });
    }

    // Generic SMTP configuration
    if (process.env.SMTP_HOST) {
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });
    }

    // Fallback: If no email configuration, return null (email sending will be skipped)
    console.warn('No email configuration found. Email notifications will be disabled.');
    return null;
}

// Format service type for display
function formatServiceType(serviceType) {
    const serviceTypes = {
        'exterior': 'Exterior Wash - $35',
        'full': 'Exterior and Interior - $85',
        'detail': 'Full Detail - $120'
    };
    return serviceTypes[serviceType] || serviceType;
}

// Format date for display
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-AU', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Send booking notification email to company
async function sendBookingEmail(booking) {
    const transporter = createTransporter();
    
    if (!transporter) {
        console.log('Email transporter not configured. Skipping email send.');
        return;
    }

    // Format contact information
    const contactInfo = booking.contactMethod === 'email'
        ? `Email: ${booking.email}`
        : `Phone: ${booking.phone}`;

    // Format full address
    let fullAddress = booking.address;
    if (booking.addressLine2) {
        fullAddress += `, ${booking.addressLine2}`;
    }
    fullAddress += `\n${booking.city}, ${booking.state} ${booking.postcode}`;

    // Create email content
    const emailSubject = `New Booking Request - ${booking.customerName}`;
    
    const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #1a365d; color: white; padding: 20px; text-align: center; }
                .content { background-color: #f9f9f9; padding: 20px; }
                .section { margin-bottom: 20px; }
                .label { font-weight: bold; color: #1a365d; }
                .value { margin-left: 10px; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>New Booking Request</h2>
                </div>
                <div class="content">
                    <div class="section">
                        <h3>Customer Information</h3>
                        <p><span class="label">Name:</span><span class="value">${booking.customerName}</span></p>
                        <p><span class="label">Contact:</span><span class="value">${contactInfo}</span></p>
                    </div>
                    
                    <div class="section">
                        <h3>Service Details</h3>
                        <p><span class="label">Date:</span><span class="value">${formatDate(booking.serviceDate)}</span></p>
                        <p><span class="label">Time:</span><span class="value">${booking.serviceTime}</span></p>
                        <p><span class="label">Service Type:</span><span class="value">${formatServiceType(booking.serviceType)}</span></p>
                        <p><span class="label">Vehicle Type:</span><span class="value">${booking.vehicleType.charAt(0).toUpperCase() + booking.vehicleType.slice(1)}</span></p>
                    </div>
                    
                    <div class="section">
                        <h3>Service Location</h3>
                        <p><span class="label">Address:</span></p>
                        <p class="value" style="white-space: pre-line;">${fullAddress}</p>
                        ${booking.specialInstructions ? `<p><span class="label">Special Instructions:</span></p><p class="value">${booking.specialInstructions}</p>` : ''}
                    </div>
                    
                    <div class="section">
                        <h3>Additional Information</h3>
                        <p><span class="label">Newsletter Subscription:</span><span class="value">${booking.newsletter ? 'Yes' : 'No'}</span></p>
                        <p><span class="label">Booking ID:</span><span class="value">${booking.id}</span></p>
                        <p><span class="label">Submitted:</span><span class="value">${new Date(booking.createdAt).toLocaleString('en-AU')}</span></p>
                    </div>
                </div>
                <div class="footer">
                    <p>This is an automated notification from your booking system.</p>
                    <p>Please contact the customer to confirm the booking.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    const emailText = `
New Booking Request

Customer Information:
- Name: ${booking.customerName}
- Contact: ${contactInfo}

Service Details:
- Date: ${formatDate(booking.serviceDate)}
- Time: ${booking.serviceTime}
- Service Type: ${formatServiceType(booking.serviceType)}
- Vehicle Type: ${booking.vehicleType.charAt(0).toUpperCase() + booking.vehicleType.slice(1)}

Service Location:
${fullAddress}
${booking.specialInstructions ? `\nSpecial Instructions: ${booking.specialInstructions}` : ''}

Additional Information:
- Newsletter Subscription: ${booking.newsletter ? 'Yes' : 'No'}
- Booking ID: ${booking.id}
- Submitted: ${new Date(booking.createdAt).toLocaleString('en-AU')}

Please contact the customer to confirm the booking.
    `.trim();

    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@cjcardetailing.com.au',
        to: process.env.COMPANY_EMAIL || 'cjcardetailing.business@gmail.com',
        subject: emailSubject,
        text: emailText,
        html: emailHtml
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Booking email sent successfully:', info.messageId);
        return info;
    } catch (error) {
        console.error('Error sending booking email:', error);
        throw error;
    }
}

// Send contact form message email to company
async function sendContactEmail(contactData) {
    const transporter = createTransporter();
    
    if (!transporter) {
        console.log('Email transporter not configured. Skipping email send.');
        return;
    }

    const emailSubject = `New Contact Form Message - ${contactData.name}`;
    
    const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #1a365d; color: white; padding: 20px; text-align: center; }
                .content { background-color: #f9f9f9; padding: 20px; }
                .section { margin-bottom: 20px; }
                .label { font-weight: bold; color: #1a365d; }
                .value { margin-left: 10px; }
                .message-box { background-color: white; padding: 15px; border-left: 4px solid #1a365d; margin-top: 10px; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>New Contact Form Message</h2>
                </div>
                <div class="content">
                    <div class="section">
                        <h3>Contact Information</h3>
                        <p><span class="label">Name:</span><span class="value">${contactData.name}</span></p>
                        <p><span class="label">Email:</span><span class="value">${contactData.email}</span></p>
                        ${contactData.phone ? `<p><span class="label">Phone:</span><span class="value">${contactData.phone}</span></p>` : ''}
                    </div>
                    
                    <div class="section">
                        <h3>Message</h3>
                        <div class="message-box">
                            ${contactData.message.replace(/\n/g, '<br>')}
                        </div>
                    </div>
                    
                    <div class="section">
                        <p><span class="label">Submitted:</span><span class="value">${new Date(contactData.timestamp || new Date()).toLocaleString('en-AU')}</span></p>
                    </div>
                </div>
                <div class="footer">
                    <p>This is an automated notification from your website contact form.</p>
                    <p>Please reply directly to the customer's email: ${contactData.email}</p>
                </div>
            </div>
        </body>
        </html>
    `;

    const emailText = `
New Contact Form Message

Contact Information:
- Name: ${contactData.name}
- Email: ${contactData.email}
${contactData.phone ? `- Phone: ${contactData.phone}` : ''}

Message:
${contactData.message}

Submitted: ${new Date(contactData.timestamp || new Date()).toLocaleString('en-AU')}

Please reply directly to the customer's email: ${contactData.email}
    `.trim();

    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@cjcardetailing.com.au',
        to: process.env.COMPANY_EMAIL || 'cjcardetailing.business@gmail.com',
        replyTo: contactData.email, // Allow easy reply to customer
        subject: emailSubject,
        text: emailText,
        html: emailHtml
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Contact email sent successfully:', info.messageId);
        return info;
    } catch (error) {
        console.error('Error sending contact email:', error);
        throw error;
    }
}

module.exports = {
    sendBookingEmail,
    sendContactEmail
};

