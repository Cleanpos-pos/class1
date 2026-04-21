# Security Improvements Applied

This document outlines the security fixes that have been applied and manual actions still required.

## ✅ Fixes Applied

### 1. Password Security
- **Fixed**: Customer passwords are now hashed with bcrypt (12 rounds) before storage
- **Fixed**: Password verification uses bcrypt.compare() instead of plain text comparison
- **Fixed**: Plain text passwords are now rejected (returns false instead of comparing)
- **File**: `utils/passwordUtils.ts`, `App.tsx`

### 2. Session Security
- **Fixed**: Master admin auth now uses sessionStorage with expiring tokens (4 hours)
- **Fixed**: Session tokens are cryptographically generated
- **Fixed**: Sessions are validated on page load with expiry check
- **File**: `App.tsx`

### 3. API Key Security
- **Fixed**: Removed GEMINI_API_KEY from client-side bundle (vite.config.ts)
- **Fixed**: Updated .env.example with security warnings
- **File**: `vite.config.ts`, `.env.example`

### 4. Security Headers (Firebase)
- **Added**: X-Content-Type-Options: nosniff
- **Added**: X-Frame-Options: DENY (clickjacking protection)
- **Added**: X-XSS-Protection: 1; mode=block
- **Added**: Referrer-Policy: strict-origin-when-cross-origin
- **Added**: Strict-Transport-Security (HSTS)
- **Added**: Content-Security-Policy
- **Added**: Permissions-Policy
- **File**: `firebase.json`

### 5. CORS Configuration
- **Fixed**: Restricted CORS to specific domains in production
- **Fixed**: Localhost only allowed in development mode on specific ports (3000, 5173)
- **Fixed**: Removed broad `.web.app` and `.firebaseapp.com` wildcards in production
- **Files**: `supabase/functions/stripe-payment/index.ts`, `stripe-webhook/index.ts`, `stripe-connect/index.ts`

### 6. Error Message Security
- **Fixed**: Edge Functions no longer expose internal error details to clients
- **Fixed**: Generic error messages returned instead of stack traces
- **Files**: All Supabase Edge Functions

### 7. Input Validation
- **Added**: Email format validation (RFC 5322 compliant regex)
- **Added**: Password minimum length validation (8 characters)
- **Added**: Input sanitization and length limits
- **File**: `utils/passwordUtils.ts`, `App.tsx`

### 8. Logging Security
- **Added**: Production-safe logger utility
- **Fixed**: Debug logs (console.log) disabled in production
- **Fixed**: Sensitive data sanitization in logs (passwords, API keys, tokens)
- **Files**: `utils/logger.ts`, `App.tsx`, `services/emailService.ts`, `services/GoogleMapsService.ts`

### 9. Cryptographic Improvements
- **Fixed**: Session token generation uses crypto.randomUUID() or crypto.getRandomValues()
- **Fixed**: Google Maps session tokens use secure UUID generation
- **File**: `services/GoogleMapsService.ts`

### 10. Dependency Vulnerabilities
- **Fixed**: Ran `npm audit fix` (fixed minimatch and rollup vulnerabilities)
- **Pending**: xlsx library has unfixed vulnerabilities (see below)

---

## ⚠️ Manual Actions Required

### 1. CRITICAL: Rotate Exposed API Keys
Your `.env.local` file contains real API keys that may have been exposed. You MUST:

```bash
# 1. Regenerate Supabase anon key
# Go to: Supabase Dashboard -> Settings -> API -> Regenerate anon key

# 2. Regenerate Brevo API key
# Go to: Brevo Dashboard -> SMTP & API -> API Keys -> Create new key

# 3. Delete old .env.local and create new one
rm .env.local
cp .env.example .env.local
# Then fill in the new keys
```

### 2. CRITICAL: Migrate Plain Text Passwords
Existing customers with plain text passwords will be locked out. Run this migration:

```sql
-- In Supabase SQL Editor, identify plain text passwords:
SELECT id, email, password
FROM cp_customers
WHERE password NOT LIKE '$2a$%' AND password NOT LIKE '$2b$%';

-- For each affected customer, reset their password via email
-- Or update passwords directly using bcrypt hashes
```

### 3. IMPORTANT: Verify Row Level Security (RLS)
Ensure RLS is enabled on all Supabase tables:

```sql
-- Check RLS status
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- Enable RLS on all cp_ tables
ALTER TABLE cp_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_order_items ENABLE ROW LEVEL SECURITY;
-- ... etc for all tables
```

### 4. IMPORTANT: Replace xlsx Library
The `xlsx` library has unfixed high-severity vulnerabilities:
- Prototype Pollution (GHSA-4r6h-8v6p-xvw6)
- ReDoS (GHSA-5pgg-2g8v-p4x9)

**Option A**: Replace with exceljs
```bash
npm uninstall xlsx
npm install exceljs
```
Then update App.tsx import and usage.

**Option B**: Move Excel parsing to backend Edge Function (recommended)

### 5. RECOMMENDED: Set Environment Variable for CORS
Add this to your Supabase Edge Function secrets:
```
ENVIRONMENT=production
```
This ensures CORS is strict in production.

### 6. RECOMMENDED: Add Rate Limiting
Consider adding rate limiting to:
- Login endpoints
- Edge Functions (stripe-payment, stripe-connect)
- Email sending

---

## Security Checklist Before Production

- [ ] All API keys rotated
- [ ] .env.local removed from git history (use `git filter-branch` or BFG)
- [ ] Plain text passwords migrated
- [ ] RLS enabled and tested on all tables
- [ ] xlsx library replaced or Excel parsing moved to backend
- [ ] ENVIRONMENT=production set in Edge Function secrets
- [ ] Firebase deploy completed with new security headers
- [ ] Edge Functions redeployed with new CORS settings

---

## Contact

If you discover a security vulnerability, please report it responsibly.
