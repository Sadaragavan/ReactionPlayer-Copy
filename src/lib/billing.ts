/**
 * Billing (Pro) — the seam for taking payment.
 *
 * The Subscription page talks only to `billing.adapter`. Two adapters ship:
 *
 *  - `StripeLinkAdapter`  used as soon as a Stripe Payment Link is configured
 *                         through Vite env vars. It redirects to Stripe-hosted
 *                         checkout with the user's email prefilled.
 *  - `DemoAdapter`        the fallback. It flips the plan on this device so the
 *                         whole Pro experience can be tried without an account.
 *
 *   VITE_STRIPE_LINK_MONTHLY   https://buy.stripe.com/…   (Payment Link, monthly price)
 *   VITE_STRIPE_LINK_YEARLY    https://buy.stripe.com/…   (Payment Link, yearly price)
 *   VITE_STRIPE_PORTAL_URL     https://billing.stripe.com/p/login/…   (customer portal link)
 *
 * Production note: a client-only app cannot prove that a payment happened. Set
 * the Payment Link's success URL to `<app>/#/settings/subscription` and let a
 * Stripe webhook on your server grant the entitlement; then replace
 * `settings.setTier` in the Subscription page with a call to that server.
 */
import type { BillingAdapter, BillingPlan, CheckoutResult, Profile } from './types';

const env = import.meta.env as Record<string, string | undefined>;

const LINKS: Record<BillingPlan, string | undefined> = {
  monthly: env.VITE_STRIPE_LINK_MONTHLY || undefined,
  yearly: env.VITE_STRIPE_LINK_YEARLY || undefined
};
const PORTAL = env.VITE_STRIPE_PORTAL_URL || undefined;

class StripeLinkAdapter implements BillingAdapter {
  readonly name = 'Stripe';
  readonly live = true;

  async startCheckout(plan: BillingPlan, profile: Profile): Promise<CheckoutResult> {
    const base = LINKS[plan];
    if (!base) throw new Error(`No Stripe Payment Link is configured for the ${plan} plan.`);
    const url = new URL(base);
    if (profile.email) url.searchParams.set('prefilled_email', profile.email);
    return { kind: 'redirect', url: url.toString() };
  }

  portalUrl(): string | null {
    return PORTAL ?? null;
  }
}

class DemoAdapter implements BillingAdapter {
  readonly name = 'Demo checkout';
  readonly live = false;

  async startCheckout(): Promise<CheckoutResult> {
    return { kind: 'activated' };
  }

  portalUrl(): string | null {
    return null;
  }
}

class Billing {
  adapter: BillingAdapter = LINKS.monthly || LINKS.yearly ? new StripeLinkAdapter() : new DemoAdapter();

  get live(): boolean {
    return this.adapter.live;
  }

  /** Whether `plan` can be bought right now through the active adapter. */
  canBuy(plan: BillingPlan): boolean {
    return !this.adapter.live || Boolean(LINKS[plan]);
  }

  startCheckout(plan: BillingPlan, profile: Profile): Promise<CheckoutResult> {
    return this.adapter.startCheckout(plan, profile);
  }

  portalUrl(customerId: string | undefined): string | null {
    return this.adapter.portalUrl(customerId);
  }
}

export const billing = new Billing();
