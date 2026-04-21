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

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { action, tenantId } = await req.json()

        // Create a Supabase client with the service role key to update tenant settings
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        if (action === 'setup') {
            // Check if tenant already has a connected account
            const { data: existingSettings } = await supabaseClient
                .from('company_settings')
                .select('stripe_connect_account_id')
                .eq('tenant_id', tenantId)
                .single()

            let accountId = existingSettings?.stripe_connect_account_id

            if (accountId) {
                // Account exists — check if onboarding is complete
                const existingAccount = await stripe.accounts.retrieve(accountId)
                if (existingAccount.details_submitted) {
                    return new Response(
                        JSON.stringify({ status: 'already_connected', accountId }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }
                // Not complete — generate a new onboarding link
            } else {
                // 1. Create a Standard connected account
                const account = await stripe.accounts.create({
                    type: 'standard',
                    metadata: { tenant_id: tenantId }
                })
                accountId = account.id

                // Store the Account ID in company_settings
                await supabaseClient
                    .from('company_settings')
                    .update({ stripe_connect_account_id: accountId })
                    .eq('tenant_id', tenantId)
            }

            // 2. Create an account link for onboarding
            const origin = req.headers.get('origin') || 'https://xp-clean.web.app'
            const accountLink = await stripe.accountLinks.create({
                account: accountId,
                refresh_url: `${origin}/back-office?tab=billing`,
                return_url: `${origin}/back-office?tab=billing&connected=success`,
                type: 'account_onboarding',
            })

            // 3. Activate the tenant's subscription (pay-per-order model)
            await supabaseClient
                .from('tenants')
                .update({ subscription_status: 'active', billing_type: 'per_transaction' })
                .eq('id', tenantId)

            return new Response(
                JSON.stringify({ url: accountLink.url, accountId }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        return new Response(JSON.stringify({ error: 'Invalid action' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    } catch (error: any) {
        console.error('Stripe Connect Error:', error);
        // SECURITY: Don't expose internal error details
        return new Response(JSON.stringify({ error: 'Connection setup failed. Please try again.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
