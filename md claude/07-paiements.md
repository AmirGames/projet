# PAIEMENTS - Stripe + Bancontact QR

---

## 1. ARCHITECTURE PAIEMENTS

```
┌──────────────────────────────────────────────────────────────┐
│                    PAYMENT FLOW DIAGRAM                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  COMMERÇANT - CONFIGURATION PAIEMENTS                       │
│  ├─ Bank Account Setup (Stripe Connect ou Bancontact)       │
│  ├─ Commission Rate (selon plan)                            │
│  └─ Payment Methods (Stripe, Bancontact QR)                 │
│                                                              │
│           ▼                                                  │
│                                                              │
│  CLIENT FLOW                                                │
│  ├─ Browse storefront                                       │
│  ├─ Add to cart                                             │
│  ├─ Checkout                                                │
│  │  └─ Choose payment method:                              │
│  │     ├─ Stripe (card, Apple Pay, Google Pay)            │
│  │     └─ Bancontact QR                                   │
│  └─ Complete payment                                        │
│                                                              │
│           ▼                                                  │
│                                                              │
│  STRIPE FLOW                     BANCONTACT FLOW            │
│  ├─ Create Payment Intent        ├─ Generate QR Code      │
│  ├─ Client confirms              ├─ Display QR             │
│  ├─ Webhook: payment.succeeded   ├─ Client scans           │
│  ├─ Create Payment record        ├─ App bancaire           │
│  ├─ Create Order                 ├─ Client paie            │
│  ├─ Create Payout (J+3)          ├─ Webhook: confirmed    │
│  ├─ Send notifications           ├─ Create Payment record  │
│  └─ Print order                  ├─ Create Order          │
│                                   ├─ Create Payout (J+3)   │
│                                   ├─ Send notifications     │
│                                   └─ Print order           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. CONFIGURATION STRIPE

### Dependencies

```bash
npm install stripe
npm install @stripe/stripe-js
npm install @stripe/react-stripe-js
```

### Backend Setup

```typescript
// lib/stripe.ts

import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
  typescript: true,
});
```

### Environment Variables

```env
STRIPE_PUBLIC_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_ACCOUNT=acct_...
```

---

## 3. PAIEMENT STRIPE - FLOW COMPLET

### Frontend: Checkout Stripe

```typescript
// components/CheckoutStripe.tsx

import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY!
);

interface CheckoutStripeProps {
  orderId: string;
  amount: number;
  onSuccess: () => void;
}

const CheckoutStripeContent: React.FC<CheckoutStripeProps> = ({
  orderId,
  amount,
  onSuccess,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!stripe || !elements) {
      return;
    }

    setLoading(true);

    try {
      // Step 1: Create Payment Intent
      const response = await fetch('/api/payments/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          amount,
          paymentMethod: 'stripe',
        }),
      });

      const { clientSecret } = await response.json();

      // Step 2: Confirm payment with card element
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement)!,
        },
      });

      if (result.error) {
        setError(result.error.message || 'Payment failed');
        setLoading(false);
      } else if (result.paymentIntent?.status === 'succeeded') {
        // Payment successful
        onSuccess();
      }
    } catch (error) {
      setError('Payment processing failed');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '20px' }}>
        <label>Informations de carte</label>
        <CardElement />
      </div>

      {error && (
        <div style={{ color: 'red', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !stripe}
        style={{
          padding: '10px 20px',
          backgroundColor: '#D71920',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        {loading ? 'Traitement...' : `Payer €${(amount / 100).toFixed(2)}`}
      </button>
    </form>
  );
};

export const CheckoutStripe: React.FC<CheckoutStripeProps> = (props) => {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutStripeContent {...props} />
    </Elements>
  );
};
```

### Backend: Create Payment Intent

```typescript
// api/payments/create-intent.ts

import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  const { orderId, amount, paymentMethod } = await request.json();

  try {
    // Fetch order
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        store: { include: { organization: true } },
      },
    });

    if (!order) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
      });
    }

    // Calculate fees
    const stripeFee = Math.round(amount * 0.029 + 30); // 2.9% + €0.30
    const commissionRate =
      order.store.organization.subscription?.plan.commissionRate || 0.03;
    const saasCommission = Math.round(amount * commissionRate);
    const netAmount = amount - stripeFee - saasCommission;

    // Create Stripe Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'eur',
      description: `Order ${order.orderNumber}`,
      metadata: {
        orderId: order.id,
        storeId: order.storeId,
        organizationId: order.store.organizationId,
        paymentMethod,
      },
      // For Connect: transfer to merchant account
      application_fee_amount: saasCommission + stripeFee,
    });

    // Save Payment record
    await prisma.payment.create({
      data: {
        orderId: order.id,
        paymentMethodId: 'stripe_default', // TODO: use actual method
        stripeId: paymentIntent.id,
        amount,
        currency: 'EUR',
        status: 'PROCESSING',
        processingFee: stripeFee,
        saasCommission,
        netAmount,
      },
    });

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      })
    );
  } catch (error) {
    console.error('Payment Intent creation failed:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create payment intent' }),
      { status: 500 }
    );
  }
}
```

### Stripe Webhook

```typescript
// api/webhooks/stripe.ts

import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { notificationService } from '@/services/notification';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );
  } catch (error) {
    console.error('Webhook verification failed:', error);
    return new Response('Invalid signature', { status: 400 });
  }

  // Handle different event types
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      // Update Payment record
      const payment = await prisma.payment.update({
        where: { stripeId: paymentIntent.id },
        data: {
          status: 'SUCCEEDED',
        },
        include: {
          order: { include: { store: true, customer: true } },
        },
      });

      // Update Order status
      await prisma.order.update({
        where: { id: payment.orderId },
        data: {
          paymentStatus: 'SUCCEEDED',
        },
      });

      // Create Payout (scheduled for J+3)
      const payoutDate = new Date();
      payoutDate.setDate(payoutDate.getDate() + 3);

      await prisma.payout.create({
        data: {
          paymentId: payment.id,
          organizationId: payment.order.store.organizationId,
          amount: payment.netAmount,
          currency: payment.currency,
          status: 'SCHEDULED',
          scheduledDate: payoutDate,
        },
      });

      // Send notifications
      await notificationService.sendOrderConfirmation(
        payment.order,
        'email'
      );
      await notificationService.sendMerchantOrderAlert(
        payment.order,
        'push'
      );

      // Print order (if connected to terminal)
      // await printService.printOrder(payment.order);

      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      // Update Payment
      await prisma.payment.update({
        where: { stripeId: paymentIntent.id },
        data: {
          status: 'FAILED',
        },
      });

      // Update Order
      const payment = await prisma.payment.findUnique({
        where: { stripeId: paymentIntent.id },
      });

      if (payment) {
        await prisma.order.update({
          where: { id: payment.orderId },
          data: {
            paymentStatus: 'FAILED',
            status: 'CANCELLED',
          },
        });
      }

      break;
    }

    case 'payment_intent.canceled': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      await prisma.payment.update({
        where: { stripeId: paymentIntent.id },
        data: { status: 'CANCELLED' },
      });

      break;
    }
  }

  return new Response(JSON.stringify({ received: true }));
}
```

---

## 4. BANCONTACT QR - FLOW COMPLET

### Frontend: Bancontact QR Component

```typescript
// components/CheckoutBancontactQR.tsx

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode.react';

interface CheckoutBancontactQRProps {
  orderId: string;
  amount: number;
  onSuccess: () => void;
}

export const CheckoutBancontactQR: React.FC<
  CheckoutBancontactQRProps
> = ({ orderId, amount, onSuccess }) => {
  const [qrCode, setQRCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  useEffect(() => {
    // Generate QR code
    const generateQR = async () => {
      try {
        const response = await fetch(
          '/api/payments/bancontact-qr',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId,
              amount,
            }),
          }
        );

        const { qrCode, paymentId: pId } = await response.json();
        setQRCode(qrCode);
        setPaymentId(pId);
        setLoading(false);

        // Poll for payment confirmation
        const checkPayment = setInterval(async () => {
          const checkResponse = await fetch(
            `/api/payments/status/${pId}`
          );
          const { status } = await checkResponse.json();

          if (status === 'CONFIRMED') {
            clearInterval(checkPayment);
            onSuccess();
          }
        }, 2000); // Check every 2 seconds

        // Timeout after 5 minutes
        setTimeout(() => clearInterval(checkPayment), 5 * 60 * 1000);
      } catch (error) {
        setError('Erreur lors de la génération du QR code');
        setLoading(false);
      }
    };

    generateQR();
  }, [orderId, amount, onSuccess]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px',
      }}
    >
      <h2>Paiement Bancontact</h2>

      {loading && <p>Génération du QR code...</p>}

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {qrCode && (
        <div
          style={{
            padding: '20px',
            border: '2px solid #D71920',
            borderRadius: '8px',
            backgroundColor: '#f5f5f5',
          }}
        >
          <QRCode value={qrCode} size={256} />
        </div>
      )}

      <div style={{ textAlign: 'center', color: '#666' }}>
        <p>Scannez ce QR code avec votre application bancaire</p>
        <p style={{ fontSize: '14px' }}>
          Montant : €{(amount / 100).toFixed(2)}
        </p>
        <p style={{ fontSize: '12px' }}>
          En attente de confirmation...
        </p>
      </div>
    </div>
  );
};
```

### Backend: Bancontact QR Generation

```typescript
// api/payments/bancontact-qr.ts

import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  const { orderId, amount } = await request.json();

  try {
    // Fetch order
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        store: { include: { organization: true } },
      },
    });

    if (!order) {
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        { status: 404 }
      );
    }

    // Calculate fees
    const bancontactFee = Math.round(amount * 0.01); // 1%
    const commissionRate =
      order.store.organization.subscription?.plan.commissionRate ||
      0.03;
    const saasCommission = Math.round(amount * commissionRate);
    const netAmount = amount - bancontactFee - saasCommission;

    // Create Payment record
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        paymentMethodId: 'bancontact_default',
        amount,
        currency: 'EUR',
        status: 'PENDING',
        processingFee: bancontactFee,
        saasCommission,
        netAmount,
      },
    });

    // Generate QR code data
    const qrData = {
      orderId: order.id,
      amount: (amount / 100).toFixed(2),
      merchantName: order.store.name,
      merchantIBAN: order.store.organization.paymentMethods[0]
        ?.bancontactAccount,
      paymentId: payment.id,
      timestamp: new Date().toISOString(),
    };

    // Encode as QR code value
    const qrValue = `bancontact://${Buffer.from(
      JSON.stringify(qrData)
    ).toString('base64')}`;

    return new Response(
      JSON.stringify({
        qrCode: qrValue,
        paymentId: payment.id,
        amount,
      })
    );
  } catch (error) {
    console.error('QR code generation failed:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to generate QR code',
      }),
      { status: 500 }
    );
  }
}
```

### Bancontact Webhook

```typescript
// api/webhooks/bancontact.ts

import { prisma } from '@/lib/prisma';
import { notificationService } from '@/services/notification';
import crypto from 'crypto';

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get(
    'x-bancontact-signature'
  )!;

  // Verify signature
  const hash = crypto
    .createHmac(
      'sha256',
      process.env.BANCONTACT_WEBHOOK_SECRET!
    )
    .update(body)
    .digest('hex');

  if (hash !== signature) {
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(body);

  switch (event.type) {
    case 'payment.confirmed': {
      const { paymentId, status } = event.data;

      // Update Payment record
      const payment = await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'SUCCEEDED',
          bancontactId: event.data.transactionId,
        },
        include: {
          order: {
            include: {
              store: true,
              customer: true,
            },
          },
        },
      });

      // Update Order
      await prisma.order.update({
        where: { id: payment.orderId },
        data: {
          paymentStatus: 'SUCCEEDED',
          status: 'ACCEPTED', // Auto-accept on payment
        },
      });

      // Create Payout
      const payoutDate = new Date();
      payoutDate.setDate(payoutDate.getDate() + 3);

      await prisma.payout.create({
        data: {
          paymentId: payment.id,
          organizationId:
            payment.order.store.organizationId,
          amount: payment.netAmount,
          currency: payment.currency,
          status: 'SCHEDULED',
          scheduledDate: payoutDate,
        },
      });

      // Send notifications
      await notificationService.sendOrderConfirmation(
        payment.order,
        'email'
      );
      await notificationService.sendMerchantOrderAlert(
        payment.order,
        'push'
      );

      break;
    }

    case 'payment.failed': {
      const { paymentId } = event.data;

      // Update Payment
      await prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'FAILED' },
      });

      // Update Order
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });

      if (payment) {
        await prisma.order.update({
          where: { id: payment.orderId },
          data: {
            paymentStatus: 'FAILED',
            status: 'CANCELLED',
          },
        });
      }

      break;
    }
  }

  return new Response(JSON.stringify({ received: true }));
}
```

---

## 5. GESTION DES FRAIS & COMMISSIONS

### Commission Calculation Service

```typescript
// services/commission.service.ts

export class CommissionService {
  static calculateCommission(
    orderAmount: number,
    paymentMethod: 'stripe' | 'bancontact',
    commissionRate: number
  ): CommissionBreakdown {
    // Payment processor fees
    const processingFee =
      paymentMethod === 'stripe'
        ? Math.round(orderAmount * 0.029 + 30)
        : Math.round(orderAmount * 0.01);

    // Platform commission
    const saasCommission = Math.round(
      orderAmount * commissionRate
    );

    // Net to merchant
    const netAmount = orderAmount - processingFee - saasCommission;

    return {
      orderAmount,
      processingFee,
      processingFeePercent:
        (processingFee / orderAmount) * 100,
      saasCommission,
      saasCommissionPercent:
        (saasCommission / orderAmount) * 100,
      netAmount,
      netAmountPercent: (netAmount / orderAmount) * 100,
    };
  }

  static calculateCustomerAmount(
    basePrice: number,
    deliveryFee: number = 0,
    discountAmount: number = 0
  ): number {
    return basePrice + deliveryFee - discountAmount;
  }
}

interface CommissionBreakdown {
  orderAmount: number;
  processingFee: number;
  processingFeePercent: number;
  saasCommission: number;
  saasCommissionPercent: number;
  netAmount: number;
  netAmountPercent: number;
}
```

### Example Commission Breakdown

```
Commande = €50.00
│
├─ FREE plan (3% commission)
│  ├─ Stripe fees: -€1.55 (2.9% + €0.30)
│  ├─ SaaS commission: -€1.50 (3%)
│  └─ Net to merchant: €46.95 (93.9%)
│
├─ PREMIUM plan (2% commission)
│  ├─ Stripe fees: -€1.55
│  ├─ SaaS commission: -€1.00 (2%)
│  └─ Net to merchant: €47.45 (94.9%)
│
└─ PRO plan (1% commission)
   ├─ Stripe fees: -€1.55
   ├─ SaaS commission: -€0.50 (1%)
   └─ Net to merchant: €47.95 (95.9%)

Bancontact QR (1% processor fee):
│
├─ FREE plan (3% commission)
│  ├─ Bancontact fees: -€0.50 (1%)
│  ├─ SaaS commission: -€1.50 (3%)
│  └─ Net to merchant: €48.00 (96%)
│
└─ PRO plan (1% commission)
   ├─ Bancontact fees: -€0.50
   ├─ SaaS commission: -€0.50
   └─ Net to merchant: €49.00 (98%)
```

---

## 6. PAYOUT MANAGEMENT

### Automatic Payout Service

```typescript
// services/payout.service.ts

export class PayoutService {
  // Scheduled job (runs daily at 2 AM)
  static async processDuePayouts() {
    const now = new Date();

    // Find payouts that are due (scheduled date <= now)
    const duePayouts = await prisma.payout.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledDate: { lte: now },
      },
      include: {
        payment: true,
        organization: {
          include: {
            paymentMethods: { where: { isDefault: true } },
          },
        },
      },
    });

    for (const payout of duePayouts) {
      try {
        // Process payout based on payment method
        const payment = payout.payment;

        if (payment.stripeId) {
          await this.processStripePayout(payout);
        } else if (payment.bancontactId) {
          await this.processBancontactPayout(payout);
        }
      } catch (error) {
        console.error(`Payout ${payout.id} failed:`, error);

        // Mark as failed, retry tomorrow
        await prisma.payout.update({
          where: { id: payout.id },
          data: { status: 'FAILED' },
        });
      }
    }
  }

  private static async processStripePayout(payout: any) {
    // Transfer to connected account
    const transfer = await stripe.transfers.create({
      amount: Math.round(payout.amount * 100), // convert to cents
      currency: 'eur',
      destination: payout.organization.paymentMethods[0]
        ?.stripeBankAccount,
      metadata: {
        payoutId: payout.id,
        organizationId: payout.organizationId,
      },
    });

    // Mark as completed
    await prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: 'COMPLETED',
        stripePayout: transfer.id,
        completedDate: new Date(),
      },
    });
  }

  private static async processBancontactPayout(
    payout: any
  ) {
    // Transfer via Bancontact API
    const transfer = await bancontactAPI.createTransfer({
      amount: payout.amount,
      currency: 'EUR',
      beneficiary: {
        iban: payout.organization.paymentMethods[0]
          ?.bancontactAccount,
      },
      reference: `PAYOUT-${payout.id}`,
    });

    // Mark as completed
    await prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: 'COMPLETED',
        completedDate: new Date(),
      },
    });
  }
}
```

### Schedule with node-cron

```typescript
// jobs/payout-scheduler.ts

import cron from 'node-cron';
import { PayoutService } from '@/services/payout.service';

export function initPayoutScheduler() {
  // Run daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('[Payout Scheduler] Processing due payouts...');
    try {
      await PayoutService.processDuePayouts();
      console.log('[Payout Scheduler] Completed');
    } catch (error) {
      console.error('[Payout Scheduler] Failed:', error);
    }
  });
}
```

---

## RÉSUMÉ PAIEMENTS

| Aspect | Détail |
|--------|--------|
| **Stripe** | Cartes, Apple Pay, Google Pay |
| **Bancontact QR** | QR code scan → app bancaire |
| **Webhook** | Payment confirmation automation |
| **Commission** | Configurable par plan (1-3%) |
| **Frais** | Déduits avant payout |
| **Payout** | Automatique J+3 |
| **Isolation** | Chaque merchant = account séparé |
| **Security** | Webhook signature verification |

---

**PROCHAINE ÉTAPE** : MVP Phases ? 👉
