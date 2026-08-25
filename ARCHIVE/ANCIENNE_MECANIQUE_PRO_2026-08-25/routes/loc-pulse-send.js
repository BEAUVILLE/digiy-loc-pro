// routes/loc-pulse-send.js
import express from "express";

const router = express.Router();

/**
 * DIGIY LOC — PULSE SEND ONLY (API)
 * --------------------------------
 * Endpoint appelé UNIQUEMENT par le worker VPS (claim outbox).
 *
 * Sécurité :
 * - Header x-api-key obligatoire
 * - Validation payload stricte
 *
 * Pas de Supabase ici (send-only)
 * Le worker fait : claim → call API → mark sent/failed
 */

/* =========================
   HELPERS
========================= */

function reqId(req) {
  return (
    req.headers["x-request-id"]?.toString() ||
    `req_${Date.now()}_${Math.random().toString(16).slice(2)}`
  );
}

function requireApiKey(req) {
  const expected = process.env.LOC_PULSE_API_KEY || "";
  if (!expected) {
    return { ok: false, code: 500, error: "LOC_PULSE_API_KEY missing on API" };
  }

  const got = (req.headers["x-api-key"] || "").toString().trim();
  if (!got || got !== expected) {
    return { ok: false, code: 401, error: "Invalid API key" };
  }

  return { ok: true };
}

function normalizePhone(phone) {
  if (!phone) return "";
  let p = String(phone).trim().replace(/\s+/g, "");

  // Option terrain Sénégal : force +221 si numéro local
  if (!p.startsWith("+") && /^[0-9]{9}$/.test(p)) {
    p = "+221" + p;
  }

  return p;
}

/* =========================
   VALIDATION
========================= */

function validateBody(body) {
  const errors = [];

  const channel = (body?.channel || "").toString().trim().toLowerCase();
  const phone = normalizePhone(body?.phone);
  const business_code = (body?.business_code || "").toString().trim();
  const pulse_kind = (body?.pulse_kind || "").toString().trim();

  const payload = body?.payload ?? {};
  const message = (body?.message || payload?.message || "").toString().trim();

  if (!channel) errors.push("channel required");
  if (!["whatsapp", "sms"].includes(channel))
    errors.push("channel must be whatsapp|sms");

  if (!phone) errors.push("phone required");
  if (!business_code) errors.push("business_code required");
  if (!pulse_kind) errors.push("pulse_kind required");

  if (!message) errors.push("message required");

  const reservation_id = body?.reservation_id || payload?.reservation_id || null;
  const outbox_id = body?.outbox_id || payload?.outbox_id || null;

  return {
    ok: errors.length === 0,
    errors,
    clean: {
      channel,
      phone,
      business_code,
      pulse_kind,
      message,
      payload,
      reservation_id,
      outbox_id,
    },
  };
}

/* =========================
   ROUTE
========================= */

/**
 * POST /loc/pulse/send
 *
 * Body minimal:
 * {
 *   "channel":"whatsapp",
 *   "phone":"+22177...",
 *   "business_code":"SALY01",
 *   "pulse_kind":"J-1",
 *   "message":"Rappel réservation...",
 *   "payload":{},
 *   "outbox_id":"uuid",
 *   "reservation_id":"uuid"
 * }
 */
router.post("/send", async (req, res) => {
  const rid = reqId(req);

  // ✅ API KEY
  const auth = requireApiKey(req);
  if (!auth.ok) {
    return res.status(auth.code).json({
      ok: false,
      request_id: rid,
      error: auth.error,
    });
  }

  // ✅ VALIDATION
  const v = validateBody(req.body);
  if (!v.ok) {
    return res.status(400).json({
      ok: false,
      request_id: rid,
      error: "Invalid payload",
      details: v.errors,
    });
  }

  const {
    channel,
    phone,
    business_code,
    pulse_kind,
    message,
    payload,
    outbox_id,
    reservation_id,
  } = v.clean;

  console.log(
    `[LOC-PULSE] send → ${channel} → ${phone} (${business_code}/${pulse_kind})`
  );

  try {
    // ✅ Provider result
    let provider_result = null;

    if (channel === "whatsapp") {
      provider_result = await sendWhatsApp({
        phone,
        message,
        payload,
      });
    } else {
      provider_result = await sendSMS({
        phone,
        message,
        payload,
      });
    }

    return res.json({
      ok: true,
      request_id: rid,
      sent: true,
      channel,
      phone,
      business_code,
      pulse_kind,
      outbox_id,
      reservation_id,
      provider_result,
      env: process.env.DIGIY_ENV || "prod",
    });
  } catch (e) {
    console.error("[LOC-PULSE] SEND FAILED", rid, e);

    return res.status(502).json({
      ok: false,
      request_id: rid,
      error: e?.message || "Send failed",
    });
  }
});

/* =========================
   PROVIDERS (STUBS)
========================= */

/**
 * WhatsApp Provider Stub
 * → Remplacer par Meta Cloud API ou Twilio
 */
async function sendWhatsApp({ phone, message }) {
  // TODO: branch Meta Cloud API
  return {
    provider: "stub-whatsapp",
    to: phone,
    status: "queued",
    message_id: `wa_${Date.now()}`,
    preview: message.slice(0, 140),
  };
}

/**
 * SMS Provider Stub
 */
async function sendSMS({ phone, message }) {
  return {
    provider: "stub-sms",
    to: phone,
    status: "queued",
    message_id: `sms_${Date.now()}`,
    preview: message.slice(0, 140),
  };
}

export default router;
