# ADR-003: Telegram-Based Payment Approval Flow

## Status
Accepted

## Context
The platform needed a payment processing system for subscription purchases and wallet recharges. Standard payment gateway integration was not available due to regulatory constraints (no access to Stripe, PayPal, or local Iranian payment gateways that support automated APIs reliably). The target user base (Iranian consumers) primarily uses bank transfers and receipt-based payments.

Options considered:

1. **Automated payment gateway** — not available due to sanctions/regulatory restrictions.
2. **Manual admin dashboard for payment approval** — requires building an admin UI, and admins would need to be in front of a computer.
3. **Telegram-based approval workflow** — leverages the fact that admins already use Telegram continuously. Approval can happen from a phone in seconds.

## Decision
Implement a receipt-upload → Telegram notification → inline button approval flow:

1. User uploads a payment receipt image via the frontend.
2. Backend stores the image in MinIO (S3-compatible storage).
3. Backend sends a Telegram message to the brand's report group with:
   - Payment details (amount, user, package)
   - The receipt image
   - Inline keyboard buttons: ✅ Accept / ❌ Reject
4. Admin taps Accept or Reject directly in Telegram.
5. Backend processes the callback:
   - **Accept**: Updates payment state to `APPLIED`, credits user balance or provisions the package, distributes profit to reseller hierarchy.
   - **Reject**: Updates payment state to `REJECTED`, notifies the user.

Payment states: `PENDING → APPLIED | REJECTED`

Payment types: `PACKAGE_PURCHASE`, `WALLET_RECHARGE`, `IRAN_SERVER_COST`, `EXTERNAL_SERVER_COST`

## Consequences

**Positive:**
- Zero integration with external payment providers — no API keys, no webhooks, no sandbox environments to maintain.
- Approval latency is typically under 60 seconds (admins have Telegram open on their phones).
- Full audit trail in Telegram (message history serves as a payment log).
- Works on mobile — admins can approve payments while away from a computer.
- Receipt images provide a verifiable proof of payment that can be reviewed later.
- Per-brand routing — each brand's payments go to its own Telegram report group.

**Negative:**
- Not automated — every payment requires a human approval step. This doesn't scale to thousands of transactions per hour.
- Dependent on Telegram API availability. Telegram outages block the payment flow.
- Race conditions possible if multiple admins tap Accept/Reject simultaneously (mitigated by checking payment state before processing).
- Receipt validation is manual and visual — no OCR or bank API verification.
- Telegram message size limits constrain the amount of context shown with each payment.

**Trade-off assessment:** For a platform processing hundreds of payments per day (not thousands per minute), the manual approval latency was acceptable. The Telegram interface eliminated the need for building a dedicated admin dashboard, saving significant development time for a solo developer.
