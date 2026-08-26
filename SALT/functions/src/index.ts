/**
 * SALT Cloud Functions
 * - Membership approval → activate user + welcome email + push
 * - Stripe webhook for dues payments
 * - Messaging helpers (unread counts + push on new message)
 * - New application notification to board
 */

import * as admin from "firebase-admin";
import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as nodemailer from "nodemailer";
import Stripe from "stripe";

admin.initializeApp();
const db = admin.firestore();

// Secrets (set via: firebase functions:secrets:set STRIPE_SECRET_KEY etc.)
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sendPush(tokens: string[], title: string, body: string, data?: Record<string, string>) {
  if (!tokens.length) return;
  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: { title, body },
    data: data ?? {},
    apns: {
      payload: {
        aps: { sound: "default", badge: 1 },
      },
    },
  };
  const res = await admin.messaging().sendEachForMulticast(message);
  console.log(`Push sent: ${res.successCount} success, ${res.failureCount} failure`);
}

async function getUserFcmToken(uid: string): Promise<string | null> {
  const snap = await db.collection("users").doc(uid).get();
  return snap.data()?.fcmToken ?? null;
}

async function getBoardFcmTokens(): Promise<string[]> {
  const snap = await db.collection("users").where("isBoardMember", "==", true).get();
  return snap.docs
    .map((d) => d.data().fcmToken as string | undefined)
    .filter((t): t is string => !!t);
}

function createMailTransport(user: string, pass: string) {
  // Example uses Gmail / Google Workspace. Swap for SendGrid, Mailgun, etc.
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

// ---------------------------------------------------------------------------
// 1. Membership Application Approved
//    Trigger: membershipApplications/{id} status → "approved"
// ---------------------------------------------------------------------------

export const onMembershipApproved = onDocumentUpdated(
  {
    document: "membershipApplications/{appId}",
    secrets: [smtpUser, smtpPass],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.status === "approved" || after.status !== "approved") return;

    const userId = after.userId as string;
    const email = after.email as string;
    const fullName = after.fullName as string;

    // Ensure user profile is active (client also does this, but double-safe)
    await db.collection("users").doc(userId).set(
      { membershipStatus: "active" },
      { merge: true }
    );

    // Welcome email
    try {
      const transporter = createMailTransport(smtpUser.value(), smtpPass.value());
      await transporter.sendMail({
        from: `"SALT – Savannah Area Local Tours" <${smtpUser.value()}>`,
        to: email,
        subject: "Welcome to SALT – Your Membership is Approved!",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
            <h1 style="color: #6B2E8C;">Welcome to SALT</h1>
            <p>Hi ${fullName},</p>
            <p>Your membership application has been <strong>approved</strong> by the SALT Board of Directors.</p>
            <p>You now have full access to:</p>
            <ul>
              <li>Member Directory &amp; networking</li>
              <li>Events at member pricing</li>
              <li>Job Board (free postings)</li>
              <li>Resources &amp; advocacy updates</li>
              <li>Direct messaging with fellow members</li>
            </ul>
            <p>Tagline: <em>Connect • Network • Grow</em></p>
            <p>Open the SALT app to get started.</p>
            <p style="color: #888; font-size: 13px; margin-top: 32px;">
              SALT – Savannah Area Local Tours<br/>
              Independent, member-supported nonprofit founded in 2025
            </p>
          </div>
        `,
      });
      console.log(`Welcome email sent to ${email}`);
    } catch (err) {
      console.error("Email error:", err);
    }

    // Push notification
    const token = await getUserFcmToken(userId);
    if (token) {
      await sendPush(
        [token],
        "Membership Approved 🎉",
        "Welcome to SALT! Your application was approved. Open the app to connect.",
        { type: "membership_approved" }
      );
    }
  }
);

// ---------------------------------------------------------------------------
// 2. New Membership Application → notify Board
// ---------------------------------------------------------------------------

export const onNewApplication = onDocumentCreated(
  {
    document: "membershipApplications/{appId}",
  },
  async (event) => {
    const data = event.data?.data();
    if (!data || data.status !== "pending") return;

    const tokens = await getBoardFcmTokens();
    if (!tokens.length) return;

    await sendPush(
      tokens,
      "New Membership Application",
      `${data.fullName}${data.businessName ? ` (${data.businessName})` : ""} applied to join SALT.`,
      { type: "new_application", applicationId: event.params.appId }
    );
  }
);

// ---------------------------------------------------------------------------
// 3. New Chat Message → increment unread + push to recipient
// ---------------------------------------------------------------------------

export const onNewMessage = onDocumentCreated(
  {
    document: "messages/{messageId}",
  },
  async (event) => {
    const msg = event.data?.data();
    if (!msg) return;

    const conversationId = msg.conversationId as string;
    const senderId = msg.senderId as string;
    const text = (msg.text as string) || "";
    const senderName = (msg.senderName as string) || "Someone";

    const convoRef = db.collection("conversations").doc(conversationId);
    const convoSnap = await convoRef.get();
    if (!convoSnap.exists) return;

    const convo = convoSnap.data()!;
    const participants: string[] = convo.participantIds || [];
    const recipientId = participants.find((id) => id !== senderId);
    if (!recipientId) return;

    // Increment unread for recipient
    await convoRef.update({
      [`unreadCount.${recipientId}`]: admin.firestore.FieldValue.increment(1),
      lastMessage: text,
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSenderId: senderId,
    });

    // Push
    const token = await getUserFcmToken(recipientId);
    if (token) {
      await sendPush(
        [token],
        senderName,
        text.length > 80 ? text.slice(0, 80) + "…" : text,
        {
          type: "new_message",
          conversationId,
        }
      );
    }
  }
);

// ---------------------------------------------------------------------------
// 4. Stripe Webhook – Dues Payment
//    Endpoint: https://<region>-<project>.cloudfunctions.net/stripeWebhook
// ---------------------------------------------------------------------------

export const stripeWebhook = onRequest(
  {
    secrets: [stripeSecretKey, stripeWebhookSecret],
    cors: false,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const stripe = new Stripe(stripeSecretKey.value(), {
      apiVersion: "2023-10-16",
    });

    const sig = req.headers["stripe-signature"] as string;
    let event: Stripe.Event;

    try {
      // rawBody is available on Cloud Functions gen2 when configured
      event = stripe.webhooks.constructEvent(
        (req as any).rawBody || req.body,
        sig,
        stripeWebhookSecret.value()
      );
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const userId = pi.metadata?.userId;
      const paymentDocId = pi.metadata?.paymentDocId;
      const year = pi.metadata?.year || String(new Date().getFullYear());

      if (userId) {
        // Mark payment as paid
        if (paymentDocId) {
          await db.collection("payments").doc(paymentDocId).set(
            {
              status: "paid",
              paidAt: admin.firestore.FieldValue.serverTimestamp(),
              stripePaymentIntentId: pi.id,
              amount: (pi.amount || 0) / 100,
            },
            { merge: true }
          );
        }

        // Extend / confirm active membership
        await db.collection("users").doc(userId).set(
          {
            membershipStatus: "active",
            duesPaidThrough: year,
            lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        // Thank-you push
        const token = await getUserFcmToken(userId);
        if (token) {
          await sendPush(
            [token],
            "Payment Received",
            `Thank you! Your SALT membership dues for ${year} are paid.`,
            { type: "payment_success" }
          );
        }

        console.log(`Dues payment succeeded for user ${userId}`);
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const paymentDocId = pi.metadata?.paymentDocId;
      if (paymentDocId) {
        await db.collection("payments").doc(paymentDocId).set(
          { status: "failed" },
          { merge: true }
        );
      }
    }

    res.json({ received: true });
  }
);

// ---------------------------------------------------------------------------
// 5. Callable-style helper: create Stripe PaymentIntent for dues
//    Call from iOS via HTTPS or a thin callable wrapper
// ---------------------------------------------------------------------------

export const createDuesPaymentIntent = onRequest(
  {
    secrets: [stripeSecretKey],
    cors: true,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // Basic auth check – in production verify Firebase ID token
    const { userId, tier, amount, paymentDocId } = req.body;
    if (!userId || !amount) {
      res.status(400).json({ error: "userId and amount required" });
      return;
    }

    const stripe = new Stripe(stripeSecretKey.value(), {
      apiVersion: "2023-10-16",
    });

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(Number(amount) * 100), // cents
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: {
          userId,
          tier: tier || "",
          paymentDocId: paymentDocId || "",
          year: String(new Date().getFullYear()),
        },
        description: `SALT Membership Dues – ${tier || "Member"}`,
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);
