import type { Metadata } from "next";
import { ButtonLink } from "@/components/common/Button";
import { ErrorScreen } from "@/components/common/ErrorScreen";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <ErrorScreen
      code="404"
      title="This page doesn't exist."
      actions={
        <>
          <ButtonLink href="/" size="lg">Browse rooms</ButtonLink>
          <ButtonLink href="/catalogue" size="lg" variant="secondary">Shop catalogue</ButtonLink>
        </>
      }
    >
      The room or product may have been moved or retired. Your cart is saved, so nothing you added is lost.
    </ErrorScreen>
  );
}
