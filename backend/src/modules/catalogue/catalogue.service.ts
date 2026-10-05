import type {
  Category,
  Collection,
  CollectionDetail,
  ProductCategory,
  RoomStyle,
} from "../../../../shared/types.ts";
import type { Db } from "../../db/client.ts";
import { PUBLIC_STATUSES, publicProductInclude, toPublicProduct } from "../products/products.service.ts";

/** Taxonomy (categories, styles) and merchandising (collections). */
export class CatalogueService {
  constructor(private db: Db) {}

  async categories(): Promise<Category[]> {
    const rows = await this.db.category.findMany({ orderBy: { sortOrder: "asc" } });
    return rows.map((c) => ({ slug: c.slug as ProductCategory, name: c.name }));
  }

  async styles(): Promise<RoomStyle[]> {
    const rows = await this.db.style.findMany({ orderBy: { sortOrder: "asc" } });
    return rows.map(({ slug, name, tagline, coverImage }) => ({ slug, name, tagline, coverImage }));
  }

  async style(slug: string): Promise<RoomStyle | null> {
    const s = await this.db.style.findUnique({ where: { slug } });
    return s && { slug: s.slug, name: s.name, tagline: s.tagline, coverImage: s.coverImage };
  }

  async collections(): Promise<Collection[]> {
    const rows = await this.db.collection.findMany({
      where: { isPublished: true },
      orderBy: { sortOrder: "asc" },
    });
    return rows.map(({ slug, name, description, coverImage }) => ({ slug, name, description, coverImage }));
  }

  async collection(slug: string): Promise<CollectionDetail | null> {
    const c = await this.db.collection.findFirst({
      where: { slug, isPublished: true },
      include: {
        products: {
          where: { product: { status: { in: PUBLIC_STATUSES }, variants: { some: {} } } },
          orderBy: { position: "asc" },
          include: { product: { include: publicProductInclude } },
        },
      },
    });
    if (!c) return null;
    return {
      slug: c.slug,
      name: c.name,
      description: c.description,
      coverImage: c.coverImage,
      products: c.products.map((cp) => toPublicProduct(cp.product)),
    };
  }
}
