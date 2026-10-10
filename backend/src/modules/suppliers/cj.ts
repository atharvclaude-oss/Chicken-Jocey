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

  private async raw<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.throttle(async () => {
      const res = await fetch(`${API}${path}`, init);
      const body = (await res.json().catch(() => null)) as CjResponse<T> | null;
      if (!body) throw new CjError(`${path}: HTTP ${res.status}`);
      if (!body.result) throw new CjError(`${path}: ${body.code} ${body.message}`, body.code);
      return body.data;
    });
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

  /** Shipping options from CJ's China warehouse to `country`, cheapest first. */
  async freight(vid: string, quantity = 1, country = "US"): Promise<CjFreight[]> {
    const options = await this.post<CjFreight[]>("/logistic/freightCalculate", {
      startCountryCode: "CN",
      endCountryCode: country,
      products: [{ vid, quantity }],
    });
    return [...(options ?? [])].sort((a, b) => Number(a.logisticPrice) - Number(b.logisticPrice));
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
