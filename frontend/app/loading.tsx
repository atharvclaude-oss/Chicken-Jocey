import { Room8Loader } from "@/components/brand/Room8Loader";

// Shown while any route's data loads. The delay keeps quick navigations
// (filter changes, cached pages) from flashing the black screen.
export default function Loading() {
  return <Room8Loader fixed delayMs={250} />;
}
