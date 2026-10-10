"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/common/Button";
import { ErrorScreen } from "@/components/common/ErrorScreen";
import { track } from "@/utils/analytics";

// Catches errors in any page below the root layout; the navbar and cart stay usable.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    track("page_error", { digest: error.digest });
  }, [error]);

  return (
    <ErrorScreen
      code="Something broke"
      title="The lights went out in this room."
      mood="flicker"
      actions={
        <>
          <Button size="lg" onClick={() => retry()}>Try again</Button>
          <ButtonLink href="/" size="lg" variant="secondary">Back to rooms</ButtonLink>
        </>
      }
    >
      This page hit a snag while loading. Trying again usually fixes it, and everything in your cart is still saved.
      {error.digest && <span className="mt-3 block font-mono text-xs">Reference: {error.digest}</span>}
    </ErrorScreen>
  );
}
