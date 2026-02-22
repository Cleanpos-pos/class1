import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
    apiVersion: '2023-10-16',
})

// Dynamic CORS for multi-tenant subdomains
const getAllowedOrigin = (req: Request): string => {
    const origin = req.headers.get('origin') || '';
    // Allow cleanpos.app subdomains, localhost for dev
    if (origin.endsWith('.cleanpos.app') ||
        origin === 'https://cleanpos.app' ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')) {
        return origin;
    }
    return 'https://cleanpos.app'; // Default fallback
};

const getCorsHeaders = (req: Request) => ({
    'Access-Control-Allow-Origin': getAllowedOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { action, amount, tenantId, email, customerName, recurring, success_url, cancel_url, orderId } = await req.json()

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') || '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
        )

        // 1. Fetch tenant's Stripe Connect Account ID
        const { data: companySettings } = await supabaseClient
            .from('company_settings')
            .select('stripe_connect_account_id')
            .eq('tenant_id', tenantId)
            .single()

        const connectedAccountId = companySettings?.stripe_connect_account_id
        if (!connectedAccountId) {
            throw new Error('This store has not connected their Stripe account yet.')
        }

        // 2. Platform Fee (Application Fee) - Flat £1.00
        const feeAmount = 100; // 100 pence = £1.00

        // 3. Get or Create Stripe Customer ON THE CONNECTED ACCOUNT (Direct Charge)
        const customerId = await getOrCreateCustomer(email, customerName, stripe, connectedAccountId)

        // 4. Update Supabase with the Stripe Customer ID if not already set
        await supabaseClient
            .from('cp_customers')
            .update({ stripe_customer_id: customerId })
            .eq('email', email)
            .eq('tenant_id', tenantId)

        if (action === 'create-checkout-session') {
            const isRecurring = recurring && recurring !== 'none'
            const checkoutAmount = Math.round(amount * 100)

            const sessionConfig: any = {
                customer: customerId,
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'gbp',
                            product_data: {
                                name: isRecurring ? `Valet Service - ${recurring}` : 'Order Payment',
                                description: orderId ? `Order #${orderId}` : `Order for tenant ${tenantId}`,
                            },
                            unit_amount: checkoutAmount > 0 ? checkoutAmount : 100, // Stripe doesn't allow £0
                        },
                        quantity: 1,
                    },
                ],
                mode: (checkoutAmount > 0) ? 'payment' : 'setup',
                success_url: success_url || `${req.headers.get('origin')}/customer-portal?payment=success&order_id=${orderId || ''}`,
                cancel_url: cancel_url || `${req.headers.get('origin')}/booking?payment=cancel`,
                metadata: {
                    tenant_id: tenantId,
                    order_id: orderId || '',
                },
                // Direct Charge Configuration
                payment_intent_data: (checkoutAmount > 0) ? {
                    application_fee_amount: feeAmount,
                    metadata: {
                        tenant_id: tenantId,
                        order_id: orderId || '',
                    }
                } : undefined
            }

            if (isRecurring && checkoutAmount > 0) {
                sessionConfig.payment_intent_data.setup_future_usage = 'off_session';
            }

            if (checkoutAmount === 0) {
                delete sessionConfig.line_items;
                sessionConfig.mode = 'setup';
            }

            // Create session on the connected account
            const session = await stripe.checkout.sessions.create(sessionConfig, {
                stripeAccount: connectedAccountId,
            })

            return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        return new Response(JSON.stringify({ error: 'Unsupported action' }), { status: 400, headers: corsHeaders })
    } catch (error: any) {
        console.error('Stripe Function Error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})

async function getOrCreateCustomer(email: string, name: string, stripe: Stripe, stripeAccount: string) {
    // List customers on the connected account
    const customers = await stripe.customers.list({ email, limit: 1 }, { stripeAccount })
    if (customers.data.length > 0) return customers.data[0].id

    // Create customer on the connected account
    const customer = await stripe.customers.create({ email, name }, { stripeAccount })
    return customer.id
}
