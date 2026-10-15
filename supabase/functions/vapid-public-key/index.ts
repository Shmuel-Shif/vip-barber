// Browser application server key for PushManager.subscribe().
// VAPID_PUBLIC_KEY must be the unpadded base64url form of the raw P-256 public
// key: 65 bytes, first byte 0x04. It must be the same public key as the pair
// send-push loads from VAPID_PUBLIC_JWK and VAPID_PRIVATE_KEY.
// This function reads only VAPID_PUBLIC_KEY. It does not read, import, or derive
// a private key.

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, apikey",
  "cache-control": "public, max-age=3600",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "GET") {
    return new Response("method not allowed", { status: 405, headers: cors });
  }

  try {
    return Response.json({ publicKey: applicationServerKey() }, { headers: cors });
  } catch (_error) {
    return Response.json(
      { error: "vapid public key is not configured" },
      { status: 500, headers: cors },
    );
  }
});

function applicationServerKey(): string {
  const key = (Deno.env.get("VAPID_PUBLIC_KEY") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{87}$/.test(key)) {
    throw new Error("vapid public key is not configured");
  }
  const bytes = base64UrlBytes(key);
  if (bytes.length !== 65 || bytes[0] !== 4) {
    throw new Error("vapid public key is not configured");
  }
  return key;
}

function base64UrlBytes(key: string): Uint8Array {
  const standard = `${key}=`.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(standard);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
