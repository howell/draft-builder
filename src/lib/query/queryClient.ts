import { QueryClient } from '@tanstack/react-query';

let clientQueryClient: QueryClient | undefined = undefined;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes (renamed from cacheTime in v5)
        retry: 3,
        retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
        
        // Disable refetch on focus for E2E tests
        refetchOnWindowFocus: process.env.NODE_ENV !== 'test',
        refetchOnReconnect: true,
      },
    },
  });
}

export function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important so we don't re-make a new client if React
    // suspends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    if (!clientQueryClient) clientQueryClient = makeQueryClient();
    return clientQueryClient;
  }
}