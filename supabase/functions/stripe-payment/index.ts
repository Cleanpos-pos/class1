import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
    apiVersion: '2023-10-16',
})

// Dynamic CORS for multi-tenant subdomains
const getAllowedOrigin = (req: Request): string => {
    const origin = req.headers.get('origin') || '';
    const isProduction = Deno.env.get('ENVIRONMENT') !== 'development';

    // Production: Only allow specific domains
    if (isProduction) {
        if (origin.endsWith('.web.app') ||
            origin === 'https://xp-clean.web.app') {
            return origin;
        }
    } else {
        // Development: Allow localhost on specific ports
        if (origin === 'http://localhost:3000' ||
            origin === 'http://localhost:5173' ||
            origin === 'http://127.0.0.1:3000' ||
            origin === 'http://127.0.0.1:5173' ||
            origin.endsWith('.web.app') ||
            origin === 'https://xp-clean.web.app') {
            return origin;
        }
    }
    return 'https://xp-clean.web.app'; // Default fallback
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

        let connectedAccountId = companySettings?.stripe_connect_account_id

        // 1b. If no Stripe account, check if this is a franchise child store
        //     and if the parent has shared Stripe mode enabled
        if (!connectedAccountId) {
            const { data: tenantData } = await supabaseClient
                .from('tenants')
                .select('parent_tenant_id')
                .eq('id', tenantId)
                .single()

            if (tenantData?.parent_tenant_id) {
                // Check if parent has shared Stripe mode
                const { data: parentSetting } = await supabaseClient
                    .from('cp_app_settings')
                    .select('value')
                    .eq('tenant_id', tenantData.parent_tenant_id)
                    .eq('key', 'franchise_stripe_mode')
                    .maybeSingle()

                if (parentSetting?.value === 'shared') {
                    // Use parent's Stripe account
                    const { data: parentCompany } = await supabaseClient
                        .from('company_settings')
                        .select('stripe_connect_account_id')
                        .eq('tenant_id', tenantData.parent_tenant_id)
                        .single()

                    connectedAccountId = parentCompany?.stripe_connect_account_id
                }
            }
        }

        if (!connectedAccountId) {
            throw new Error('This store has not connected their Stripe account yet.')
        }

        // 2. Platform Fees:
        //    - 50p service fee charged to customer (added to checkout amount)
        //    - £1.20 platform fee from store (deducted from store's portion)
        //    Total application_fee = 170 pence (£1.70)
        const customerServiceFee = 50; // 50 pence added to checkout
        const storePlatformFee = 120;  // 120 pence from store
        const totalApplicationFee = customerServiceFee + storePlatformFee; // 170 pence

        // 3. Get or Create Stripe Customer on the PLATFORM account (Destination Charges)
        const customerId = await getOrCreateCustomer(email, customerName, stripe)

        // 4. Update Supabase with the Stripe Customer ID if not already set
        await supabaseClient
            .from('cp_customers')
            .update({ stripe_customer_id: customerId })
            .eq('email', email)
            .eq('tenant_id', tenantId)

        if (action === 'create-checkout-session') {
            const isRecurring = recurring && recurring !== 'none'
            const orderAmount = Math.round(amount * 100) // Original order amount in pence
            const checkoutAmount = orderAmount > 0 ? orderAmount + customerServiceFee : 0 // Add 50p service fee

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
                            unit_amount: orderAmount > 0 ? orderAmount : 100,
                        },
                        quantity: 1,
                    },
                    // 50p service fee as separate line item so customer can see it
                    ...(orderAmount > 0 ? [{
                        price_data: {
                            currency: 'gbp',
                            product_data: {
                                name: 'Service Fee',
                            },
                            unit_amount: customerServiceFee,
                        },
                        quantity: 1,
                    }] : []),
                ],
                mode: (orderAmount > 0) ? 'payment' : 'setup',
                success_url: success_url || `https://xp-clean.web.app/customer-portal?payment=success&order_id=${orderId || ''}`,
                cancel_url: cancel_url || `https://xp-clean.web.app/booking?payment=cancel`,
                metadata: {
                    tenant_id: tenantId,
                    order_id: orderId || '',
                },
                // Destination Charge: payment on platform, transfer to connected account
                payment_intent_data: (orderAmount > 0) ? {
                    application_fee_amount: totalApplicationFee,
                    transfer_data: {
                        destination: connectedAccountId,
                    },
                    metadata: {
                        tenant_id: tenantId,
                        order_id: orderId || '',
                    }
                } : undefined
            }

            if (isRecurring && orderAmount > 0) {
                sessionConfig.payment_intent_data.setup_future_usage = 'off_session';
            }

            if (orderAmount === 0) {
                delete sessionConfig.line_items;
                sessionConfig.mode = 'setup';
            }

            // Create session on the PLATFORM (Destination Charge model)
            const session = await stripe.checkout.sessions.create(sessionConfig)

            return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        return new Response(JSON.stringify({ error: 'Unsupported action' }), { status: 400, headers: corsHeaders })
    } catch (error: any) {
        console.error('Stripe Function Error:', error)
        return new Response(JSON.stringify({ error: error.message || 'Payment processing failed.', type: error.type || 'unknown', code: error.code || '' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})

async function getOrCreateCustomer(email: string, name: string, stripe: Stripe) {
    // List customers on the platform account
    const customers = await stripe.customers.list({ email, limit: 1 })
    if (customers.data.length > 0) return customers.data[0].id

    // Create customer on the platform account
    const customer = await stripe.customers.create({ email, name })
    return customer.id
}
