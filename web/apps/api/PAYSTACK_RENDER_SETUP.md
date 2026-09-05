# Paystack on Render — setup checklist

Everything Paystack needs lives on the **Render API service** (the Nest app in
`apps/api`). Never put these on Vercel, never commit them.

Full reference: [`web/docs/PAYSTACK.md`](../../docs/PAYSTACK.md).

---

## 1. Get your keys from Paystack

Paystack Dashboard → **Settings → API Keys & Webhooks**.

| You need | Looks like |
| --- | --- |
| Secret Key | `sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (`sk_test_…` for staging) |
| Public Key | `pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

Your Paystack account also has a **settlement currency** (Settings → Preferences).
For M-Pesa that is **KES**. Note it — you need it in step 2.

---

## 2. Add the environment variables in Render

Render Dashboard → your **API service** → **Environment** → **Add Environment
Variable**. Add these, then **Save changes** (Render redeploys automatically).

```
PAYSTACK_SECRET_KEY=sk_live_your_real_secret_key
PAYSTACK_PUBLIC_KEY=pk_live_your_real_public_key
PAYSTACK_CURRENCY=KES
PAYSTACK_USD_RATE=129
```

| Variable | Required | Notes |
| --- | --- | --- |
| `PAYSTACK_SECRET_KEY` | **yes** | Enables Paystack. Also verifies webhook signatures. Keep secret. |
| `PAYSTACK_PUBLIC_KEY` | recommended | Returned to the browser by `/payments/paystack/status`. |
| `PAYSTACK_CURRENCY` | **yes for M-Pesa** | Must exactly match your Paystack settlement currency. `KES` for M-Pesa. Defaults to `USD` if unset — and most accounts cannot charge USD, so leaving it wrong makes checkout fail. |
| `PAYSTACK_USD_RATE` | **yes when currency ≠ USD** | How many units of `PAYSTACK_CURRENCY` equal 1 USD. E.g. `129` means $4.99 → 499 → 64 371 KES subunit. The app refuses to charge rather than guess. Update it when the FX rate drifts. |

### Also check `APP_URL` (same API service)

Paystack redirects the customer back to `APP_URL` after payment:

```
APP_URL=https://your-web-domain.com        # the Vercel web app, NOT the API host
```

If this is missing or points at the API host, payment succeeds on Paystack but
the customer lands on a broken page (the webhook still grants access — see step 3).

---

## 3. Register the webhook in Paystack

Paystack Dashboard → **Settings → API Keys & Webhooks** → **Webhook URL**:

```
https://your-api-host.onrender.com/webhooks/paystack
```

Use your real Render API URL (or the custom API domain if you have one).
Paystack signs each call with HMAC-SHA512; the app rejects anything unsigned or
mismatched. Only `charge.success` is acted on.

---

## 4. Verify it worked

After the Render redeploy finishes:

**a. Check the boot log** (Render → Logs) for:

```
Paystack enabled=true mode=live secretKey=set publicKey=set currency=KES
```

**b. Hit the status endpoint:**

```
curl https://your-api-host.onrender.com/payments/paystack/status
```

Expected:

```json
{ "enabled": true, "mode": "live", "currency": "KES", "publicKey": "pk_live_..." }
```

If you get **`404` / "Cannot GET"** instead of JSON, the deployed API build is
older than the Paystack code — redeploy the Render service from the branch that
has `apps/api/src/payments/paystack-*`. Until then the web app shows the
"gateway temporarily unavailable" notice on the M-Pesa tab (it treats the
missing route as "disabled"), and `curl .../payments/paystack/status` through
the web host (`https://your-web-domain.com/backend/payments/paystack/status`)
also 404s.

### Build fails with `Root directory "api" does not exist`

After the monorepo move the API lives at **`web/apps/api`**, not `api`. Render
→ your API service → **Settings → Build & Deploy**:

| Setting | Value |
| --- | --- |
| Root Directory | `web/apps/api` |
| Dockerfile Path | `./Dockerfile` (relative to the root dir) |

Save → **Manual Deploy → Deploy latest commit**. The repo-root [`render.yaml`](../../../render.yaml)
records this config; you don't have to adopt the blueprint — fixing the one
field above is enough, and it keeps the existing service URL, database and
secrets.

Also confirm the service is connected to **this** repo
(`github.com/firt-project/calafdoon`, branch `main`). A deploy history showing
commits that aren't in `git log` means it's still wired to the old pre-fork repo
and your pushes never reach it.

**c. On the site**, open the payment page → the **Paystack M-Pesa** tab shows the
pay button (not the "temporarily unavailable" notice).

**d. Test a real payment** with `sk_test_…` / `pk_test_…` keys first (see
`web/docs/PAYSTACK.md` → Testing) before switching to live keys.

---

## Quick copy-paste (staging / test)

```
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAYSTACK_CURRENCY=KES
PAYSTACK_USD_RATE=129
APP_URL=https://your-web-domain.com
```

Webhook: `https://your-api-host.onrender.com/webhooks/paystack`
