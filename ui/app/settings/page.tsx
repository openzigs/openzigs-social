import { AutoReplyView } from "@/components/auto-reply/auto-reply-view";
import { TourOverlay } from "@/components/onboarding/tour-overlay";
import { YouTubeQuotaWidget } from "@/components/youtube/quota-widget";
import { BackupSection } from "@/components/backup/backup-section";

export default function SettingsPage() {
  return (
    <>
      <TourOverlay section="brand-voice" />
      <div className="space-y-6">
        <YouTubeQuotaWidget className="max-w-xs" />
        <AutoReplyView />
        <BackupSection />
      </div>
    </>
  );
}
