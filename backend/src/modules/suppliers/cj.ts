// CJdropshipping API client (https://developers.cjdropshipping.com, API 2.0).
// Shared by the product import script (scripts/fetch-cj.ts) and the live supplier adapter.
//
// CJ allows about one request a second per account, so calls are queued. The access token
// lives 180 days; it is cached in backend/.cj-token.json (git-ignored) so scripts and the
// server don't fetch a new one every run.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const API = "https://developers.cjdropshipping.com/api2.0/v1";
const TOKEN_FILE = fileURLToPath(new URL("../../../.cj-token.json", import.meta.url));
const MIN_GAP_MS = 1100;

export interface CjInventory {
  countryCode: string;
  totalInventory?: number;
}

export interface CjVariant {
  vid: string;
  variantSku?: string;
  variantKey?: string;
  variantNameEn?: string;
  variantImage?: string;
  variantSellPrice?: number;
  /** Packed size in mm and packed weight in grams. */
  variantLength?: number;
  variantWidth?: number;
  variantHeight?: number;
  variantWeight?: number;
  inventories?: CjInventory[];
}

export interface CjProduct {
  pid: string;
  productNameEn: string;
  productSku?: string;
  bigImage: string;
  /** "3" means on sale. */
  status?: string;
  sellPrice?: string;
  variants?: CjVariant[];
}

export interface CjFreight {
  logisticName: string;
  logisticPrice: number;
  logisticAging?: string;
}

export interface CjSearchHit {
  id: string;
  nameEn: string;
  bigImage: string;
  sellPrice: string | number;
}

export interface CjOrderDetail {
  orderId: string;
  orderStatus?: string;
  trackNumber?: string | null;
  trackingProvider?: string | null;
}

export class CjError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

interface CjResponse<T> {
  code: number;
  result: boolean;
  message: string;
  data: T;
}

export class CjClient {
  private token: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private last = 0;

  constructor(
    private apiKey: string,
    private tokenFile: string | null = TOKEN_FILE,
    private gapMs = MIN_GAP_MS,
  ) {}

  /** Runs requests one at a time, at most one a second. */
  private throttle<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.last + this.gapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await fn();
      } finally {
        this.last = Date.now();
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** One call; CJ's own rate counter is sometimes stricter than our spacing, so back off and retry. */
  private async raw<T>(path: string, init: RequestInit = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.throttle(async () => {
          const res = await fetch(`${API}${path}`, init);
          const body = (await res.json().catch(() => null)) as CjResponse<T> | null;
          if (!body) throw new CjError(`${path}: HTTP ${res.status}`);
          if (!body.result) throw new CjError(`${path}: ${body.code} ${body.message}`, body.code);
          return body.data;
        });
      } catch (err) {
        if (!(err instanceof CjError) || !/too many requests|qps/i.test(err.message) || attempt >= 4) throw err;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token) return this.token;
    if (this.tokenFile && existsSync(this.tokenFile)) {
      const cached = JSON.parse(readFileSync(this.tokenFile, "utf8")) as { accessToken: string; expires: number };
      if (cached.expires > Date.now() + 86_400_000) return (this.token = cached.accessToken);
    }
    const data = await this.raw<{ accessToken: string; accessTokenExpiryDate: string }>("/authentication/getAccessToken", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: this.apiKey }),
    });
    const expires = Date.parse(data.accessTokenExpiryDate) || Date.now() + 14 * 86_400_000;
    if (this.tokenFile) writeFileSync(this.tokenFile, JSON.stringify({ accessToken: data.accessToken, expires }));
    return (this.token = data.accessToken);
  }

  async get<T>(path: string): Promise<T> {
    return this.raw<T>(path, { headers: { "CJ-Access-Token": await this.accessToken() } });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.raw<T>(path, {
      method: "POST",
      headers: { "CJ-Access-Token": await this.accessToken(), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  product(pid: string) {
    return this.get<CjProduct>(`/product/query?pid=${encodeURIComponent(pid)}`);
  }

  /** Shipping options from a CJ warehouse (default China) to `country`, cheapest first. */
  async freight(vid: string, quantity = 1, country = "US", from = "CN", zip?: string): Promise<CjFreight[]> {
    const options = await this.post<CjFreight[]>("/logistic/freightCalculate", {
      startCountryCode: from,
      endCountryCode: country,
      ...(zip ? { zip } : {}),
      products: [{ vid, quantity }],
    });
    return [...(options ?? [])].sort((a, b) => Number(a.logisticPrice) - Number(b.logisticPrice));
  }

  /** Keyword search of CJ's catalogue (first page), for finding candidate products. */
  async searchProducts(keyWord: string, size = 10): Promise<CjSearchHit[]> {
    const data = await this.get<{ content?: { productList?: CjSearchHit[] }[] }>(
      `/product/listV2?keyWord=${encodeURIComponent(keyWord)}&page=1&size=${size}`,
    );
    return (data?.content ?? []).flatMap((c) => c.productList ?? []);
  }

  createOrder(body: Record<string, unknown>) {
    return this.post<{ orderId: string; orderNum?: string }>("/shopping/order/createOrderV2", body);
  }

  orderDetail(orderId: string) {
    return this.get<CjOrderDetail>(`/shopping/order/getOrderDetail?orderId=${encodeURIComponent(orderId)}`);
  }
}

/** CJ's product id from a listing URL (…-p-<pid>.html). */
export const cjPidFromUrl = (url: string) => url.match(/cjdropshipping\.com\/product\/[^?]*-p-([0-9A-Za-z-]+)\.html/)?.[1] ?? null;

/** Units in stock across CJ warehouses (China + overseas). */
export const cjStock = (v: CjVariant) => (v.inventories ?? []).reduce((n, i) => n + (i.totalInventory ?? 0), 0);

export const usdToCents = (usd: number | string | undefined) => Math.round(Number(usd ?? 0) * 100);

/** Slowest delivery day in a CJ window like "7-12" (Infinity when unknown). */
export const maxDays = (aging: string | undefined) => Math.max(...((aging ?? "").match(/\d+/g) ?? ["Infinity"]).map(Number));

/** Delivery we quote by default; slower lines (sea freight) are a last resort. */
export const MAX_DELIVERY_DAYS = 20;

/** Cheapest option that arrives within MAX_DELIVERY_DAYS, else the cheapest at all. */
export function bestFreight(options: CjFreight[]): CjFreight | null {
  const byPrice = [...options].sort((a, b) => Number(a.logisticPrice) - Number(b.logisticPrice));
  return byPrice.find((o) => maxDays(o.logisticAging) <= MAX_DELIVERY_DAYS) ?? byPrice[0] ?? null;
}

/** CJ warehouses to try. Many furniture listings only stock (and ship free) from the US one. */
export const CJ_WAREHOUSES = ["US", "CN", "DE", "GB", "FR", "CZ", "PL", "TH", "AU", "BR", "MX"];

/**
 * Best shipping route for a variant: the US warehouse first (domestic, fastest), then China and
 * CJ's other warehouses. Returns the first route that delivers within MAX_DELIVERY_DAYS, else the
 * cheapest route found, else null (CJ can't ship this variant to `country` at all).
 */
export async function bestRoute(
  cj: Pick<CjClient, "freight">,
  vid: string,
  quantity = 1,
  country = "US",
  zip?: string,
): Promise<{ from: string; freight: CjFreight } | null> {
  let fallback: { from: string; freight: CjFreight } | null = null;
  for (const from of CJ_WAREHOUSES) {
    const best = bestFreight(await cj.freight(vid, quantity, country, from, zip).catch(() => []));
    if (!best) continue;
    if (maxDays(best.logisticAging) <= MAX_DELIVERY_DAYS) return { from, freight: best };
    if (!fallback || Number(best.logisticPrice) < Number(fallback.freight.logisticPrice)) fallback = { from, freight: best };
  }
  return fallback;
}
