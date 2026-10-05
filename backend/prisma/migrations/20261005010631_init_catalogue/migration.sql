-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'REVIEW', 'ACTIVE', 'PAUSED', 'OUT_OF_STOCK', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('AVAILABLE', 'LOW_CONFIDENCE', 'OUT_OF_STOCK', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Placement" AS ENUM ('FLOOR', 'WALL', 'CEILING', 'DESK', 'NIGHTSTAND', 'SHELF', 'BED');

-- CreateEnum
CREATE TYPE "RoomUse" AS ENUM ('BEDROOM', 'DORM', 'OFFICE', 'GAMING_ROOM', 'LIVING_ROOM');

-- CreateEnum
CREATE TYPE "SupplierPlatform" AS ENUM ('ALIEXPRESS', 'ALIBABA', 'DISTRIBUTOR', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('MODEL_3D', 'IMAGE');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BundleTier" AS ENUM ('STARTER', 'STANDARD', 'COMPLETE');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Style" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "coverImage" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Style_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "coverImage" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionProduct" (
    "collectionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CollectionProduct_pkey" PRIMARY KEY ("collectionId","productId")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "categoryId" TEXT NOT NULL,
    "placements" "Placement"[],
    "roomUses" "RoomUse"[],
    "dimensionsLabel" TEXT NOT NULL DEFAULT '',
    "shippingEstimate" TEXT NOT NULL DEFAULT '',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '',
    "priceCents" INTEGER NOT NULL,
    "image" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "availability" "Availability" NOT NULL DEFAULT 'UNKNOWN',
    "widthCm" DOUBLE PRECISION,
    "depthCm" DOUBLE PRECISION,
    "heightCm" DOUBLE PRECISION,
    "modelAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductStyle" (
    "productId" TEXT NOT NULL,
    "styleId" TEXT NOT NULL,

    CONSTRAINT "ProductStyle_pkey" PRIMARY KEY ("productId","styleId")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "url" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "bytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" "SupplierPlatform" NOT NULL,
    "url" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProduct" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierSku" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "shippingCostCents" INTEGER NOT NULL DEFAULT 0,
    "minimumOrderQuantity" INTEGER NOT NULL DEFAULT 1,
    "estimatedDeliveryDays" INTEGER,
    "availability" "Availability" NOT NULL DEFAULT 'UNKNOWN',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPriceHistory" (
    "id" TEXT NOT NULL,
    "supplierProductId" TEXT NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "shippingCostCents" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailPriceHistory" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "styleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "blurb" TEXT NOT NULL DEFAULT '',
    "status" "RoomStatus" NOT NULL DEFAULT 'DRAFT',
    "roomUse" "RoomUse",
    "image" TEXT NOT NULL,
    "imageWidth" INTEGER NOT NULL,
    "imageHeight" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomProduct" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "sceneObjectId" TEXT NOT NULL,
    "hotspotX" DOUBLE PRECISION NOT NULL,
    "hotspotY" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION[],
    "rotation" DOUBLE PRECISION[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RoomProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomBundle" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "tier" "BundleTier" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "RoomBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomBundleItem" (
    "bundleId" TEXT NOT NULL,
    "roomProductId" TEXT NOT NULL,

    CONSTRAINT "RoomBundleItem_pkey" PRIMARY KEY ("bundleId","roomProductId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Style_slug_key" ON "Style"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_status_categoryId_idx" ON "Product"("status", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_position_idx" ON "ProductVariant"("productId", "position");

-- CreateIndex
CREATE INDEX "ProductStyle_styleId_idx" ON "ProductStyle"("styleId");

-- CreateIndex
CREATE INDEX "SupplierProduct_variantId_priority_idx" ON "SupplierProduct"("variantId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProduct_supplierId_supplierSku_key" ON "SupplierProduct"("supplierId", "supplierSku");

-- CreateIndex
CREATE INDEX "SupplierPriceHistory_supplierProductId_recordedAt_idx" ON "SupplierPriceHistory"("supplierProductId", "recordedAt");

-- CreateIndex
CREATE INDEX "RetailPriceHistory_variantId_recordedAt_idx" ON "RetailPriceHistory"("variantId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Room_styleId_slug_key" ON "Room"("styleId", "slug");

-- CreateIndex
CREATE INDEX "RoomProduct_productId_idx" ON "RoomProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomProduct_roomId_sceneObjectId_key" ON "RoomProduct"("roomId", "sceneObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomBundle_roomId_tier_key" ON "RoomBundle"("roomId", "tier");

-- AddForeignKey
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_modelAssetId_fkey" FOREIGN KEY ("modelAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStyle" ADD CONSTRAINT "ProductStyle_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStyle" ADD CONSTRAINT "ProductStyle_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "Style"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPriceHistory" ADD CONSTRAINT "SupplierPriceHistory_supplierProductId_fkey" FOREIGN KEY ("supplierProductId") REFERENCES "SupplierProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPriceHistory" ADD CONSTRAINT "RetailPriceHistory_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "Style"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomProduct" ADD CONSTRAINT "RoomProduct_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomProduct" ADD CONSTRAINT "RoomProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomProduct" ADD CONSTRAINT "RoomProduct_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomBundle" ADD CONSTRAINT "RoomBundle_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomBundleItem" ADD CONSTRAINT "RoomBundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "RoomBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomBundleItem" ADD CONSTRAINT "RoomBundleItem_roomProductId_fkey" FOREIGN KEY ("roomProductId") REFERENCES "RoomProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
