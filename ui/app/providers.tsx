"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import type { Socket } from "socket.io-client";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { makeQueryClient } from "@/lib/query-client";
import { createSocket } from "@/lib/socket";

const SocketContext = React.createContext<Socket | null>(null);

/** Access the shared Socket.IO client (null until connected on the client). */
export function useSocket(): Socket | null {
  return React.useContext(SocketContext);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(makeQueryClient);

  // Create the Socket.IO client once, lazily, on the client. The lazy state
  // initializer keeps a single connection without setting state in an effect.
  const [socket] = React.useState<Socket | null>(() =>
    typeof window === "undefined" ? null : createSocket()
  );

  React.useEffect(() => {
    if (socket && !socket.connected) {
      socket.connect();
    }
    return () => {
      socket?.disconnect();
    };
  }, [socket]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SocketContext.Provider value={socket}>
          {children}
          <Toaster />
        </SocketContext.Provider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
