import { QueryClient } from "@tanstack/react-query";

/** Construct a QueryClient with sensible local-first defaults. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1
      }
    }
  });
}
