import logger from '../utils/logger';

export const sendOrderConfirmation = async ({
    name,
    email,
    orderId,
    items,
    storeEmail,
    storeName,
    totalOverride,
    slotLabel,
    trackingUrl,
}: {
    name: string;
    email: string;
    orderId: string;
    items: any[];
    storeEmail: string;
    storeName?: string;
    totalOverride?: string;
    slotLabel?: string;
    trackingUrl?: string;
}) => {
    const total = totalOverride || items.reduce((acc, item) => acc + (parseFloat(item.price) * item.quantity), 0).toFixed(2);
    const businessName = storeName || 'CleanPOS Store';
    const firstName = name.split(' ')[0];

    const brevoApiKey = import.meta.env.VITE_BREVO_API_KEY;

    if (!brevoApiKey) {
        logger.error('[Email Service] Brevo API Key not found in environment variables.');
        return;
    }

    // Beautiful HTML email for customer
    const customerHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:40px 40px 30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:800;letter-spacing:-0.5px;">${businessName}</h1>
          <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Professional Dry Cleaning & Laundry</p>
        </td></tr>

        <!-- Success Banner -->
        <tr><td style="padding:30px 40px 0;">
          <div style="background:#ecfdf5;border:2px solid #86efac;border-radius:12px;padding:20px;text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">✅</div>
            <h2 style="color:#166534;margin:0;font-size:22px;font-weight:700;">Order Confirmed!</h2>
            <p style="color:#15803d;margin:6px 0 0;font-size:14px;">Thank you, ${firstName}. We've received your booking.</p>
          </div>
        </td></tr>

        <!-- Order Details -->
        <tr><td style="padding:30px 40px 0;">
          <div style="background:#f8fafc;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:16px;border-bottom:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Order Number</span><br>
                  <span style="color:#1e3a5f;font-size:24px;font-weight:800;">#${orderId}</span>
                </td>
                <td style="padding-bottom:16px;border-bottom:1px solid #e2e8f0;text-align:right;">
                  <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Collection Slot</span><br>
                  <span style="color:#334155;font-size:16px;font-weight:600;">${slotLabel || 'To be confirmed'}</span>
                </td>
              </tr>
            </table>

            <!-- Items -->
            <div style="margin-top:20px;">
              <p style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Your Items</p>
              ${items.map(i => `
              <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9;">
                <span style="color:#334155;font-size:14px;font-weight:500;">
                  <span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:700;margin-right:8px;">${i.quantity}x</span>
                  ${i.name}
                </span>
                <span style="color:#1e3a5f;font-size:14px;font-weight:700;">£${(parseFloat(i.price) * i.quantity).toFixed(2)}</span>
              </div>`).join('')}

              <!-- Total -->
              <div style="margin-top:16px;padding-top:16px;border-top:2px solid #1e3a5f;">
                <table width="100%"><tr>
                  <td style="color:#1e3a5f;font-size:18px;font-weight:800;">Total Estimate</td>
                  <td style="text-align:right;color:#1e3a5f;font-size:22px;font-weight:800;">£${total}</td>
                </tr></table>
              </div>
            </div>
          </div>
        </td></tr>

        ${trackingUrl ? `
        <!-- Track Order Button -->
        <tr><td style="padding:30px 40px 0;text-align:center;">
          <a href="${trackingUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);color:#ffffff;text-decoration:none;padding:16px 48px;border-radius:12px;font-size:16px;font-weight:700;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(37,99,235,0.4);">
            🔍 Track Your Order
          </a>
          <p style="color:#94a3b8;font-size:12px;margin:12px 0 0;">View live updates on your order status</p>
        </td></tr>` : ''}

        <!-- What's Next -->
        <tr><td style="padding:30px 40px 0;">
          <h3 style="color:#1e3a5f;font-size:16px;font-weight:700;margin:0 0 16px;">What happens next?</h3>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:12px 0;vertical-align:top;width:40px;">
                <div style="width:32px;height:32px;background:#dbeafe;border-radius:50%;text-align:center;line-height:32px;font-size:16px;">🚐</div>
              </td>
              <td style="padding:12px 0 12px 12px;">
                <strong style="color:#334155;font-size:14px;">Collection</strong>
                <p style="color:#64748b;font-size:13px;margin:2px 0 0;">A driver will collect your items from your address</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 0;vertical-align:top;width:40px;">
                <div style="width:32px;height:32px;background:#e0e7ff;border-radius:50%;text-align:center;line-height:32px;font-size:16px;">👔</div>
              </td>
              <td style="padding:12px 0 12px 12px;">
                <strong style="color:#334155;font-size:14px;">Professional Cleaning</strong>
                <p style="color:#64748b;font-size:13px;margin:2px 0 0;">Your items are expertly cleaned and pressed</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 0;vertical-align:top;width:40px;">
                <div style="width:32px;height:32px;background:#d1fae5;border-radius:50%;text-align:center;line-height:32px;font-size:16px;">📦</div>
              </td>
              <td style="padding:12px 0 12px 12px;">
                <strong style="color:#334155;font-size:14px;">Delivery</strong>
                <p style="color:#64748b;font-size:13px;margin:2px 0 0;">Freshly cleaned items delivered back to your door</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:30px 40px 40px;">
          <div style="border-top:1px solid #e2e8f0;padding-top:24px;text-align:center;">
            <p style="color:#94a3b8;font-size:12px;margin:0;">Questions? Simply reply to this email or contact us directly.</p>
            <p style="color:#cbd5e1;font-size:11px;margin:12px 0 0;">© ${new Date().getFullYear()} ${businessName}. All rights reserved.</p>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // Plain text store notification (admin doesn't need fancy HTML)
    const storeText = `NEW ORDER RECEIVED\n\nNew order from ${name} (${email}).\nOrder ID: #${orderId}\n\nItems:\n${items.map(i => `- ${i.quantity}x ${i.name}`).join('\n')}\n\nCollection Slot: ${slotLabel || 'Not specified'}\nTotal Estimate: £${total}\n\nView details in the Back Office.`;

    // Send to Customer (HTML)
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
                to: [{ email: email, name: name }],
                subject: `Order Confirmed ✓ #${orderId} — ${businessName}`,
                htmlContent: customerHtml
            })
        });
        if (!response.ok) {
            const errorData = await response.json();
            logger.error(`[Email Service] Failed to send customer email:`, errorData);
        } else {
            logger.debug(`[Email Service] Customer email sent to ${email}`);
        }
    } catch (error) {
        logger.error(`[Email Service] Error sending customer email:`, error);
    }

    // Send to Store (plain text)
    if (storeEmail) {
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
                    to: [{ email: storeEmail, name: 'Store Admin' }],
                    subject: `NEW ORDER RECEIVED #${orderId}`,
                    textContent: storeText
                })
            });
            if (!response.ok) {
                const errorData = await response.json();
                logger.error(`[Email Service] Failed to send store email:`, errorData);
            }
        } catch (error) {
            logger.error(`[Email Service] Error sending store email:`, error);
        }
    }
};

export const sendBrevoEmail = async ({
    toEmail,
    toName,
    subject,
    textContent,
    htmlContent,
    senderName,
}: {
    toEmail: string;
    toName: string;
    subject: string;
    textContent?: string;
    htmlContent?: string;
    senderName?: string;
}) => {
    const brevoApiKey = import.meta.env.VITE_BREVO_API_KEY;

    if (!brevoApiKey) {
        logger.error('[Email Service] Brevo API Key not found in environment variables.');
        return { success: false, error: 'API Key missing' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(toEmail)) {
        logger.error(`[Email Service] Invalid email format: ${toEmail}`);
        return { success: false, error: 'Invalid email format' };
    }

    try {
        const emailPayload: any = {
            sender: { name: senderName || 'CleanPOS', email: 'Info@posso.uk' },
            to: [{ email: toEmail, name: toName }],
            subject: subject,
        };
        if (htmlContent) emailPayload.htmlContent = htmlContent;
        if (textContent) emailPayload.textContent = textContent;

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': brevoApiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify(emailPayload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            logger.error(`[Email Service] Failed to send email to ${toEmail}:`, errorData);
            return { success: false, error: errorData };
        } else {
            logger.debug(`[Email Service] Email sent successfully to ${toEmail}`);
            return { success: true };
        }
    } catch (error) {
        logger.error(`[Email Service] Error sending email to ${toEmail}:`, error);
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
        logger.warn('[Email Service] Store email not provided for signup notification.');
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

export const sendCustomerWelcomeEmail = async ({
    customerName,
    customerEmail,
    storeName,
    voucherCode
}: {
    customerName: string;
    customerEmail: string;
    storeName?: string;
    voucherCode: string;
}) => {
    const businessName = storeName || 'CleanPOS Store';
    const firstName = customerName.split(' ')[0];

    const subject = `Welcome to ${businessName}! Here's 10% off your first order 🎉`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:40px 40px 30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:800;letter-spacing:-0.5px;">${businessName}</h1>
          <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Professional Dry Cleaning & Laundry</p>
        </td></tr>

        <!-- Welcome Banner -->
        <tr><td style="padding:30px 40px 0;">
          <div style="background:#ecfdf5;border:2px solid #86efac;border-radius:12px;padding:24px;text-align:center;">
            <div style="font-size:48px;margin-bottom:8px;">🎉</div>
            <h2 style="color:#166534;margin:0;font-size:22px;font-weight:700;">Welcome, ${firstName}!</h2>
            <p style="color:#15803d;margin:8px 0 0;font-size:14px;">You're all set. Your account is ready to go.</p>
          </div>
        </td></tr>

        <!-- Voucher Code -->
        <tr><td style="padding:30px 40px 0;">
          <div style="background:linear-gradient(135deg,#faf5ff 0%,#ede9fe 100%);border:2px dashed #8b5cf6;border-radius:12px;padding:24px;text-align:center;">
            <p style="color:#6d28d9;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">Your Exclusive Welcome Offer</p>
            <p style="color:#5b21b6;font-size:32px;font-weight:900;margin:0;letter-spacing:1px;">10% OFF</p>
            <p style="color:#7c3aed;font-size:13px;margin:4px 0 16px;">your first order</p>
            <div style="background:#ffffff;border-radius:8px;padding:14px 24px;display:inline-block;border:2px solid #8b5cf6;">
              <span style="color:#5b21b6;font-size:22px;font-weight:900;letter-spacing:3px;font-family:monospace;">${voucherCode}</span>
            </div>
            <p style="color:#8b5cf6;font-size:12px;margin:12px 0 0;">Enter this code at checkout to claim your discount</p>
          </div>
        </td></tr>

        <!-- What You Can Do -->
        <tr><td style="padding:30px 40px 0;">
          <h3 style="color:#1e3a5f;font-size:16px;font-weight:700;margin:0 0 16px;">What you can do with your account</h3>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:12px 0;vertical-align:top;width:40px;">
                <div style="width:36px;height:36px;background:#dbeafe;border-radius:50%;text-align:center;line-height:36px;font-size:18px;">📱</div>
              </td>
              <td style="padding:12px 0 12px 12px;">
                <strong style="color:#334155;font-size:14px;">Book Online</strong>
                <p style="color:#64748b;font-size:13px;margin:2px 0 0;">Schedule collections & deliveries from your phone or laptop</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 0;vertical-align:top;width:40px;">
                <div style="width:36px;height:36px;background:#e0e7ff;border-radius:50%;text-align:center;line-height:36px;font-size:18px;">📍</div>
              </td>
              <td style="padding:12px 0 12px 12px;">
                <strong style="color:#334155;font-size:14px;">Track Orders Live</strong>
                <p style="color:#64748b;font-size:13px;margin:2px 0 0;">Real-time updates from collection to delivery</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 0;vertical-align:top;width:40px;">
                <div style="width:36px;height:36px;background:#fef3c7;border-radius:50%;text-align:center;line-height:36px;font-size:18px;">⭐</div>
              </td>
              <td style="padding:12px 0 12px 12px;">
                <strong style="color:#334155;font-size:14px;">Earn Loyalty Points</strong>
                <p style="color:#64748b;font-size:13px;margin:2px 0 0;">Get rewarded every time you place an order</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 0;vertical-align:top;width:40px;">
                <div style="width:36px;height:36px;background:#d1fae5;border-radius:50%;text-align:center;line-height:36px;font-size:18px;">📋</div>
              </td>
              <td style="padding:12px 0 12px 12px;">
                <strong style="color:#334155;font-size:14px;">Order History</strong>
                <p style="color:#64748b;font-size:13px;margin:2px 0 0;">View past orders, receipts, and invoices anytime</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:30px 40px 40px;">
          <div style="border-top:1px solid #e2e8f0;padding-top:24px;text-align:center;">
            <p style="color:#64748b;font-size:14px;font-weight:600;margin:0 0 8px;">We look forward to providing you with a spotless service! ✨</p>
            <p style="color:#94a3b8;font-size:12px;margin:0;">Questions? Simply reply to this email or contact us directly.</p>
            <p style="color:#cbd5e1;font-size:11px;margin:12px 0 0;">&copy; ${new Date().getFullYear()} ${businessName}. All rights reserved.</p>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await sendBrevoEmail({
        toEmail: customerEmail,
        toName: customerName,
        subject: subject,
        htmlContent: htmlContent,
        senderName: businessName
    });
};

export const sendStoreWelcomeEmail = async ({
    businessName,
    email,
    subdomain
}: {
    businessName: string;
    email: string;
    subdomain: string;
}) => {
    const storeUrl = `https://xp-clean.web.app/?tenant=${subdomain}`;

    const subject = `Welcome to CleanPOS — ${businessName} is Live! 🚀`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:40px 40px 30px;text-align:center;">
          <div style="font-size:48px;margin-bottom:12px;">🚀</div>
          <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:800;letter-spacing:-0.5px;">Welcome to CleanPOS</h1>
          <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Your laundry & dry cleaning business just went digital</p>
        </td></tr>

        <!-- Welcome Banner -->
        <tr><td style="padding:30px 40px 0;">
          <div style="background:linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%);border:2px solid #86efac;border-radius:12px;padding:24px;text-align:center;">
            <h2 style="color:#166534;margin:0;font-size:22px;font-weight:700;">${businessName} is Live!</h2>
            <p style="color:#15803d;margin:8px 0 0;font-size:14px;">Your 15-day free trial is now active. Let's get you set up.</p>
          </div>
        </td></tr>

        <!-- Store Details -->
        <tr><td style="padding:30px 40px 0;">
          <div style="background:#f8fafc;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
            <p style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 16px;">Your Store Details</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
                  <span style="color:#94a3b8;font-size:12px;font-weight:600;">Business Name</span><br>
                  <span style="color:#1e3a5f;font-size:16px;font-weight:700;">${businessName}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
                  <span style="color:#94a3b8;font-size:12px;font-weight:600;">Admin Email</span><br>
                  <span style="color:#334155;font-size:14px;font-weight:600;">${email}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;">
                  <span style="color:#94a3b8;font-size:12px;font-weight:600;">Your Store URL</span><br>
                  <a href="${storeUrl}" style="color:#2563eb;font-size:14px;font-weight:600;text-decoration:none;">${storeUrl}</a>
                </td>
              </tr>
            </table>
          </div>
        </td></tr>

        <!-- Getting Started Steps -->
        <tr><td style="padding:30px 40px 0;">
          <h3 style="color:#1e3a5f;font-size:16px;font-weight:700;margin:0 0 16px;">Get started in 3 easy steps</h3>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:14px 0;vertical-align:top;width:44px;">
                <div style="width:36px;height:36px;background:linear-gradient(135deg,#2563eb,#1d4ed8);border-radius:50%;text-align:center;line-height:36px;color:#fff;font-size:16px;font-weight:800;">1</div>
              </td>
              <td style="padding:14px 0 14px 12px;">
                <strong style="color:#334155;font-size:14px;">Customise Your Store</strong>
                <p style="color:#64748b;font-size:13px;margin:2px 0 0;">Go to Store Settings — add your logo, brand colours, address and opening hours</p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 0;vertical-align:top;width:44px;">
                <div style="width:36px;height:36px;background:linear-gradient(135deg,#2563eb,#1d4ed8);border-radius:50%;text-align:center;line-height:36px;color:#fff;font-size:16px;font-weight:800;">2</div>
              </td>
              <td style="padding:14px 0 14px 12px;">
                <strong style="color:#334155;font-size:14px;">Add Your Services</strong>
                <p style="color:#64748b;font-size:13px;margin:2px 0 0;">Create service categories (Dry Cleaning, Laundry, Alterations) and set your prices</p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 0;vertical-align:top;width:44px;">
                <div style="width:36px;height:36px;background:linear-gradient(135deg,#2563eb,#1d4ed8);border-radius:50%;text-align:center;line-height:36px;color:#fff;font-size:16px;font-weight:800;">3</div>
              </td>
              <td style="padding:14px 0 14px 12px;">
                <strong style="color:#334155;font-size:14px;">Start Taking Orders</strong>
                <p style="color:#64748b;font-size:13px;margin:2px 0 0;">Share your store link with customers and watch the bookings roll in!</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- CTA Button -->
        <tr><td style="padding:30px 40px 0;text-align:center;">
          <a href="${storeUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);color:#ffffff;text-decoration:none;padding:16px 48px;border-radius:12px;font-size:16px;font-weight:700;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(37,99,235,0.4);">
            Open Your Back Office
          </a>
        </td></tr>

        <!-- What's Included -->
        <tr><td style="padding:30px 40px 0;">
          <div style="background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border-radius:12px;padding:20px 24px;border:1px solid #bfdbfe;">
            <p style="color:#1e40af;font-size:13px;font-weight:700;margin:0 0 12px;">EVERYTHING INCLUDED IN YOUR TRIAL</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:4px 0;color:#1e3a5f;font-size:13px;">✅ Unlimited customers & orders</td>
                <td style="padding:4px 0;color:#1e3a5f;font-size:13px;">✅ Online booking portal</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#1e3a5f;font-size:13px;">✅ Driver tracking & dispatch</td>
                <td style="padding:4px 0;color:#1e3a5f;font-size:13px;">✅ Automated email marketing</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#1e3a5f;font-size:13px;">✅ Invoice & payment processing</td>
                <td style="padding:4px 0;color:#1e3a5f;font-size:13px;">✅ Sales reports & analytics</td>
              </tr>
            </table>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:30px 40px 40px;">
          <div style="border-top:1px solid #e2e8f0;padding-top:24px;text-align:center;">
            <p style="color:#64748b;font-size:14px;font-weight:600;margin:0 0 4px;">Need help getting started?</p>
            <p style="color:#94a3b8;font-size:12px;margin:0;">Simply reply to this email — we're here to help you succeed.</p>
            <p style="color:#cbd5e1;font-size:11px;margin:16px 0 0;">&copy; ${new Date().getFullYear()} CleanPOS by Posso Software Solutions Ltd. All rights reserved.</p>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await sendBrevoEmail({
        toEmail: email,
        toName: businessName,
        subject: subject,
        htmlContent: htmlContent,
    });
};
