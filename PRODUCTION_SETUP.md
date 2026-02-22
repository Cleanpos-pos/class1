# CleanPOS Production Setup Guide

## Project Information

- **App Name:** CleanPOS (Class 1 Dry Cleaners)
- **Firebase Hosting:** https://xp-clean.web.app
- **GitHub:** https://github.com/Cleanpos-pos/class1
- **Supabase Project ID:** vpflahhfwnwvzphfrwnb
- **Supabase URL:** https://vpflahhfwnwvzphfrwnb.supabase.co

---

## 1. DATABASE SCHEMA SETUP

Run these SQL commands in Supabase SQL Editor:

```sql
-- Customer preferences columns
ALTER TABLE cp_customers
ADD COLUMN IF NOT EXISTS starch_level text DEFAULT 'None',
ADD COLUMN IF NOT EXISTS finish_style text DEFAULT 'On Hanger',
ADD COLUMN IF NOT EXISTS trouser_crease text DEFAULT 'Natural Crease',
ADD COLUMN IF NOT EXISTS auth_repairs boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS detergent text DEFAULT 'Standard Scent',
ADD COLUMN IF NOT EXISTS no_plastic boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS recycle_hangers boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Order preferences
ALTER TABLE cp_orders ADD COLUMN IF NOT EXISTS preferences jsonb;

-- App settings constraint
ALTER TABLE cp_app_settings ADD CONSTRAINT cp_app_settings_key_key UNIQUE (key);

-- Tenants Stripe flag
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_stripe_active boolean DEFAULT false;

-- Company settings Stripe Connect
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;
```

---

## 2. REQUIRED TABLES

Verify these tables exist:

| Table | Purpose |
|-------|---------|
| tenants | Multi-tenant store accounts |
| cp_customers | Customer records per tenant |
| cp_orders | Order records with items and status |
| cp_drivers | Delivery driver accounts |
| cp_services | Service items with pricing |
| cp_categories | Service categories |
| cp_app_settings | Key-value settings per tenant |
| staff | Admin/staff accounts |
| company_settings | Company info and Stripe Connect ID |
| cp_time_slots | Collection/delivery time slots |
| cp_delivery_options | Delivery pricing options |
| cp_discount_codes | Discount/promo codes |
| cp_promotions | BOGO and bundle promotions |

---

## 3. EDGE FUNCTION SECRETS

Set these in Supabase Dashboard → Edge Functions → Secrets:

| Secret Name | Description |
|-------------|-------------|
| STRIPE_SECRET_KEY | sk_live_xxx or sk_test_xxx |
| STRIPE_WEBHOOK_SECRET | whsec_xxx from Stripe webhook settings |
| BREVO_API_KEY | xkeysib-xxx for email sending |

---

## 4. DEPLOY EDGE FUNCTIONS

Three Stripe functions need deployment:

```bash
supabase functions deploy stripe-connect
supabase functions deploy stripe-payment
supabase functions deploy stripe-webhook
```

Function URLs after deployment:
- https://vpflahhfwnwvzphfrwnb.supabase.co/functions/v1/stripe-connect
- https://vpflahhfwnwvzphfrwnb.supabase.co/functions/v1/stripe-payment
- https://vpflahhfwnwvzphfrwnb.supabase.co/functions/v1/stripe-webhook

---

## 5. STRIPE WEBHOOK SETUP

In Stripe Dashboard → Developers → Webhooks:

1. Create endpoint: `https://vpflahhfwnwvzphfrwnb.supabase.co/functions/v1/stripe-webhook`

2. Select events:
   - account.updated
   - checkout.session.completed
   - payment_intent.succeeded
   - payment_intent.payment_failed

3. Copy the webhook signing secret to Supabase Edge Function secrets as STRIPE_WEBHOOK_SECRET

---

## 6. ROW LEVEL SECURITY (RLS)

Enable RLS on all tenant-scoped tables:

```sql
-- Enable RLS
ALTER TABLE cp_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_delivery_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_promotions ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policies for each table
-- Example for cp_customers:
CREATE POLICY "tenant_isolation_cp_customers" ON cp_customers
FOR ALL USING (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id');
```

---

## 7. PASSWORD SECURITY

The app uses bcrypt password hashing. Implementation:

- **Staff passwords:** stored in `staff.hashed_password`
- **Driver passwords:** stored in `cp_drivers.password_hash`
- **Hashing:** bcrypt with 10 salt rounds
- **Backwards compatible:** Plain text passwords still work but show warning

To hash a password manually:
```javascript
const bcrypt = require('bcryptjs');
const hashedPassword = await bcrypt.hash('password123', 10);
```

---

## 8. ENVIRONMENT VARIABLES

Frontend requires these in `.env.local`:

```env
VITE_SUPABASE_URL=https://vpflahhfwnwvzphfrwnb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwZmxhaGhmd253dnpwaGZyd25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3NzEzNjQsImV4cCI6MjA2NDM0NzM2NH0.OC1TijrakZYIG-jEWm4JaR8SqPht0qg5BSNptQ5VaaM
VITE_BREVO_API_KEY=your-brevo-api-key
GEMINI_API_KEY=your-gemini-api-key
```

---

## 9. CORS CONFIGURATION

Edge functions allow these origins:
- `*.cleanpos.app` (production subdomains)
- `https://cleanpos.app` (main domain)
- `http://localhost:*` (development)
- `http://127.0.0.1:*` (development)

---

## 10. DEPLOYMENT COMMANDS

```bash
# Build frontend
npm run build

# Deploy to Firebase
npx firebase deploy --only hosting

# Deploy Supabase functions
supabase functions deploy stripe-connect
supabase functions deploy stripe-payment
supabase functions deploy stripe-webhook
```

---

## 11. TESTING CHECKLIST

- [ ] Homepage loads correctly
- [ ] Tenant/store creation works
- [ ] Admin login works (back office)
- [ ] Driver signup and login works
- [ ] Customer signup and login works
- [ ] Services and categories display
- [ ] Cart and checkout works
- [ ] Stripe Connect onboarding completes
- [ ] Payments process successfully
- [ ] Order confirmation emails sent
- [ ] Real-time order updates work
- [ ] Driver portal shows assignments
- [ ] Reports generate correctly

---

## 12. PRIORITY TASKS

| Priority | Task |
|----------|------|
| HIGH | Deploy Edge Functions to Supabase |
| HIGH | Set Edge Function secrets (Stripe, Brevo) |
| HIGH | Configure Stripe webhooks |
| HIGH | Verify RLS policies are active |
| MEDIUM | Migrate plain text passwords to hashed |
| MEDIUM | Test full order flow |
| LOW | Configure custom domain (cleanpos.app) |

---

## 13. SUPPORT CONTACTS

- **Brevo (Email):** https://app.brevo.com
- **Stripe Dashboard:** https://dashboard.stripe.com
- **Supabase Dashboard:** https://supabase.com/dashboard/project/vpflahhfwnwvzphfrwnb
- **Firebase Console:** https://console.firebase.google.com/project/xp-clean

---

## File Structure

```
Class1/
├── App.tsx                 # Main application (9700+ lines)
├── index.tsx               # Entry point
├── index.html              # HTML template
├── styles.css              # Tailwind CSS
├── supabaseClient.ts       # Supabase connection
├── types.ts                # TypeScript types
├── vite.config.ts          # Build configuration
├── tailwind.config.js      # Tailwind configuration
├── postcss.config.js       # PostCSS configuration
├── tsconfig.json           # TypeScript configuration
├── package.json            # Dependencies
├── firebase.json           # Firebase hosting config
├── .firebaserc             # Firebase project link
├── .env.example            # Environment template
├── .gitignore              # Git ignore rules
├── components/
│   └── DeliveryMap.tsx     # Leaflet map component
├── services/
│   └── emailService.ts     # Brevo email functions
├── utils/
│   └── passwordUtils.ts    # bcrypt password hashing
└── supabase/
    └── functions/
        ├── stripe-connect/index.ts   # Stripe Connect onboarding
        ├── stripe-payment/index.ts   # Payment processing
        └── stripe-webhook/index.ts   # Webhook handler
```
