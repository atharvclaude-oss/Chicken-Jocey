/** Link into the 3D room carousel, optionally with a piece's drawer open. */
export function roomHref(roomId: string, productId?: string) {
  const q = new URLSearchParams({ room: roomId });
  if (productId) q.set("product", productId);
  return `/?${q}`;
}
