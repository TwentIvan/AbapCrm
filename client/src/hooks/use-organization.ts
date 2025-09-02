import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Organization {
  id: string;
  name: string;
  description?: string;
  userRole: string;
}

export function useOrganization() {
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch user's organizations
  const { data: organizations = [], isLoading } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
    retry: false,
  });

  // Get current organization details
  const currentOrganization = organizations.find(org => org.id === currentOrganizationId);

  // Set default organization on load
  useEffect(() => {
    if (organizations.length > 0 && !currentOrganizationId) {
      // Look for "Personal" organization first, otherwise take the first one
      const personalOrg = organizations.find(org => org.name === "Personal");
      const defaultOrg = personalOrg || organizations[0];
      setCurrentOrganizationId(defaultOrg.id);
    }
  }, [organizations, currentOrganizationId]);

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