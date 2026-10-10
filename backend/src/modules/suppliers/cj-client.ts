// Minimal client for the CJdropshipping API 2.0 (https://developers.cjdropshipping.com).
//
// Auth: POST authentication/getAccessToken with the account's API key returns
// an access token valid ~180 days; every other call sends it as CJ-Access-Token.
// The token is cached in memory and (optionally) in a gitignored file, because
// CJ only issues a new one every 24h. CJ allows 1 request per second, so calls
// are serialized and spaced.

import { readFileSync, writeFileSync } from "node:fs";

export const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

export class CjError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

interface Envelope<T> {
  code: number;
  result: boolean;
  message: string;
  data: T;
}

export interface CjListProduct {
  id: string;
  nameEn: string;
  sku: string;
  bigImage: string;
  sellPrice: string | number;
  nowPrice?: string | number;
  listedNum?: number;
  threeCategoryName?: string;
  warehouseInventoryNum?: number;
}

export interface CjInventory {
  countryCode: string;
  totalInventory: number;
}

export interface CjVariant {
  vid: string;
  variantSku: string;
  variantNameEn?: string;
  variantKey?: string;
  variantSellPrice: number;
  variantImage?: string;
  variantLength?: number;
  variantWidth?: number;
  variantHeight?: number;
  variantWeight?: number;
  inventories?: CjInventory[];
}

export interface CjProduct {
  pid: string;
  productNameEn: string;
  productSku: string;
  bigImage: string;
  productImageSet?: string[];
  productWeight?: number;
  sellPrice?: string | number;
  description?: string;
  status?: string;
  variants: CjVariant[];
}

export interface CjFreightOption {
  logisticName: string;
  logisticPrice: number;
  /** Delivery window in days, e.g. "7-12". */
  logisticAging: string;
}

export interface CjOrderInput {
  orderNumber: string;
  shippingCountryCode: string;
  shippingCountry: string;
  shippingProvince: string;
  shippingCity: string;
  shippingAddress: string;
  shippingAddress2?: string;
  shippingZip?: string;
  shippingPhone?: string;
  shippingCustomerName: string;
  logisticName: string;
  fromCountryCode: string;
  products: { vid: string; quantity: number }[];
  /** 2 = pay from the CJ account balance immediately; 3 = create only. */
  payType?: 2 | 3;
  remark?: string;
}

export interface CjOrderCreated {
  orderId: string;
  orderNumber: string;
  orderAmount: number;
  productAmount?: number;
  postageAmount?: number;
  orderStatus: string;
}

export interface CjOrderDetail {
  orderId: string;
  orderStatus: string;
  trackNumber?: string;
  trackingUrl?: string;
}

interface StoredToken {
  accessToken: string;
  /** ms since epoch */
  expiresAt: number;
}

export interface CjClientOptions {
  fetch?: typeof fetch;
  /** Where to cache the access token between runs (gitignored). */
  tokenFile?: string;
  /** Spacing between calls; CJ allows 1/s. */
  minIntervalMs?: number;
}

export class CjClient {
  private token: StoredToken | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private lastCall = 0;
  private fetchImpl: typeof fetch;
  private minInterval: number;

  constructor(
    private apiKey: string,
    private opts: CjClientOptions = {},
  ) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.minInterval = opts.minIntervalMs ?? 1100;
  }

  /** Runs calls one at a time, at most one per `minIntervalMs`. */
  private schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastCall + this.minInterval - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastCall = Date.now();
      return fn();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async raw<T>(method: "GET" | "POST", path: string, init: { query?: Record<string, string | number>; body?: unknown; token?: string }) {
    const url = new URL(`${CJ_BASE}/${path}`);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (init.token) headers["CJ-Access-Token"] = init.token;
    const res = await this.fetchImpl(url, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
    const json = (await res.json().catch(() => null)) as Envelope<T> | null;
    if (!json) throw new CjError(`CJ ${path}: HTTP ${res.status} with no JSON body`);
    if (json.code !== 200 || json.result === false) throw new CjError(`CJ ${path}: ${json.message || "request failed"}`, json.code);
    return json.data;
  }

  private loadCachedToken(): StoredToken | null {
    if (this.token) return this.token;
    if (!this.opts.tokenFile) return null;
    try {
      const t = JSON.parse(readFileSync(this.opts.tokenFile, "utf8")) as StoredToken;
      return t.accessToken && t.expiresAt > Date.now() + 60_000 ? (this.token = t) : null;
    } catch {
      return null;
    }
  }

  private async accessToken(): Promise<string> {
    const cached = this.loadCachedToken();
    if (cached) return cached.accessToken;
    const data = await this.schedule(() =>
      this.raw<{ accessToken: string; accessTokenExpiryDate: string }>("POST", "authentication/getAccessToken", { body: { apiKey: this.apiKey } }),
    );
    const expiresAt = Date.parse(data.accessTokenExpiryDate) || Date.now() + 15 * 24 * 3600_000;
    this.token = { accessToken: data.accessToken, expiresAt };
    if (this.opts.tokenFile) writeFileSync(this.opts.tokenFile, JSON.stringify(this.token));
    return data.accessToken;
  }

  /**
   * Authenticated call. On CJ's rate limit it backs off and retries (CJ's own
   * counter is stricter than our spacing at times); on an auth failure it
   * re-authenticates once and retries.
   */
  async request<T>(method: "GET" | "POST", path: string, init: { query?: Record<string, string | number>; body?: unknown } = {}): Promise<T> {
    const token = await this.accessToken();
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          return await this.schedule(() => this.raw<T>(method, path, { ...init, token }));
        } catch (err) {
          if (!(err instanceof CjError) || !/too many requests|qps/i.test(err.message) || attempt >= 4) throw err;
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
    } catch (err) {
      if (err instanceof CjError && /token/i.test(err.message)) {
        this.token = null;
        if (this.opts.tokenFile) writeFileSync(this.opts.tokenFile, "{}");
        const fresh = await this.accessToken();
        return this.schedule(() => this.raw<T>(method, path, { ...init, token: fresh }));
      }
      throw err;
    }
  }

  async searchProducts(keyWord: string, size = 10): Promise<CjListProduct[]> {
    const data = await this.request<{ content?: { productList?: CjListProduct[] }[] }>("GET", "product/listV2", {
      query: { keyWord, page: 1, size },
    });
    return (data?.content ?? []).flatMap((c) => c.productList ?? []);
  }

  product(pid: string): Promise<CjProduct> {
    return this.request<CjProduct>("GET", "product/query", { query: { pid } });
  }

  async freight(input: { startCountryCode: string; endCountryCode: string; zip?: string; vid: string; quantity: number }): Promise<CjFreightOption[]> {
    const data = await this.request<CjFreightOption[]>("POST", "logistic/freightCalculate", {
      body: {
        startCountryCode: input.startCountryCode,
        endCountryCode: input.endCountryCode,
        ...(input.zip ? { zip: input.zip } : {}),
        products: [{ vid: input.vid, quantity: input.quantity }],
      },
    });
    return data ?? [];
  }

  createOrder(input: CjOrderInput): Promise<CjOrderCreated> {
    return this.request<CjOrderCreated>("POST", "shopping/order/createOrderV2", { body: input });
  }

  orderDetail(orderId: string): Promise<CjOrderDetail> {
    return this.request<CjOrderDetail>("GET", "shopping/order/getOrderDetail", { query: { orderId } });
  }
}

/** Slowest delivery day in a CJ window like "7-12" (Infinity when unknown). */
export const maxDays = (aging: string) => Math.max(...(aging.match(/\d+/g) ?? ["Infinity"]).map(Number));

/** Delivery we're willing to quote by default; slower lines (sea freight) are a last resort. */
export const MAX_DELIVERY_DAYS = 20;

/** Cheapest option that arrives within MAX_DELIVERY_DAYS, else the cheapest at all. */
export function cheapestFreight(options: CjFreightOption[]): CjFreightOption | null {
  const byPrice = [...options].sort((a, b) => Number(a.logisticPrice) - Number(b.logisticPrice));
  return byPrice.find((o) => maxDays(o.logisticAging) <= MAX_DELIVERY_DAYS) ?? byPrice[0] ?? null;
}

/** CJ warehouses to try when a variant doesn't report where its stock is. */
export const CJ_WAREHOUSES = ["US", "CN", "DE", "GB", "FR", "CZ", "PL", "TH", "AU", "BR", "MX"];

/**
 * Best shipping route for a variant: tries its known warehouse first, then the
 * US (domestic, fastest), China, and CJ's other warehouses. Returns the first
 * route that delivers within MAX_DELIVERY_DAYS, else the cheapest route found.
 */
export async function bestRoute(
  cj: CjClient,
  input: { vid: string; quantity: number; endCountryCode: string; zip?: string; prefer?: string },
): Promise<{ from: string; option: CjFreightOption } | null> {
  let fallback: { from: string; option: CjFreightOption } | null = null;
  for (const from of [...new Set([input.prefer, ...CJ_WAREHOUSES].filter(Boolean) as string[])]) {
    const options = await cj
      .freight({ startCountryCode: from, endCountryCode: input.endCountryCode, zip: input.zip, vid: input.vid, quantity: input.quantity })
      .catch(() => []);
    const best = cheapestFreight(options);
    if (!best) continue;
    if (maxDays(best.logisticAging) <= MAX_DELIVERY_DAYS) return { from, option: best };
    if (!fallback || Number(best.logisticPrice) < Number(fallback.option.logisticPrice)) fallback = { from, option: best };
  }
  return fallback;
}

/**
 * Where to ship from: a US warehouse with stock if there is one, else the
 * deepest stock. `stock` is null when CJ didn't report inventory at all (it
 * often omits it for China-warehouse items, which are then orderable).
 */
export function shipFrom(variant: CjVariant): { countryCode: string; stock: number | null } {
  if (!variant.inventories?.length) return { countryCode: "CN", stock: null };
  const inv = variant.inventories.filter((i) => i.totalInventory > 0);
  const us = inv.find((i) => i.countryCode === "US");
  if (us) return { countryCode: "US", stock: us.totalInventory };
  const best = inv.sort((a, b) => b.totalInventory - a.totalInventory)[0];
  return best ? { countryCode: best.countryCode, stock: best.totalInventory } : { countryCode: "CN", stock: 0 };
}

export const usdToCents = (usd: number | string) => Math.round(Number(usd) * 100);
