# roomcommerce

Shop the room, not just the product. Customers browse complete designer rooms, click any object inside a room, and buy single pieces or the whole room.

## Layout

```
frontend/   Next.js 16 app (App Router, TypeScript, Tailwind v4, Zustand, Motion)
shared/     Domain types shared by frontend and backend (Product, Room, CartItem, Order)
backend/    (not started) API: pricing authority, orders, payments
3d-engine/  (not started) React Three Fiber room canvas, imported by frontend
```

## Run the frontend

```
cd frontend
npm install    dasdadsa
npm run dev        # http://localhost:3000
npm run build      # production build, all room/product pages prerendered
```

## Where things live

| Concern | Location |
|---|---|
| Pages | `frontend/app/` (`/`, `/rooms`, `/rooms/[style]`, `/rooms/[style]/[room]`, `/catalogue`, `/products/[slug]`, `/cart`) |
| Data access | `frontend/services/` is the only place that fetches data. It reads `mock-data.ts` today; swap each function to `fetch()` when the backend is ready. |
| State | `frontend/store/cart.ts` (persisted cart), `frontend/store/room.ts` (selected product, hotspot toggle, camera) |
| Design tokens | `frontend/app/globals.css` (colors, light/dark, radius rule) |
| Analytics | `frontend/utils/analytics.ts`: `track()` pushes to `window.dataLayer` |
| 3D integration point | `frontend/components/room/RoomViewer.tsx`: see the contract comment at the top |

## Current status (Week 1)

- Room pages run in **photo view**: the room render plus clickable hotspots. This is also the planned fallback for low-power devices. The 3D canvas plugs into `RoomViewer` in Week 3.
- Checkout is a disabled placeholder (Week 4, Stripe).
- All photos are Unsplash stand-ins; see `frontend/public/images/README.md`.
