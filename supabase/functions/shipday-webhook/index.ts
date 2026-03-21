import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// Shipday status → CleanPos status mapping
const STATUS_MAP: Record<string, string> = {
  'ASSIGNED': 'dispatched',
  'ACCEPTED': 'collecting',
  'STARTED': 'collecting',
  'PICKED_UP': 'collected',
  'READY_FOR_PICKUP': 'ready_for_delivery',
  'OUT_FOR_DELIVERY': 'out_for_delivery',
  'DELIVERED': 'delivered',
}

// Order of stages (only move forward, never backward)
const STAGES = ['pending', 'dispatched', 'collecting', 'collected', 'cleaning', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'completed']

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.json()
    console.log('[Shipday Webhook] Received:', JSON.stringify(body))

    // Shipday webhook payload fields
    const orderNumber = body.orderNumber || body.order_number || ''
    const shipdayStatus = body.orderState || body.status || body.orderStatus?.orderState || ''
    const shipdayOrderId = body.orderId || body.order_id

    if (!orderNumber || !shipdayStatus) {
      console.log('[Shipday Webhook] Missing orderNumber or status')
      return new Response(JSON.stringify({ ok: true, skipped: 'missing fields' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Map Shipday status to our status
    const newStatus = STATUS_MAP[shipdayStatus]
    if (!newStatus) {
      console.log('[Shipday Webhook] Unmapped status:', shipdayStatus)
      return new Response(JSON.stringify({ ok: true, skipped: 'unmapped status' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Strip -COL or -DEL suffix to get readable_id
    const readableId = orderNumber.replace(/-COL$|-DEL$/, '')

    // Connect to Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    )

    // Find the order
    const { data: order, error: findError } = await supabase
      .from('cp_orders')
      .select('id, status')
      .eq('readable_id', readableId)
      .single()

    if (findError || !order) {
      console.log('[Shipday Webhook] Order not found:', readableId, findError?.message)
      return new Response(JSON.stringify({ ok: true, skipped: 'order not found' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Only move status forward
    const currentIdx = STAGES.indexOf(order.status)
    const newIdx = STAGES.indexOf(newStatus)

    if (newIdx <= currentIdx) {
      console.log('[Shipday Webhook] Status not advancing:', order.status, '→', newStatus)
      return new Response(JSON.stringify({ ok: true, skipped: 'status not advancing' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Update the order status
    const { error: updateError } = await supabase
      .from('cp_orders')
      .update({ status: newStatus })
      .eq('id', order.id)

    if (updateError) {
      console.error('[Shipday Webhook] Update error:', updateError.message)
      return new Response(JSON.stringify({ ok: false, error: updateError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`[Shipday Webhook] Updated ${readableId}: ${order.status} → ${newStatus}`)

    return new Response(JSON.stringify({ ok: true, updated: readableId, from: order.status, to: newStatus }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[Shipday Webhook] Error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
