import { AutoReplyView } from "@/components/auto-reply/auto-reply-view";
import { TourOverlay } from "@/components/onboarding/tour-overlay";
import { YouTubeQuotaWidget } from "@/components/youtube/quota-widget";

export default function SettingsPage() {
  return (
    <>
      <TourOverlay section="brand-voice" />
      <div className="space-y-6">
        <YouTubeQuotaWidget className="max-w-xs" />
        <AutoReplyView />
      </div>
    </>
  );
}
