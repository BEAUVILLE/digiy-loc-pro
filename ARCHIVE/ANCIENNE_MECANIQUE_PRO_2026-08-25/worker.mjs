import { createClient } from "@supabase/supabase-js";

// Node 18+ a fetch natif (Node 24 OK chez toi)
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY, // ⚠️ worker only (jamais côté client)
  PULSE_API_BASE = "http://127.0.0.1:3200",
  LOC_PULSE_API_KEY,
  WORKER_BATCH = "10",
  WORKER_INTERVAL_MS = "1500",
  WORKER_NAME = "pulse-worker-1",
} = process.env;

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (worker only)");
if (!LOC_PULSE_API_KEY) throw new Error("Missing LOC_PULSE_API_KEY");
if (!PULSE_API_BASE) throw new Error("Missing PULSE_API_BASE");

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function claimBatch(limit) {
  const { data, error } = await sb.rpc("digiy_loc_pulse_claim_batch", { p_limit: limit });
  if (error) throw error;
  return data || [];
}

async function ack(id, ok, provider_result = {}, error_msg = null) {
  const { error } = await sb.rpc("digiy_loc_pulse_ack", {
    p_id: id,
    p_ok: ok,
    p_provider_result: provider_result,
    p_error: error_msg,
  });
  if (error) throw error;
}

async function sendToPulseAPI(job) {
  const body = {
    channel: job.channel,
    phone: job.phone,
    business_code: job.business_code,
    pulse_kind: job.pulse_kind,
    message: job.message,
    payload: job.payload ?? {},
    outbox_id: job.id,
    reservation_id: job.reservation_id ?? null,
  };

  const res = await fetch(`${PULSE_API_BASE}/loc/pulse/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": LOC_PULSE_API_KEY,
      "x-request-id": `wk_${WORKER_NAME}_${Date.now()}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep text */ }

  if (!res.ok) {
    const msg = json?.error || `HTTP_${res.status}: ${text.slice(0, 400)}`;
    const err = new Error(msg);
    err.status = res.status;
    err.response = json || text;
    throw err;
  }

  return json || { ok: true };
}

async function loop() {
  const limit = parseInt(WORKER_BATCH, 10);
  const interval = parseInt(WORKER_INTERVAL_MS, 10);

  console.log(`[worker] ${WORKER_NAME} up. base=${PULSE_API_BASE} batch=${limit} interval=${interval}ms`);

  while (true) {
    try {
      const jobs = await claimBatch(limit);

      if (!jobs.length) {
        await sleep(interval);
        continue;
      }

      for (const job of jobs) {
        const tag = `${job.business_code}/${job.pulse_kind}/${job.phone}`;
        try {
          console.log(`[worker] send ${job.id} -> ${tag}`);
          const provider_result = await sendToPulseAPI(job);
          await ack(job.id, true, provider_result, null);
          console.log(`[worker] ✅ sent ${job.id}`);
        } catch (e) {
          console.error(`[worker] ❌ fail ${job.id}`, e?.message || e);
          // ack en retry/failed via RPC
          await ack(job.id, false, {}, e?.message || "send failed");
        }
      }
    } catch (e) {
      console.error("[worker] LOOP ERROR", e?.message || e);
      await sleep(2000);
    }
  }
}

loop().catch((e) => {
  console.error("[worker] FATAL", e);
  process.exit(1);
});
