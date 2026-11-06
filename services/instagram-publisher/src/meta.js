export class MetaError extends Error {
  constructor(kind, code = null) { super(kind); this.kind = kind; this.code = code; }
}

// Never put tokens in URLs or return upstream error bodies (which may contain credentials).
export class Meta {
  constructor(env, fetcher = fetch) {
    this.env = env;
    // Worker's native fetch rejects an accidental Meta instance as its receiver.
    this.fetcher = (...args) => fetcher(...args);
  }
  async call(path, params = {}, method = 'GET') {
    if (!this.env.META_ACCESS_TOKEN) throw new MetaError('token_missing');
    if (!/^v\d+\.0$/.test(this.env.GRAPH_VERSION)) throw new MetaError('invalid_api_version');
    const url = new URL(`https://graph.facebook.com/${this.env.GRAPH_VERSION}/${path}`);
    const init = {method, headers: {Authorization: `Bearer ${this.env.META_ACCESS_TOKEN}`},
      signal: AbortSignal.timeout(10000), redirect: 'manual'};
    if (method === 'GET') url.search = new URLSearchParams(params);
    else init.body = new URLSearchParams(params);
    let response, data;
    try { response = await this.fetcher(url, init); }
    catch (error) { throw new MetaError(error.name === 'TimeoutError' ? 'request_timeout' : 'transport_error'); }
    if (response.status >= 300 && response.status < 400) throw new MetaError('redirect_rejected', response.status);
    try { data = await response.json(); }
    catch { throw new MetaError('non_json_response', response.status); }
    if (!response.ok || data.error) throw new MetaError('meta_error', data.error?.code ?? response.status);
    return data;
  }
  async identity() {
    const data = await this.call(this.env.IG_ACCOUNT_ID, {fields: 'id,username'});
    if (data.id !== this.env.IG_ACCOUNT_ID || data.username !== this.env.IG_USERNAME)
      throw new MetaError('account_mismatch');
    return data;
  }
  create(params) { return this.call(`${this.env.IG_ACCOUNT_ID}/media`, params, 'POST'); }
  container(id) { return this.call(id, {fields: 'status_code'}); }
  publish(id) { return this.call(`${this.env.IG_ACCOUNT_ID}/media_publish`, {creation_id: id}, 'POST'); }
  media(id) { return this.call(id, {fields: 'id,permalink,timestamp'}); }
}
