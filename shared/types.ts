// Shared domain types. Frontend and backend both import from here so the
// API contract has one source of truth. Prices are integer cents; the backend
// is the pricing authority and the frontend only formats what it receives.

export type Cents = number;

export type ProductCategory =
  | "lighting"
  | "wall-art"
  | "rugs"
  | "desk"
  | "decor"
  | "seating";

export interface RoomStyle {
  slug: string;
  name: string;
  tagline: string;
  coverImage: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  priceCents: Cents;
  image: string;
  category: ProductCategory;
  styles: string[];
  color: string;
  description: string;
  dimensions: string;
  shippingEstimate: string;
  available: boolean;
  /** Where we buy it when a customer orders (dropshipping). Internal only. */
  supplier?: SupplierListing;
}

/**
 * A supplier listing we fulfil orders from. `kind: "search"` means a curated
 * search link: someone still has to pick the exact listing. Costs stay null
 * until a person has checked the live price; never show this to customers.
 */
export interface SupplierListing {
  name: "AliExpress";
  kind: "listing" | "search";
  url: string;
  costCents: Cents | null;
  verified: boolean;
  notes?: string;
}

/** Position of a purchasable object in a room render, in % of width/height. */
export interface Hotspot {
  x: number;
  y: number;
}

/** A product placed in a room. `assetId` is the 3D engine's object id. */
export interface RoomAsset {
  productId: string;
  assetId: string;
  hotspot: Hotspot;
  /** The variant placed in the room (e.g. the black lamp, not the white). */
  variantId?: string;
  /** 3D model URL; null until the asset exists. */
  modelUrl?: string | null;
  /** 3D transform; empty until the room is built in the 3D engine. */
  position?: number[];
  rotation?: number[];
}

export interface Room {
  id: string;
  slug: string;
  styleSlug: string;
  name: string;
  blurb: string;
  image: string;
  imageWidth: number;
  imageHeight: number;
  assets: RoomAsset[];
}

/** Room plus totals computed by the backend. */
export interface RoomSummary extends Room {
  totalCents: Cents;
  productCount: number;
}

export type BundleTier = "starter" | "standard" | "complete";

export interface RoomBundle {
  tier: BundleTier;
  name: string;
  productIds: string[];
  totalCents: Cents;
}

/** GET /rooms/:style/:room: everything a room page needs in one request. */
export interface RoomDetail extends RoomSummary {
  products: Product[];
  bundles: RoomBundle[];
}

export interface Category {
  slug: ProductCategory;
  name: string;
}

export interface Collection {
  slug: string;
  name: string;
  description: string;
  coverImage: string | null;
}

export interface CollectionDetail extends Collection {
  products: Product[];
}

export type CartItem =
  | {
      kind: "product";
      productId: string;
      name: string;
      image: string;
      priceCents: Cents;
      quantity: number;
      source: "room" | "catalogue";
    }
  | {
      kind: "bundle";
      roomId: string;
      roomName: string;
      image: string;
      products: { productId: string; name: string; priceCents: Cents }[];
    };

export type OrderStatus = "pending" | "paid" | "shipped" | "delivered";

export interface Order {
  id: string;
  status: OrderStatus;
  items: CartItem[];
  totalCents: Cents;
  createdAt: string;
}
