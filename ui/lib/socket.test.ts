import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = new Map<string, (payload: unknown) => void>();
const fakeSocket = {
  on: vi.fn((event: string, cb: (payload: unknown) => void) => {
    handlers.set(event, cb);
  }),
  disconnect: vi.fn()
};
const ioMock = vi.fn((..._args: unknown[]) => fakeSocket);

vi.mock("socket.io-client", () => ({
  io: (...args: unknown[]) => ioMock(...args)
}));

import { CLIENT_ID_STORAGE_KEY } from "./client-id";
import { createSocket } from "./socket";

describe("createSocket", () => {
  beforeEach(() => {
    localStorage.clear();
    handlers.clear();
    ioMock.mockClear();
    fakeSocket.on.mockClear();
  });

  it("connects with the persisted clientId in the handshake auth", () => {
    createSocket("http://localhost:9999");
    expect(ioMock).toHaveBeenCalledTimes(1);
    const [url, opts] = ioMock.mock.calls[0] as unknown as [string, { auth: { clientId: string } }];
    expect(url).toBe("http://localhost:9999");
    expect(opts.auth.clientId).toBe(localStorage.getItem(CLIENT_ID_STORAGE_KEY));
  });

  it("persists the server-assigned sessionId on session:restored", () => {
    createSocket();
    const restored = handlers.get("session:restored");
    expect(restored).toBeTypeOf("function");
    const sessionId = "123e4567-e89b-42d3-a456-426614174000";
    restored?.({ sessionId, restored: true, messageCount: 0 });
    expect(localStorage.getItem(CLIENT_ID_STORAGE_KEY)).toBe(sessionId);
  });

  it("ignores a session:restored payload without a sessionId", () => {
    createSocket();
    const before = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    handlers.get("session:restored")?.({ restored: false, messageCount: 0 });
    expect(localStorage.getItem(CLIENT_ID_STORAGE_KEY)).toBe(before);
  });
});
