import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

// VAPID_PUBLIC_JWK and VAPID_PRIVATE_KEY are the JWK pair used to sign push
// messages. VAPID_PUBLIC_KEY is not read here. That secret is the unpadded
// base64url application server key, and it must be the raw public key of this
// same pair. The service role key stays in this process and is not returned.

interface ClaimedNotice {
  id: string;
  audience: "admin" | "customer";
  recipient_id: string | null;
  title: string;
  body: string;
  link_path: string;
  attempts: number;
  claim_token: string;
}

interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
}

interface SendTally {
  sent: number;
  gone: number;
  temporary: number;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  const cronSecret = Deno.env.get("PUSH_CRON_SECRET") ?? "";
  const provided = req.headers.get("x-push-cron-secret") ?? "";
  if (!cronSecret || !sameSecret(provided, cronSecret)) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const server = await applicationServer();
    const supabase = supabaseAdmin();
    const claim = await claimReady(supabase);
    const summary = {
      released: claim.released,
      claimed: claim.claimed.length,
      sent: 0,
      failed: 0,
      abandoned: 0,
      lostClaim: 0,
    };
    for (const notice of claim.claimed) {
      const outcome = await deliverNotice(supabase, server, notice);
      summary[outcome] += 1;
    }
    return Response.json(summary);
  } catch (_error) {
    return Response.json({ error: "push send failed" }, { status: 500 });
  }
});

function supabaseAdmin(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) {
    throw new Error("push service is not configured");
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function applicationServer(): Promise<webpush.ApplicationServer> {
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "";
  if (!subject.startsWith("mailto:")) {
    throw new Error("vapid subject is not configured");
  }
  const vapidKeys = await webpush.importVapidKeys({
    publicKey: readJwk("VAPID_PUBLIC_JWK"),
    privateKey: readJwk("VAPID_PRIVATE_KEY"),
  });
  return await webpush.ApplicationServer.new({
    contactInformation: subject,
    vapidKeys: vapidKeys,
  });
}

function readJwk(name: string): JsonWebKey {
  const raw = Deno.env.get(name);
  if (!raw) {
    throw new Error("missing vapid key");
  }
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("vapid key must be a jwk object");
  }
  return parsed as JsonWebKey;
}

async function claimReady(
  supabase: SupabaseClient,
): Promise<{ released: number; claimed: ClaimedNotice[] }> {
  const { data, error } = await supabase.rpc("claim_notification_outbox");
  if (error) {
    throw new Error("claim failed");
  }
  return parseClaim(data);
}

function parseClaim(data: unknown): { released: number; claimed: ClaimedNotice[] } {
  const payload = typeof data === "string" ? JSON.parse(data) : data;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("claim failed");
  }
  const released = payload.released;
  const claimed = payload.claimed;
  if (typeof released !== "number" || !Number.isInteger(released) || released < 0) {
    throw new Error("claim failed");
  }
  if (!Array.isArray(claimed) || claimed.length > 20) {
    throw new Error("claim failed");
  }
  return {
    released: released,
    claimed: claimed.map(parseNotice),
  };
}

function parseNotice(row: unknown): ClaimedNotice {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("claim failed");
  }
  const notice = row as Record<string, unknown>;
  const audience = notice.audience;
  const recipient = notice.recipient_id;
  if (audience !== "admin" && audience !== "customer") {
    throw new Error("claim failed");
  }
  if (recipient !== null && typeof recipient !== "string") {
    throw new Error("claim failed");
  }
  if (
    typeof notice.id !== "string"
    || typeof notice.title !== "string"
    || typeof notice.body !== "string"
    || typeof notice.link_path !== "string"
    || typeof notice.attempts !== "number"
    || !Number.isInteger(notice.attempts)
    || notice.attempts < 1
    || notice.attempts > 5
    || typeof notice.claim_token !== "string"
    || !isUuid(notice.id)
    || !isUuid(notice.claim_token)
    || (recipient !== null && !isUuid(recipient))
  ) {
    throw new Error("claim failed");
  }
  return {
    id: notice.id,
    audience: audience,
    recipient_id: recipient,
    title: notice.title,
    body: notice.body,
    link_path: notice.link_path,
    attempts: notice.attempts,
    claim_token: notice.claim_token,
  };
}

async function deliverNotice(
  supabase: SupabaseClient,
  server: webpush.ApplicationServer,
  notice: ClaimedNotice,
): Promise<"sent" | "failed" | "abandoned" | "lostClaim"> {
  let subscriptions: StoredSubscription[];
  try {
    subscriptions = await loadSubscriptions(supabase, notice);
  } catch (_error) {
    const status = notice.attempts >= 5 ? "abandoned" : "failed";
    return await finish(supabase, notice, status, "subscription lookup failed");
  }
  if (subscriptions.length === 0) {
    return await finish(supabase, notice, "abandoned", "no active subscription");
  }

  const tally = await pushAll(supabase, server, notice, subscriptions);
  if (tally.temporary > 0) {
    const detail = clip(`partial sent=${tally.sent} gone=${tally.gone} temporary=${tally.temporary}`);
    if (notice.attempts >= 5) {
      return await finish(supabase, notice, "abandoned", detail);
    }
    return await finish(supabase, notice, "failed", detail);
  }
  if (tally.sent > 0) {
    return await finish(supabase, notice, "sent", null);
  }
  return await finish(supabase, notice, "abandoned", "no active subscription");
}

async function loadSubscriptions(
  supabase: SupabaseClient,
  notice: ClaimedNotice,
): Promise<StoredSubscription[]> {
  if (notice.audience === "admin") {
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_secret")
      .eq("audience", "admin");
    if (error) {
      throw new Error("subscription lookup failed");
    }
    return validSubscriptions(data);
  }
  if (!notice.recipient_id) {
    return [];
  }
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_secret")
    .eq("audience", "customer")
    .eq("user_id", notice.recipient_id);
  if (error) {
    throw new Error("subscription lookup failed");
  }
  return validSubscriptions(data);
}

function validSubscriptions(data: unknown): StoredSubscription[] {
  if (!Array.isArray(data)) {
    throw new Error("subscription lookup failed");
  }
  const subscriptions: StoredSubscription[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") {
      throw new Error("subscription lookup failed");
    }
    const subscription = row as Record<string, unknown>;
    if (
      typeof subscription.id !== "string"
      || typeof subscription.endpoint !== "string"
      || typeof subscription.p256dh !== "string"
      || typeof subscription.auth_secret !== "string"
      || !isUuid(subscription.id)
    ) {
      throw new Error("subscription lookup failed");
    }
    subscriptions.push({
      id: subscription.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth_secret: subscription.auth_secret,
    });
  }
  return subscriptions;
}

async function pushAll(
  supabase: SupabaseClient,
  server: webpush.ApplicationServer,
  notice: ClaimedNotice,
  subscriptions: StoredSubscription[],
): Promise<SendTally> {
  const tally: SendTally = { sent: 0, gone: 0, temporary: 0 };
  const payload = JSON.stringify({
    title: notice.title,
    body: notice.body,
    url: notice.link_path,
  });
  for (const subscription of subscriptions) {
    const result = await pushOne(server, subscription, payload);
    if (result === "sent") {
      tally.sent += 1;
      continue;
    }
    if (result === "gone") {
      const { error } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("id", subscription.id);
      if (error) {
        tally.temporary += 1;
      } else {
        tally.gone += 1;
      }
      continue;
    }
    tally.temporary += 1;
  }
  return tally;
}

async function pushOne(
  server: webpush.ApplicationServer,
  subscription: StoredSubscription,
  payload: string,
): Promise<"sent" | "gone" | "temporary"> {
  try {
    const subscriber = server.subscribe({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth_secret,
      },
    });
    await subscriber.pushTextMessage(payload, {
      ttl: 3600,
      urgency: webpush.Urgency.High,
    });
    return "sent";
  } catch (error) {
    const status = pushStatus(error);
    if (status === 404 || status === 410) {
      return "gone";
    }
    return "temporary";
  }
}

function pushStatus(error: unknown): number | null {
  if (error instanceof webpush.PushMessageError) {
    return error.response.status;
  }
  return null;
}

async function finish(
  supabase: SupabaseClient,
  notice: ClaimedNotice,
  status: "sent" | "failed" | "abandoned",
  lastError: string | null,
): Promise<"sent" | "failed" | "abandoned" | "lostClaim"> {
  const errorText = lastError ? clip(lastError) : null;
  const minutes = backoffMinutes(notice.attempts);
  const patch = status === "sent"
    ? {
      status: "sent",
      sent_at: new Date().toISOString(),
      claim_token: null,
      last_error: null,
    }
    : status === "abandoned"
    ? {
      status: "abandoned",
      claim_token: null,
      last_error: errorText,
    }
    : {
      status: "failed",
      claim_token: null,
      last_error: errorText,
      next_attempt_at: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
    };
  const updated = await updateClaimed(supabase, notice, patch);
  return updated ? status : "lostClaim";
}

async function updateClaimed(
  supabase: SupabaseClient,
  notice: ClaimedNotice,
  patch: {
    status: "sent" | "failed" | "abandoned";
    claim_token: null;
    last_error: string | null;
    sent_at?: string;
    next_attempt_at?: string;
  },
): Promise<boolean> {
  if (!isUuid(notice.id) || !isUuid(notice.claim_token)) {
    throw new Error("missing claim");
  }
  const { data, error } = await supabase
    .from("notification_outbox")
    .update(patch)
    .eq("id", notice.id)
    .eq("claim_token", notice.claim_token)
    .eq("status", "sending")
    .select("id");
  if (error) {
    throw new Error("outbox update failed");
  }
  return Array.isArray(data) && data.length === 1;
}

function backoffMinutes(attempts: number): number {
  if (attempts <= 1) {
    return 1;
  }
  if (attempts === 2) {
    return 5;
  }
  if (attempts === 3) {
    return 15;
  }
  return 60;
}

function clip(text: string): string {
  return text.length <= 300 ? text : text.slice(0, 300);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function sameSecret(provided: string, expected: string): boolean {
  const left = new TextEncoder().encode(provided);
  const right = new TextEncoder().encode(expected);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}
