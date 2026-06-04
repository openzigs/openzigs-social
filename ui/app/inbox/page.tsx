import { InboxView } from "@/components/inbox/inbox-view";
import { TourOverlay } from "@/components/onboarding/tour-overlay";

export default function InboxPage() {
  return (
    <>
      <TourOverlay section="inbox" />
      <InboxView />
    </>
  );
}
