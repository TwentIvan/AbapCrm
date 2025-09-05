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

  // Fetch user's organizations with aggressive caching
  // Note: This query should NOT have enabled condition as it's needed to SET the organization context
  const { data: organizations = [], isLoading } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnMount: false, // Don't refetch if data exists
    refetchOnWindowFocus: false,
    retry: false,
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

  return {
    organizations,
    currentOrganization,
    currentOrganizationId,
    switchOrganization,
    isLoading
  };
}