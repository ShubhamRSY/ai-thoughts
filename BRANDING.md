# Brand AiTo on aito.social

Domain purchased on **Namecheap**: `aito.social`

## Do this now (Namecheap → Vercel)

### A. Add domain in Vercel
1. Open your project on [vercel.com](https://vercel.com)
2. **Settings → Domains → Add**
3. Add: `aito.social`
4. Also add: `www.aito.social` (optional but recommended) → redirect to `aito.social`

Vercel will show the exact DNS records. Use those if they differ from below.

### B. DNS in Namecheap
1. Namecheap → **Domain List** → `aito.social` → **Manage**
2. **Advanced DNS** tab
3. Remove old conflicting **A / CNAME / URL Redirect** records for `@` and `www` (parking pages)
4. Add:

| Type | Host | Value | TTL |
|------|------|--------|-----|
| **A Record** | `@` | `76.76.21.21` | Automatic |
| **CNAME Record** | `www` | `cname.vercel-dns.com` | Automatic |

> If Vercel shows different values, use **Vercel’s** values.

5. Save. Wait until Vercel Domains says **Valid** (often 5–30 min).

### C. Vercel env (Production) + Redeploy
```
NEXT_PUBLIC_SITE_URL=https://aito.social
NEXT_PUBLIC_CONTACT_EMAIL=keepers@aito.social
EMAIL_FROM=AiTo <signin@aito.social>
VAPID_SUBJECT=mailto:keepers@aito.social
```
Then **Redeploy** the latest production deployment.

### D. Resend (so OTP works for everyone)
1. [resend.com/domains](https://resend.com/domains) → Add `aito.social`
2. Copy Resend’s DNS records into Namecheap Advanced DNS
3. Wait until **Verified**
4. Confirm `EMAIL_FROM=AiTo <signin@aito.social>`

### E. Test
- Open https://aito.social
- Sign in with a friend’s email → code should arrive

Code in this repo already defaults native shells + contact fallbacks to `https://aito.social`.

## Checklist
- [ ] Vercel domain **Valid**
- [ ] Env vars set + redeployed
- [ ] Resend domain **Verified**
- [ ] https://aito.social loads
- [ ] OTP to a non-Resend test email works
