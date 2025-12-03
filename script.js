// Mobile Menu Toggle
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const navMenu = document.querySelector('.nav-menu');

    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
        });

        // Close menu when clicking on a link
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                navMenu.classList.remove('active');
            });
        });
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href !== '#' && href.length > 1) {
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    const offsetTop = target.offsetTop - 70; // Account for fixed navbar
                    window.scrollTo({
                        top: offsetTop,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });

    // Set minimum date for booking form (today)
    const serviceDateInput = document.getElementById('serviceDate');
    if (serviceDateInput) {
        const today = new Date().toISOString().split('T')[0];
        serviceDateInput.setAttribute('min', today);
    }

    // Contact method toggle (email/phone)
    const contactMethodRadios = document.querySelectorAll('input[name="contactMethod"]');
    const emailRow = document.getElementById('emailRow');
    const phoneRow = document.getElementById('phoneRow');
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');

    if (contactMethodRadios.length > 0) {
        contactMethodRadios.forEach(radio => {
            radio.addEventListener('change', function() {
                if (this.value === 'email') {
                    emailRow.style.display = 'block';
                    phoneRow.style.display = 'none';
                    emailInput.setAttribute('required', 'required');
                    phoneInput.removeAttribute('required');
                    phoneInput.value = '';
                } else {
                    emailRow.style.display = 'none';
                    phoneRow.style.display = 'block';
                    phoneInput.setAttribute('required', 'required');
                    emailInput.removeAttribute('required');
                    emailInput.value = '';
                }
            });
        });
    }

    // Auto-format Australian phone number
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            // Remove all non-digit characters
            let value = e.target.value.replace(/\D/g, '');
            
            // Limit to 10 digits (Australian mobile numbers)
            if (value.length > 10) {
                value = value.substring(0, 10);
            }
            
            // Format as 04XX XXX XXX (Australian mobile format)
            if (value.length > 0) {
                if (value.length <= 4) {
                    e.target.value = value;
                } else if (value.length <= 7) {
                    e.target.value = value.substring(0, 4) + ' ' + value.substring(4);
                } else {
                    e.target.value = value.substring(0, 4) + ' ' + value.substring(4, 7) + ' ' + value.substring(7);
                }
            } else {
                e.target.value = '';
            }
        });

        // Handle backspace to allow proper deletion
        phoneInput.addEventListener('keydown', function(e) {
            if (e.key === 'Backspace' && this.value.length > 0) {
                // If cursor is right after a space, delete the space and the digit before it
                const cursorPos = this.selectionStart;
                if (cursorPos > 0 && this.value[cursorPos - 1] === ' ') {
                    e.preventDefault();
                    const value = this.value.replace(/\D/g, '');
                    const newValue = value.substring(0, cursorPos - 2);
                    if (newValue.length <= 4) {
                        this.value = newValue;
                    } else if (newValue.length <= 7) {
                        this.value = newValue.substring(0, 4) + ' ' + newValue.substring(4);
                    } else {
                        this.value = newValue.substring(0, 4) + ' ' + newValue.substring(4, 7) + ' ' + newValue.substring(7);
                    }
                    this.setSelectionRange(cursorPos - 1, cursorPos - 1);
                }
            }
        });
    }

    // Service type description display
    const serviceTypeSelect = document.getElementById('serviceType');
    const serviceDescription = document.getElementById('serviceDescription');
    
    if (serviceTypeSelect && serviceDescription) {
        const serviceDescriptions = {
            'exterior': 'Complete exterior wash and clean of your vehicle.',
            'full': 'Full exterior wash plus comprehensive interior vacuum and clean.',
            'detail': 'Complete interior and exterior detail including premium leather cleaner, air freshener, tire shine, rim restoration, deep clean of cupholders and small spaces, and odour elimination.'
        };

        serviceTypeSelect.addEventListener('change', function() {
            const selectedService = this.value;
            if (selectedService && serviceDescriptions[selectedService]) {
                serviceDescription.textContent = serviceDescriptions[selectedService];
                serviceDescription.style.display = 'block';
            } else {
                serviceDescription.style.display = 'none';
            }
        });
    }

    // API base URL - adjust if your backend is on a different port
    const API_BASE_URL = window.location.origin.includes('localhost') 
        ? 'http://localhost:3000' 
        : window.location.origin;

    // Check slot availability when date or time changes
    const serviceTimeSelect = document.getElementById('serviceTime');
    let availabilityCheckTimeout;
    
    // All available time slots
    const timeSlots = [
        { value: '08:00', label: '8:00 AM' },
        { value: '09:30', label: '9:30 AM' },
        { value: '11:00', label: '11:00 AM' },
        { value: '12:30', label: '12:30 PM' },
        { value: '14:00', label: '2:00 PM' },
        { value: '15:30', label: '3:30 PM' },
        { value: '17:00', label: '5:00 PM' }
    ];

    // Check availability for all time slots when date is selected
    async function checkAllTimeSlots(serviceDate) {
        if (!serviceDate || !serviceTimeSelect) return;

        // Show loading state - reset all options first
        timeSlots.forEach(slot => {
            const option = serviceTimeSelect.querySelector(`option[value="${slot.value}"]`);
            if (option && option.value !== '') {
                option.disabled = false;
                option.classList.remove('unavailable');
                option.textContent = slot.label;
            }
        });

        // Check each time slot
        const availabilityPromises = timeSlots.map(async (slot) => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/check-availability`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ serviceDate, serviceTime: slot.value })
                });

                const data = await response.json();
                return {
                    value: slot.value,
                    label: slot.label,
                    available: data.available
                };
            } catch (error) {
                console.error(`Error checking availability for ${slot.value}:`, error);
                return {
                    value: slot.value,
                    label: slot.label,
                    available: true // Assume available on error
                };
            }
        });

        const results = await Promise.all(availabilityPromises);

        // Update time select options based on availability
        results.forEach(result => {
            const option = serviceTimeSelect.querySelector(`option[value="${result.value}"]`);
            if (option && option.value !== '') {
                if (!result.available) {
                    // Mark as unavailable: grey out and strikethrough
                    option.disabled = true;
                    option.classList.add('unavailable');
                    option.textContent = `${result.label} (Unavailable)`;
                    // Note: Inline styles for disabled options may not work in all browsers
                    // CSS class styling is the primary method
                } else {
                    // Available: normal styling
                    option.disabled = false;
                    option.classList.remove('unavailable');
                    option.textContent = result.label;
                }
            }
        });
    }

    function checkAvailability(serviceDate, serviceTime) {
        if (!serviceDate || !serviceTime) return;

        // Clear previous timeout
        if (availabilityCheckTimeout) {
            clearTimeout(availabilityCheckTimeout);
        }

        // Debounce the API call
        availabilityCheckTimeout = setTimeout(async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/check-availability`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ serviceDate, serviceTime })
                });

                const data = await response.json();
                
                if (!data.available) {
                    // Show warning that slot is taken
                    const option = serviceTimeSelect.options[serviceTimeSelect.selectedIndex];
                    if (option && option.value) {
                        const originalLabel = option.textContent.replace(' (Unavailable)', '');
                        option.disabled = true;
                        option.classList.add('unavailable');
                        option.textContent = `${originalLabel} (Unavailable)`;
                        // Reset selection
                        serviceTimeSelect.value = '';
                        // Show alert to user
                        alert('This time slot is no longer available. Please select another time.');
                    }
                }
            } catch (error) {
                console.error('Error checking availability:', error);
                // Silently fail - don't block user experience
            }
        }, 500);
    }

    // Add availability check listeners
    if (serviceDateInput && serviceTimeSelect) {
        serviceDateInput.addEventListener('change', function() {
            const selectedDate = this.value;
            if (selectedDate) {
                // Check all time slots for the selected date
                checkAllTimeSlots(selectedDate);
            } else {
                // Reset all options if no date selected
                timeSlots.forEach(slot => {
                    const option = serviceTimeSelect.querySelector(`option[value="${slot.value}"]`);
                    if (option && option.value !== '') {
                        option.disabled = false;
                        option.classList.remove('unavailable');
                        option.textContent = slot.label;
                    }
                });
            }
        });

        serviceTimeSelect.addEventListener('change', function() {
            if (serviceDateInput.value && this.value) {
                checkAvailability(serviceDateInput.value, this.value);
            }
        });
    }

    // Booking Form Submission
    const bookingForm = document.getElementById('bookingForm');
    if (bookingForm) {
        bookingForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            // Disable submit button to prevent double submission
            const submitButton = bookingForm.querySelector('button[type="submit"]');
            const originalButtonText = submitButton.textContent;
            submitButton.disabled = true;
            submitButton.textContent = 'Submitting...';

            try {
                // Get form data
                const formData = new FormData(bookingForm);
                const bookingData = {
                    customerName: formData.get('customerName'),
                    contactMethod: formData.get('contactMethod'),
                    email: formData.get('email'),
                    phone: formData.get('phone'),
                    serviceDate: formData.get('serviceDate'),
                    serviceTime: formData.get('serviceTime'),
                    serviceType: formData.get('serviceType'),
                    vehicleType: formData.get('vehicleType'),
                    address: formData.get('address'),
                    addressLine2: formData.get('addressLine2'),
                    city: formData.get('city'),
                    state: formData.get('state'),
                    postcode: formData.get('postcode'),
                    specialInstructions: formData.get('specialInstructions'),
                    newsletter: formData.get('newsletter') === 'on'
                };

                // Validate form
                if (!formData.get('terms')) {
                    alert('Please agree to the terms and conditions to continue.');
                    submitButton.disabled = false;
                    submitButton.textContent = originalButtonText;
                    return;
                }

                // Format phone number if provided
                if (bookingData.phone) {
                    const digits = bookingData.phone.replace(/\D/g, '');
                    if (digits.length === 10) {
                        bookingData.phone = digits.substring(0, 4) + ' ' + digits.substring(4, 7) + ' ' + digits.substring(7);
                    }
                }

                // Send booking to backend
                const response = await fetch(`${API_BASE_URL}/api/bookings`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(bookingData)
                });

                const result = await response.json();

                if (!response.ok) {
                    // Handle errors
                    if (response.status === 409) {
                        alert(result.error || 'This time slot is no longer available. Please select another time.');
                    } else {
                        alert(result.error || 'Failed to submit booking. Please try again later.');
                    }
                    submitButton.disabled = false;
                    submitButton.textContent = originalButtonText;
                    return;
                }

                // Format contact information for display
                const contactInfo = bookingData.contactMethod === 'email' 
                    ? `Email: ${bookingData.email}`
                    : `Phone: ${bookingData.phone}`;

                // Format address
                let fullAddress = bookingData.address;
                if (bookingData.addressLine2) {
                    fullAddress += `, ${bookingData.addressLine2}`;
                }
                fullAddress += `, ${bookingData.city}, ${bookingData.state} ${bookingData.postcode}`;

                // Format service date (Australian format)
                const dateObj = new Date(bookingData.serviceDate);
                const formattedDate = dateObj.toLocaleDateString('en-AU', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });

                // Map service type values to display names
                const serviceTypeNames = {
                    'exterior': 'Exterior Wash - $35',
                    'full': 'Exterior and Interior - $85',
                    'detail': 'Full Detail - $120'
                };

                const serviceTypeDisplay = serviceTypeNames[bookingData.serviceType] || bookingData.serviceType;

                // Create confirmation message
                const confirmationMessage = `Booking Request Submitted Successfully

Customer: ${bookingData.customerName}
Contact: ${contactInfo}
Service Date: ${formattedDate}
Service Time: ${bookingData.serviceTime}
Service Type: ${serviceTypeDisplay}
Vehicle Type: ${bookingData.vehicleType.charAt(0).toUpperCase() + bookingData.vehicleType.slice(1)}

Service Address:
${fullAddress}

${bookingData.specialInstructions ? `Special Instructions: ${bookingData.specialInstructions}` : ''}

We will contact you within 24 hours to confirm your booking.
Thank you for choosing CJ Car Detailing.`;

                // Show success message
                showSuccessMessage(confirmationMessage);

                // Reset form
                bookingForm.reset();

                // Reset date min attribute
                if (serviceDateInput) {
                    const today = new Date().toISOString().split('T')[0];
                    serviceDateInput.setAttribute('min', today);
                }

                // Reset contact method to email
                if (contactMethodRadios.length > 0) {
                    contactMethodRadios[0].checked = true;
                    if (emailRow) emailRow.style.display = 'block';
                    if (phoneRow) phoneRow.style.display = 'none';
                    if (emailInput) emailInput.setAttribute('required', 'required');
                    if (phoneInput) phoneInput.removeAttribute('required');
                }

                // Scroll to top
                window.scrollTo({ top: 0, behavior: 'smooth' });

            } catch (error) {
                console.error('Error submitting booking:', error);
                alert('An error occurred while submitting your booking. Please check your connection and try again.');
            } finally {
                // Re-enable submit button
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
            }
        });
    }

    // Contact Form Submission
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            // Disable submit button to prevent double submission
            const submitButton = contactForm.querySelector('button[type="submit"]');
            const originalButtonText = submitButton.textContent;
            submitButton.disabled = true;
            submitButton.textContent = 'Sending...';

            try {
                const formData = new FormData(contactForm);
                const contactData = {
                    name: formData.get('name'),
                    email: formData.get('email'),
                    phone: formData.get('phone') || null,
                    message: formData.get('message')
                };

                // Send contact message to backend
                const response = await fetch(`${API_BASE_URL}/api/contact`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(contactData)
                });

                const result = await response.json();

                if (!response.ok) {
                    alert(result.error || 'Failed to send message. Please try again later.');
                    submitButton.disabled = false;
                    submitButton.textContent = originalButtonText;
                    return;
                }

                // Show success message
                alert(result.message || 'Thank you for your message! We will get back to you soon.');

                // Reset form
                contactForm.reset();

            } catch (error) {
                console.error('Error submitting contact form:', error);
                alert('An error occurred while sending your message. Please check your connection and try again.');
            } finally {
                // Re-enable submit button
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
            }
        });
    }

    // Navbar scroll effect
    let lastScroll = 0;
    const navbar = document.querySelector('.navbar');

    window.addEventListener('scroll', function() {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 100) {
            navbar.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.2)';
        } else {
            navbar.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        }

        lastScroll = currentScroll;
    });

    // Animate elements on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe portfolio items and review cards
    document.querySelectorAll('.portfolio-item, .review-card, .feature-card').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});

// Function to show success message
function showSuccessMessage(message) {
    // Create success message element
    let successDiv = document.querySelector('.success-message');
    
    if (!successDiv) {
        successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        
        const bookingHeader = document.querySelector('.booking-header');
        if (bookingHeader) {
            bookingHeader.insertAdjacentElement('afterend', successDiv);
        } else {
            document.body.insertAdjacentElement('afterbegin', successDiv);
        }
    }

    successDiv.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 1rem;">
            <div style="flex: 1;">
                <h3 style="margin-bottom: 0.75rem; font-size: 1.25rem; font-weight: 600;">Booking Confirmation</h3>
                <pre style="white-space: pre-wrap; font-family: inherit; margin: 0; line-height: 1.8; font-size: 0.95rem;">${message}</pre>
            </div>
        </div>
    `;
    
    successDiv.classList.add('show');

    // Scroll to message
    successDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Hide message after 10 seconds
    setTimeout(() => {
        successDiv.classList.remove('show');
        setTimeout(() => {
            successDiv.innerHTML = '';
        }, 300);
    }, 10000);
}

