export const sendOrderConfirmation = async ({
    name,
    email,
    orderId,
    items,
    storeEmail,
    storeName,
    totalOverride,
    slotLabel,
}: {
    name: string;
    email: string;
    orderId: string;
    items: any[];
    storeEmail: string;
    storeName?: string;
    totalOverride?: string;
    slotLabel?: string;
}) => {
    const itemSummary = items.map(i => `${i.quantity}x ${i.name}`).join(', ');
    const total = totalOverride || items.reduce((acc, item) => acc + (parseFloat(item.price) * item.quantity), 0).toFixed(2);
    const businessName = storeName || 'CleanPOS Store';

    const brevoApiKey = import.meta.env.VITE_BREVO_API_KEY;

    if (!brevoApiKey) {
        console.error('[Email Service] Brevo API Key not found in environment variables.');
        return;
    }

    const sendEmail = async (toEmail: string, isStore: boolean) => {
        const subject = isStore
            ? `NEW ORDER RECEIVED #${orderId}`
            : `Order Confirmation #${orderId} - ${businessName}`;

        const body = isStore
            ? `NEW ORDER RECEIVED\n\nNew order from ${name} (${email}).\nOrder ID: #${orderId}\n\nItems:\n${items.map(i => `- ${i.quantity}x ${i.name}`).join('\n')}\n\nCollection Slot: ${slotLabel || 'Not specified'}\nTotal Estimate: £${total}\n\nView details in the Back Office.`
            : `Thank you for your order!\n\nHi ${name},\n\nWe've received your booking and it's being processed. Here are your order details:\n\nOrder ID: #${orderId}\nCollection Slot: ${slotLabel || 'Not specified'}\n\nItems:\n${items.map(i => `- ${i.quantity}x ${i.name}`).join('\n')}\n\nTotal Estimate: £${total}\n\nWe will collect your items during your selected slot. If you have any questions, please contact us.\n\nBest regards,\n${businessName}`;

        try {
            const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': brevoApiKey,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: businessName, email: 'Info@posso.uk' },
                    to: [{ email: toEmail, name: isStore ? 'Store Admin' : name }],
                    subject: subject,
                    textContent: body
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error(`[Email Service] Failed to send email to ${toEmail}:`, errorData);
            } else {
                console.log(`[Email Service] Email sent successfully to ${toEmail}`);
            }
        } catch (error) {
            console.error(`[Email Service] Error sending email to ${toEmail}:`, error);
        }
    };

    // Send to Customer
    await sendEmail(email, false);

    // Send to Store
    if (storeEmail) {
        await sendEmail(storeEmail, true);
    } else {
        console.warn(`[Email Service] Store email not found in settings. Store notification skipped for Order ID: ${orderId}`);
    }
};

export const sendBrevoEmail = async ({
    toEmail,
    toName,
    subject,
    textContent,
}: {
    toEmail: string;
    toName: string;
    subject: string;
    textContent: string;
}) => {
    const brevoApiKey = import.meta.env.VITE_BREVO_API_KEY;

    if (!brevoApiKey) {
        console.error('[Email Service] Brevo API Key not found in environment variables.');
        return { success: false, error: 'API Key missing' };
    }

    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': brevoApiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: 'Class 1 Dry Cleaners', email: 'Info@posso.uk' },
                to: [{ email: toEmail, name: toName }],
                subject: subject,
                textContent: textContent
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error(`[Email Service] Failed to send generic email to ${toEmail}:`, errorData);
            return { success: false, error: errorData };
        } else {
            console.log(`[Email Service] Generic email sent successfully to ${toEmail}`);
            return { success: true };
        }
    } catch (error) {
        console.error(`[Email Service] Error sending generic email to ${toEmail}:`, error);
        return { success: false, error };
    }
};

export const sendCustomerSignupNotification = async ({
    customerName,
    customerEmail,
    customerPhone,
    storeEmail,
    storeName
}: {
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    storeEmail: string;
    storeName?: string;
}) => {
    if (!storeEmail) {
        console.warn('[Email Service] Store email not provided for signup notification.');
        return;
    }

    const businessName = storeName || 'CleanPOS Store';
    const subject = `New Customer Signup: ${customerName}`;
    const body = `Hooray! A new customer has signed up for ${businessName}.\n\n` +
        `Name: ${customerName}\n` +
        `Email: ${customerEmail}\n` +
        (customerPhone ? `Phone: ${customerPhone}\n` : '') +
        `\nLog in to your Back Office to view their details.`;

    await sendBrevoEmail({
        toEmail: storeEmail,
        toName: 'Store Owner',
        subject: subject,
        textContent: body
    });
};
