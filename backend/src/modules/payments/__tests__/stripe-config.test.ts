describe("client Stripe lorsque la capacité est désactivée", () => {
  const original = {
    enabled: process.env.ENABLE_STRIPE,
    secret: process.env.STRIPE_SECRET_KEY,
    webhook: process.env.STRIPE_WEBHOOK_SECRET,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries({
      ENABLE_STRIPE: original.enabled,
      STRIPE_SECRET_KEY: original.secret,
      STRIPE_WEBHOOK_SECRET: original.webhook,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.resetModules();
  });

  it("n'instancie pas Stripe avec une clé factice et refuse tout appel", async () => {
    process.env.ENABLE_STRIPE = "false";
    delete process.env.STRIPE_SECRET_KEY;
    jest.resetModules();
    const { stripe, STRIPE_CONFIG } = await import("../stripe");
    expect(STRIPE_CONFIG.webhookSecret).toBe("");
    expect(() => stripe.paymentIntents.create({ amount: 100, currency: "eur" })).toThrow("Stripe est désactivé ou incomplet");
  });

  it("utilise les clés de test fournies quand Stripe est activé", async () => {
    process.env.ENABLE_STRIPE = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_a16";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_a16";
    jest.resetModules();
    const { stripe, STRIPE_CONFIG } = await import("../stripe");
    expect(stripe).toHaveProperty("paymentIntents");
    expect(STRIPE_CONFIG.webhookSecret).toBe("whsec_a16");
  });
});
