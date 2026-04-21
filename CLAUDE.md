# XP Clean — Master Reference Document

> **Last Updated:** 2026-03-23
> **Live URL:** https://xp-clean.web.app
> **Platform:** React SPA + Supabase + Firebase Hosting + Electron Desktop

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React + TypeScript | 19.2.3 |
| Build | Vite | 6.2.0 |
| Styling | Tailwind CSS | 4.2.0 |
| Database | Supabase (PostgreSQL) | - |
| Edge Functions | Deno (Supabase Functions) | - |
| Hosting | Firebase | - |
| Desktop | Electron | 28.0.0 |
| Payments | Stripe Connect (Destination Charges) | - |
| Email | Brevo (SendInBlue) API | - |
| Delivery | Shipday API + Webhooks | - |
| Maps | Google Maps API | - |

---

## Architecture Overview

- **Multi-tenant SaaS** — single codebase serves unlimited stores, each with own subdomain/branding
- **SPA routing** — pages controlled via `setPage()` state, not URL paths (except `/back-office` and `/customer-portal`)
- **Stripe Connect (Express)** — Destination Charge model: payments collected on platform, transferred to connected store accounts
- **Edge Functions** deployed via `npx supabase functions deploy <name> --no-verify-jwt`
- **Firebase deploy** via `npx firebase deploy --only hosting`

---

## Revenue Model

| Fee | Amount | Who Pays |
|-----|--------|----------|
| Service Fee | 50p per order | Customer (shown as separate line in checkout) |
| Platform Fee | £1.00 + VAT (£1.20) | Store (deducted from their payout) |
| **Total per order** | **£1.70** | Split between customer & store |

- Minimum order value: **£15** for Stripe-enabled stores
- Stores without Stripe: orders go through as **"On Account"** for manual billing
- Stripe processing fees (1.4% + 20p) paid by the store from their portion

---

## Key Files

### Core Application
| File | Purpose |
|------|---------|
| `App.tsx` | Main application (~14,000 lines). All pages, state, booking flow, back office, customer portal |
| `types.ts` | TypeScript type definitions — Page types, Cart items, TimeSlots, Invoices, etc. |
| `vite.config.ts` | Build config with code splitting (vendor, supabase, stripe, leaflet chunks) |
| `firebase.json` | Firebase hosting config with CSP headers, SPA rewrites, security headers |

### Services
| File | Purpose |
|------|---------|
| `services/emailService.ts` | Brevo email: order confirmations (HTML), customer welcome, store welcome, admin notifications |
| `services/ShipdayService.ts` | Shipday REST client: createOrder, getActiveOrders, getCarriers, assignDriver |
| `services/GoogleMapsService.ts` | Google Maps: postcode autocomplete (UK), geocoding, distance calculation |

### Supabase Edge Functions
| Function | File | Purpose |
|----------|------|---------|
| `stripe-payment` | `supabase/functions/stripe-payment/index.ts` | Creates Stripe Checkout sessions with Destination Charges, 50p customer fee + £1.20 store fee |
| `stripe-connect` | `supabase/functions/stripe-connect/index.ts` | Stripe Connect onboarding — creates/resumes Express account setup |
| `stripe-webhook` | `supabase/functions/stripe-webhook/index.ts` | Handles Stripe webhook events, account verification, welcome emails |
| `shipday-webhook` | `supabase/functions/shipday-webhook/index.ts` | Real-time delivery status sync from Shipday to cp_orders |

### Electron Desktop App
| File | Purpose |
|------|---------|
| `electron/main.js` | Main process — window management, printer integration, tray menu, IPC |
| `electron/preload.js` | Context bridge — exposes print functions to renderer |
| `electron/escpos-commands.js` | ESC/POS thermal printer commands — receipt, garment tags (DStubs), bag tags (Btags) |
| `electron/package.json` | Electron build config — NSIS installer, app metadata |

### Scripts & Config
| File | Purpose |
|------|---------|
| `scripts/generate-pitch-deck.html` | Investor pitch deck (open in browser, print to PDF) |
| `scripts/migrate-passwords.cjs` | Password migration utilities |
| `utils/passwordUtils.ts` | Bcrypt password hashing (Supabase-compatible) |
| `utils/logger.ts` | Structured logging utility |

---

## Database Tables (Supabase)

### Core
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `tenants` | Multi-tenant stores | `id`, `subdomain`, `subscription_status`, `billing_type`, `trial_ends_at` |
| `staff` | Store staff | `tenant_id`, `role` (admin/driver), `email`, `password_hash` |
| `company_settings` | Store config | `tenant_id`, `company_name`, `stripe_connect_account_id` |
| `cp_app_settings` | Key-value settings | `tenant_id`, `key`, `value` (shipday_enabled, shipday_api_key, store_email, etc.) |

### Customers & Orders
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `cp_customers` | Customer accounts | `tenant_id`, `email`, `name`, `phone`, `loyalty_points`, `stripe_customer_id` |
| `cp_orders` | Orders | `tenant_id`, `customer_email`, `status`, `total_amount`, `payment_method`, `payment_status`, `shipday_order_id`, `driver_id`, `stripe_sessionId` |
| `cp_order_items` | Line items | `order_id`, `service_name`, `quantity`, `price` |
| `cp_invoices` | Invoices | `order_id`, `tenant_id`, `status`, `line_items` |

### Services & Pricing
| Table | Purpose |
|-------|---------|
| `cp_services` | Available services per tenant |
| `cp_categories` | Service categories with sort order |
| `cp_promotions` | Active promotions/deals |
| `cp_discount_codes` | Voucher codes (tenant-specific) |

### Delivery & Logistics
| Table | Purpose |
|-------|---------|
| `cp_drivers` | Driver profiles |
| `cp_postcode_areas` | Service area definitions with surcharges |
| `cp_postcode_service_slots` | Collection/delivery time slots per postcode |
| `cp_delivery_options` | Delivery config per tenant |
| `cp_delivery_photos` | Delivery proof photos |
| `cp_time_slots` | Available time slots |

### Other
| Table | Purpose |
|-------|---------|
| `cp_email_templates` | Customisable email templates per tenant |
| `cp_partner_passes` | Corporate/partner passes |
| `cp_corporate_accounts` | B2B corporate accounts |
| `cp_admin_auth` | Admin authentication |

---

## Pages & Features

### Customer-Facing
| Page | Description |
|------|-------------|
| **Home / Landing** | SaaS landing page with pricing (£1/order), feature showcase, signup |
| **Services** | Service catalogue with categories, pricing, images |
| **Booking** | 4-step flow: Items → Collection Slot → Delivery Slot → Review & Pay |
| **Customer Portal** | Order history, loyalty points, account settings, order tracking |
| **Track Order** | Real-time Shipday tracking with map and status updates |
| **Contact** | Store contact info and form |

### Staff/Admin
| Page | Description |
|------|-------------|
| **Back Office** | Order management, customer database, services CRUD, settings, billing, analytics |
| **Driver Portal** | Assigned deliveries, route view, status updates, delivery photos |
| **Master Admin** | Platform-level admin for managing all tenants |

### Key Booking Flow Details
- Step 1: Select items and quantities
- Step 2: Choose collection time slot
- Step 3: Choose delivery time slot
- Step 4: Review, apply discounts/loyalty points, confirm & pay
- **Stripe-enabled stores**: "Pay & Confirm Booking" → Stripe Checkout → redirect to customer portal
- **Non-Stripe stores**: "Confirm Booking (On Account)" → order created with `payment_method: 'on_account'`
- **Minimum order**: £15 for Stripe payments

---

## Third-Party Integrations

### Stripe Connect
- **Account type:** Express
- **Charge model:** Destination Charges (payment on platform, transfer to connected account)
- **Onboarding:** Edge function creates account → redirects to Stripe onboarding → stores connect bank/identity
- **Checkout:** Platform creates session with `transfer_data.destination` and `application_fee_amount: 170`
- **Customer management:** Customers created on platform account (not connected account)
- **Environment variables:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

### Brevo (Email)
- **API Key:** `VITE_BREVO_API_KEY` (frontend) — used in emailService.ts
- **Emails sent:**
  - Order confirmation (HTML with items, totals, tracking link)
  - Customer welcome (HTML with 10% voucher code)
  - Store welcome/onboarding (HTML with getting started guide)
  - Admin notification on new orders
- **Sender:** Configured per-tenant via `cp_app_settings` (store_email key)

### Shipday (Delivery)
- **API Key:** Stored in `cp_app_settings` per tenant (`shipday_api_key`)
- **Feature flag:** `shipday_enabled` in `cp_app_settings`
- **Features:** Order creation, carrier lookup, driver assignment, real-time tracking
- **Webhook:** `supabase/functions/shipday-webhook/index.ts` — syncs delivery status to `cp_orders`
- **Polling:** Customer tracking page polls Shipday for status updates

### Google Maps
- **API Key:** `VITE_GOOGLE_MAPS_API_KEY`
- **Features:** UK postcode autocomplete, geocoding, distance calculation
- **Restriction:** UK addresses only

---

## Deployment

### Frontend (Firebase)
```bash
npm run build          # Vite build → dist/
npx firebase deploy --only hosting
```
**Live at:** https://xp-clean.web.app

### Supabase Edge Functions
```bash
npx supabase functions deploy stripe-payment --no-verify-jwt
npx supabase functions deploy stripe-connect --no-verify-jwt
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions deploy shipday-webhook --no-verify-jwt
```

### Electron Desktop Installer
```bash
cd electron
npm run build:win      # Creates NSIS installer
```

---

## Environment Variables

### Frontend (.env)
| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `VITE_BREVO_API_KEY` | Brevo email API key |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps API key |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |

### Supabase Edge Functions (set via Supabase dashboard)
| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `SUPABASE_URL` | Auto-provided by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-provided by Supabase |

---

## Major Milestones & Changelog

### 2026-03-23 — Stripe Connect & Payment Flow
- Implemented Stripe Connect (Express accounts) with Destination Charges
- Fee structure: 50p customer service fee + £1.20 (£1+VAT) store platform fee = £1.70/order
- Service fee shown as separate line item in Stripe Checkout
- £15 minimum order for Stripe-enabled stores
- On-account fallback when store has no Stripe account (orange badge in back office)
- Post-payment redirect to customer portal
- Subscription overlay: shows "Activate Pay Per Order" instead of monthly subscription

### 2026-03-22 — Shipday Delivery Integration
- Shipday webhook for real-time delivery status sync
- Shipday polling on customer tracking page and back office
- Driver assignment and carrier lookup
- Order status auto-updates from Shipday events

### 2026-03-21 — Email System Upgrade
- HTML order confirmation emails with items, totals, tracking link
- HTML customer welcome emails with branded design and 10% voucher
- HTML store onboarding welcome emails with getting started guide
- Redesigned from plain text to full branded HTML templates

### 2026-03-20 — Order System Fixes
- Fixed cp_orders select items 400 error
- Invoice insert error handling improvements
- Added payment_method and payment_status columns to cp_orders

### Previous Milestones
- Multi-tenant architecture with subdomain routing
- 4-step booking flow with collection/delivery slots
- Loyalty points system with promo codes
- Back office with order management, customer database, services CRUD
- Driver portal with delivery management
- Google Maps postcode autocomplete and distance calculation
- Electron desktop app with thermal printer support (receipts, bag tags, garment tags)
- Firebase hosting with security headers (CSP, HSTS, X-Frame-Options)
- SaaS landing page with pricing and signup

---

## Known Issues & Notes

1. **LockManager warning** — `@supabase/gotrue-js: Navigator LockManager returned a null lock` — benign Supabase auth warning, does not affect functionality
2. **cp_app_settings 406** — `GET cp_app_settings?select=value&key=eq.store_email` returns 406 when no row exists — needs `.maybeSingle()` instead of `.single()`
3. **App.tsx size** — ~14,000 lines, single file. Consider code-splitting into components for maintainability
4. **Vite chunk warning** — Main JS chunk exceeds 1000kB. Code splitting configured but main bundle still large
5. **Print system** — Receipts, Btags, and DStubs have pending redesign (see plan: quirky-marinating-chipmunk.md)

---

## Quick Reference Commands

```bash
# Development
npm run dev                    # Start dev server on localhost:3000

# Build & Deploy Frontend
npm run build && npx firebase deploy --only hosting

# Deploy Edge Functions
npx supabase functions deploy stripe-payment --no-verify-jwt
npx supabase functions deploy stripe-connect --no-verify-jwt
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions deploy shipday-webhook --no-verify-jwt

# Build Electron Installer
cd electron && npm run build:win

# Test Stripe Payment (curl)
curl -s -X POST "https://vpflahhfwnwvzphfrwnb.supabase.co/functions/v1/stripe-payment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -d '{"action":"create-checkout-session","amount":25,"email":"test@test.com","customerName":"Test","tenantId":"<TENANT_ID>","orderId":"test-123","success_url":"https://xp-clean.web.app/customer-portal?payment=success","cancel_url":"https://xp-clean.web.app/booking?payment=cancel"}'
```
