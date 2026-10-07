import type { ProductCategory } from "@shared/types";

// Safe for client components: no data access, unlike services/.
export const categoryLabels: Record<ProductCategory, string> = {
  lighting: "Lighting",
  "wall-art": "Wall Art",
  rugs: "Rugs",
  desk: "Desk",
  decor: "Decor",
  seating: "Seating",
  furniture: "Furniture",
  electronics: "Electronics",
};
