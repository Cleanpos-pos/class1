import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
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
            // 1. Create a Standard connected account
            const account = await stripe.accounts.create({
                type: 'standard',
                metadata: { tenant_id: tenantId }
            })

            // 2. Create an account link for onboarding
            const accountLink = await stripe.accountLinks.create({
                account: account.id,
                refresh_url: `${req.headers.get('origin')}/back-office?tab=billing`,
                return_url: `${req.headers.get('origin')}/back-office?tab=billing&connected=success`,
                type: 'account_onboarding',
            })

            // 3. Store the Account ID in company_settings temporarily
            await supabaseClient
                .from('company_settings')
                .update({ stripe_connect_account_id: account.id })
                .eq('tenant_id', tenantId)

            return new Response(
                JSON.stringify({ url: accountLink.url, accountId: account.id }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        return new Response(JSON.stringify({ error: 'Invalid action' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
