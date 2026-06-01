import { CalendarView } from "@/components/calendar/calendar-view";
import { TourOverlay } from "@/components/onboarding/tour-overlay";

export default function CalendarPage() {
  return (
    <>
      <TourOverlay section="scheduler" />
      <CalendarView />
    </>
  );
}
