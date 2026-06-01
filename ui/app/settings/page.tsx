import { AutoReplyView } from "@/components/auto-reply/auto-reply-view";
import { TourOverlay } from "@/components/onboarding/tour-overlay";

export default function SettingsPage() {
  return (
    <>
      <TourOverlay section="brand-voice" />
      <AutoReplyView />
    </>
  );
}
