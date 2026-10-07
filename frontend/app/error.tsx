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
      code="Error"
      title="Something went wrong."
      actions={
        <>
          <Button size="lg" onClick={() => retry()}>Try again</Button>
          <ButtonLink href="/" size="lg" variant="secondary">Back to rooms</ButtonLink>
        </>
      }
    >
      This page didn&apos;t load properly. Trying again usually fixes it, and your cart is saved either way.
      {error.digest && <span className="mt-3 block font-mono text-xs">Reference: {error.digest}</span>}
    </ErrorScreen>
  );
}
