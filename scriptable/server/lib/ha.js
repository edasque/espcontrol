"use strict";

// Thin Home Assistant REST client. The bridge is the only thing that holds the
// long-lived token: the widget talks to the bridge, never to Home Assistant, so
// the token never has to be pasted into a Scriptable script on the iPad.

class HomeAssistantClient {
  constructor({ baseUrl, token, cacheMs = 5000, timeoutMs = 8000 }) {
    this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
    this.token = token || "";
    this.cacheMs = cacheMs;
    this.timeoutMs = timeoutMs;
    this._states = new Map();
    this._fetchedAt = 0;
    this._inflight = null;
    this.lastError = null;
  }

  get configured() {
    return !!(this.baseUrl && this.token);
  }

  async _request(pathname, init = {}) {
    if (!this.configured) throw new Error("Home Assistant URL and token are not configured");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${pathname}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          ...(init.headers || {}),
        },
      });
      if (!response.ok) {
        throw new Error(`Home Assistant ${init.method || "GET"} ${pathname} failed: ${response.status}`);
      }
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Cached snapshot of every entity state, refreshed at most every cacheMs. */
  async states({ force = false } = {}) {
    const fresh = Date.now() - this._fetchedAt < this.cacheMs;
    if (!force && fresh && this._states.size) return this._states;
    if (this._inflight) return this._inflight;

    this._inflight = (async () => {
      try {
        const rows = await this._request("/api/states");
        const next = new Map();
        for (const row of rows || []) next.set(row.entity_id, row);
        this._states = next;
        this._fetchedAt = Date.now();
        this.lastError = null;
      } catch (err) {
        this.lastError = err.message;
        // Keep serving the previous snapshot: a stale tile beats a blank widget.
      } finally {
        this._inflight = null;
      }
      return this._states;
    })();

    return this._inflight;
  }

  stateOf(entityId) {
    return this._states.get(entityId) || null;
  }

  async callService(domain, service, data) {
    const result = await this._request(`/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    });
    // A service call usually changes what the next widget refresh should show.
    this._fetchedAt = 0;
    return result;
  }

  async fireWebhook(webhookId) {
    const id = String(webhookId || "").trim();
    if (!id) throw new Error("Webhook card has no webhook id");
    const response = await fetch(`${this.baseUrl}/api/webhook/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) throw new Error(`Webhook ${id} failed: ${response.status}`);
    this._fetchedAt = 0;
    return null;
  }
}

module.exports = { HomeAssistantClient };
