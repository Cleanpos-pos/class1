import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
})

// Dynamic CORS for multi-tenant subdomains
const getAllowedOrigin = (req: Request): string => {
    const origin = req.headers.get('origin') || '';
    // Allow cleanpos.app subdomains, Firebase hosting, localhost for dev
    if (origin.endsWith('.cleanpos.app') ||
        origin === 'https://cleanpos.app' ||
        origin.endsWith('.web.app') ||
        origin.endsWith('.firebaseapp.com') ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')) {
        return origin;
    }
    return 'https://cleanpos.app';
};

const getCorsHeaders = (req: Request) => ({
    'Access-Control-Allow-Origin': getAllowedOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const signature = req.headers.get("Stripe-Signature");
        const body = await req.text();

        if (!signature) {
            return new Response("No signature", { status: 400, headers: corsHeaders });
        }

        let event;
        try {
            event = stripe.webhooks.constructEvent(body, signature, Deno.env.get('STRIPE_WEBHOOK_SECRET')!);
        } catch (err: any) {
            console.error(`Webhook signature verification failed: ${err.message}`);
            return new Response(`Webhook Error: ${err.message}`, { status: 400, headers: corsHeaders });
        }

        // Handle the event
        if (event.type === 'account.updated') {
            const account = event.data.object;

            console.log(`Processing account.updated for ${account.id}`);

            if (account.details_submitted && account.charges_enabled) {
                // Initialize Supabase Client
                const supabaseClient = createClient(
                    Deno.env.get('SUPABASE_URL') ?? '',
                    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
                );

                // 1. Find the tenant associated with this Stripe Account ID
                const { data: settings, error: findError } = await supabaseClient
                    .from('company_settings')
                    .select('tenant_id, company_name')
                    .eq('stripe_connect_account_id', account.id)
                    .single();

                if (findError || !settings) {
                    console.error('Tenant not found for this Stripe Account ID');
                    return new Response(JSON.stringify({ received: true }), { headers: corsHeaders });
                }

                const tenantId = settings.tenant_id;

                // 2. Update Tenants table (is_stripe_active = true)
                const { error: updateError } = await supabaseClient
                    .from('tenants')
                    .update({ is_stripe_active: true })
                    .eq('id', tenantId);

                if (updateError) {
                    console.error('Failed to update tenant status', updateError);
                } else {
                    console.log(`Tenant ${tenantId} activated for Stripe payments.`);

                    // 3. Send Welcome Email
                    const { data: staff } = await supabaseClient
                        .from('staff')
                        .select('login_id, name')
                        .eq('tenant_id', tenantId)
                        .eq('role', 'admin')
                        .limit(1)
                        .maybeSingle();

                    const email = staff?.login_id || 'support@cleanpos.app';
                    const name = staff?.name || settings.company_name || 'Partner';

                    await sendWelcomeEmail(email, name, settings.company_name || 'Your Store');
                }
            }
        }

        return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Webhook processing error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});

async function sendWelcomeEmail(email: string, name: string, appName: string) {
    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || Deno.env.get('VITE_BREVO_API_KEY');
    if (!BREVO_API_KEY) {
        console.log('No Brevo API Key found. Skipping email.');
        return;
    }

    const subject = `You're all set! Your ${appName} account is now linked to Stripe.`;
    const htmlContent = `
        <h3>Hi ${name},</h3>
        <p>Great news! Your Stripe Connect account has been successfully verified. Your dry cleaning business is now officially ready to accept secure online payments directly through ${appName}.</p>
        <h4>How it works:</h4>
        <p>To keep our platform running smoothly and providing you with the best tools to manage your shop, here is a quick reminder of how transactions are processed:</p>
        <ul>
            <li><strong>Your Payouts:</strong> Payments from your customers go directly into your Stripe account.</li>
            <li><strong>Platform Fee:</strong> A flat fee of £1.00 is automatically deducted from each completed order and routed to ${appName}.</li>
            <li><strong>Stripe Fees:</strong> Standard Stripe processing fees (e.g., 1.4% + 20p) still apply to the remaining balance.</li>
        </ul>
        <h4>What's next?</h4>
        <ul>
            <li><strong>Start Taking Orders:</strong> Your customers will now see the "Pay Online" option at checkout.</li>
            <li><strong>Monitor Your Earnings:</strong> You can view your real-time balance and payout schedule anytime via your Stripe Dashboard.</li>
            <li><strong>Automatic Payouts:</strong> Stripe will automatically deposit your funds into your linked bank account on your chosen schedule (usually every 7 days).</li>
        </ul>
        <p>We are thrilled to have you on board. If you have any questions about your first few transactions, just hit reply!</p>
        <p>Best regards,<br/>The ${appName} Team</p>
    `;

    try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': BREVO_API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: appName, email: 'info@cleanpos.app' },
                to: [{ email: email, name: name }],
                subject: subject,
                htmlContent: htmlContent
            })
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('Brevo Email Failed:', err);
        } else {
            console.log('Welcome email sent successfully.');
        }
    } catch (e) {
        console.error('Error sending email:', e);
    }
}
