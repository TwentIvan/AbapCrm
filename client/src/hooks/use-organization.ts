import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { setCurrentOrganizationId as setGlobalOrganizationId, getQueryFn } from "@/lib/queryClient";

interface Organization {
  id: string;
  name: string;
  isActive: boolean; // Status field
  theme: string; // Theme color
  partnerId?: string | null; // Partner reference
  userRole: string;
}

export function useOrganization() {
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch user's organizations - NO CACHE to ensure login state changes are detected
  const { data: organizations = [], isLoading, error } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 0, // No cache - always fresh
    refetchOnMount: true, // Always refetch 
    refetchOnWindowFocus: true, // Refetch on focus to catch session changes
    retry: 1,
  });

  // Debug logging
  console.log('🔍 Organization query status:', { 
    organizations, 
    isLoading, 
    error: error?.message,
    length: organizations?.length 
  });

  // Get current organization details
  const currentOrganization = organizations?.find(org => org.id === currentOrganizationId);

  // Set default organization on load
  useEffect(() => {
    if (organizations && organizations.length > 0 && !currentOrganizationId) {
      // Look for "Personal" organization first, otherwise take the first one
      const personalOrg = organizations.find(org => org.name === "Personal");
      const defaultOrg = personalOrg || organizations[0];
      setCurrentOrganizationId(defaultOrg.id);
    }
  }, [organizations, currentOrganizationId, isLoading]);

  // Update global organization ID whenever it changes
  useEffect(() => {
    setGlobalOrganizationId(currentOrganizationId);
  }, [currentOrganizationId]);

  // Switch organization
  const switchOrganization = (organizationId: string) => {
    setCurrentOrganizationId(organizationId);
    // Invalidate all queries that depend on organization context
    queryClient.invalidateQueries();
  };

  // Force reload organizations when user logs in
  const reloadOrganizations = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
  };

  return {
    organizations,
    currentOrganization,
    currentOrganizationId,
    switchOrganization,
    reloadOrganizations,
    isLoading,
    error
  };
}