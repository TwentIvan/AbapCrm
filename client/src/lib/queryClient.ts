import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Global state for current organization ID and scope - will be set by OrganizationProvider
let currentOrganizationId: string | null = null;
let currentPersonalScope: 'personal' | 'all' = 'personal';

export function setCurrentOrganizationId(organizationId: string | null) {
  currentOrganizationId = organizationId;
}

export function getCurrentOrganizationId() {
  return currentOrganizationId;
}

export function setCurrentPersonalScope(scope: 'personal' | 'all') {
  currentPersonalScope = scope;
}

export function getCurrentPersonalScope() {
  return currentPersonalScope;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const error = new Error(`${res.status}: ${text}`);
    (error as any).status = res.status;
    throw error;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  
  // Add organization header if available
  if (currentOrganizationId) {
    headers["X-Organization-Id"] = currentOrganizationId;
  }
  
  // Add personal scope header
  headers["X-Organization-Scope"] = currentPersonalScope;

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers: Record<string, string> = {};
    
    // Add organization header if available
    if (currentOrganizationId) {
      headers["X-Organization-Id"] = currentOrganizationId;
    }
    
    // Add personal scope header
    headers["X-Organization-Scope"] = currentPersonalScope;

    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Don't refetch if data exists
      refetchOnReconnect: false,
      staleTime: 30 * 60 * 1000, // 30 minutes - aggressive caching
      gcTime: 60 * 60 * 1000, // 1 hour (was cacheTime in v4)
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
