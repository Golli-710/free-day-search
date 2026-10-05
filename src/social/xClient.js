import { createHmac, randomBytes } from "node:crypto";

const ENDPOINT = "https://api.x.com/2/tweets";
const pct = value => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export class XApiError extends Error {
  constructor(kind, status = null) { super(kind); this.name = "XApiError"; this.kind = kind; this.status = status; }
}

export function classifyXApiError(error) {
  if (error instanceof XApiError) return error.kind;
  if (["AbortError","TimeoutError"].includes(error?.name) || error instanceof TypeError) return "network";
  return "api";
}

function oauthHeader(credentials, { now = Date.now(), nonce = randomBytes(16).toString("hex") } = {}) {
  const params = { oauth_consumer_key:credentials.apiKey, oauth_nonce:nonce, oauth_signature_method:"HMAC-SHA1", oauth_timestamp:String(Math.floor(now/1000)), oauth_token:credentials.accessToken, oauth_version:"1.0" };
  const normalized = Object.entries(params).map(([k,v]) => `${pct(k)}=${pct(v)}`).sort().join("&");
  const base = `POST&${pct(ENDPOINT)}&${pct(normalized)}`;
  const key = `${pct(credentials.apiSecret)}&${pct(credentials.accessTokenSecret)}`;
  params.oauth_signature = createHmac("sha1",key).update(base).digest("base64");
  return `OAuth ${Object.entries(params).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${pct(k)}="${pct(v)}"`).join(", ")}`;
}

export async function createXClient({ env = process.env, fetchImpl = fetch } = {}) {
  const credentials = { apiKey:env.X_API_KEY, apiSecret:env.X_API_SECRET, accessToken:env.X_ACCESS_TOKEN, accessTokenSecret:env.X_ACCESS_TOKEN_SECRET };
  const missing = Object.entries(credentials).filter(([,v]) => !v).map(([k]) => k);
  if (missing.length) throw new XApiError(`missing-credentials:${missing.join(",")}`);
  return {
    async createPost(text) {
      let response;
      try {
        response = await fetchImpl(ENDPOINT,{method:"POST",headers:{Authorization:oauthHeader(credentials),"Content-Type":"application/json"},body:JSON.stringify({text}),signal:AbortSignal.timeout(15_000)});
      } catch { throw new XApiError("network"); }
      if (!response.ok) {
        const status = response.status;
        const kind = status === 401 || status === 403 ? "authentication" : status === 429 ? "rate-limit" : status >= 500 ? "server" : "request-rejected";
        throw new XApiError(kind,status);
      }
      let body;
      try { body = await response.json(); } catch { throw new XApiError("invalid-response",response.status); }
      if (!body?.data?.id) throw new XApiError("invalid-response",response.status);
      return { id:String(body.data.id) };
    }
  };
}
