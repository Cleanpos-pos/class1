import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
    apiVersion: '2023-10-16',
})

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
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

        // 2. Fetch platform settings if needed, but we use a flat £1 fee for now.

        // 3. Get or Create Stripe Customer on the Platform account
        const customerId = await getOrCreateCustomer(email, customerName, stripe)

        // 4. Update Supabase with the Stripe Customer ID if not already set
        await supabaseClient
            .from('cp_customers')
            .update({ stripe_customer_id: customerId })
            .eq('email', email)
            .eq('tenant_id', tenantId)

        if (action === 'create-checkout-session') {
            const isRecurring = recurring && recurring !== 'none'
            const checkoutAmount = Math.round(amount * 100)

            // Flat £1 fee in cents, capped at 50% of the order value if order is very small
            // This prevents "application_fee_amount must be less than total" errors
            let feeAmount = 100
            if (checkoutAmount > 0 && feeAmount >= checkoutAmount) {
                feeAmount = Math.floor(checkoutAmount * 0.5)
            }

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
                            unit_amount: checkoutAmount > 0 ? checkoutAmount : 100, // Stripe doesn't allow £0 in payment mode
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
                }
            }

            // Adjust for £0 bookings (e.g. valet bag request where price is TBD)
            if (checkoutAmount === 0) {
                // If amount is 0, we just want to save the card for future off-session charges
                delete sessionConfig.line_items
                sessionConfig.mode = 'setup'
                // SetupIntents don't verify destination here usually, we just save to platform customer
            } else {
                // Payment mode with Destination Charge
                sessionConfig.payment_intent_data = {
                    application_fee_amount: feeAmount,
                    transfer_data: {
                        destination: connectedAccountId,
                    },
                    metadata: {
                        tenant_id: tenantId,
                        order_id: orderId || '',
                    }
                }

                if (isRecurring) {
                    // Save card for future off-session usage
                    sessionConfig.payment_intent_data.setup_future_usage = 'off_session'
                }
            }

            const session = await stripe.checkout.sessions.create(sessionConfig)

            return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        return new Response(JSON.stringify({ error: 'Unsupported action' }), { status: 400 })
    } catch (error: any) {
        console.error('Stripe Function Error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})

async function getOrCreateCustomer(email: string, name: string, stripe: Stripe) {
    const customers = await stripe.customers.list({ email, limit: 1 })
    if (customers.data.length > 0) return customers.data[0].id
    const customer = await stripe.customers.create({ email, name })
    return customer.id
}
