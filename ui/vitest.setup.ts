import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

// jsdom does not implement matchMedia; provide a controllable stub.
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    })
  });
}
// Radix UI relies on pointer-capture + scrollIntoView APIs missing in jsdom.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

// ResizeObserver is referenced by some Radix primitives.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// recharts relies on a measured container (ResponsiveContainer + ResizeObserver)
// that never reports non-zero dimensions under jsdom, so its charts render
// empty and warn. Replace the primitives we use with thin pass-through wrappers
// so chart components mount deterministically and we can assert on their
// surrounding markup (titles, legends, empty states).
vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", { "data-recharts": "true" }, children);
  const Empty = () => null;
  return {
    ResponsiveContainer: Pass,
    LineChart: Pass,
    Line: Empty,
    XAxis: Empty,
    YAxis: Empty,
    CartesianGrid: Empty,
    Tooltip: Empty,
    Legend: Empty
  };
});
