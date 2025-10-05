import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { setCurrentOrganizationId as setGlobalOrganizationId, setCurrentPersonalScope as setGlobalPersonalScope, getQueryFn } from "@/lib/queryClient";

interface Organization {
  id: string;
  name: string;
  isActive: boolean;
  theme: string;
  partnerId?: string | null;
  userRole: string;
}

type PersonalScope = 'personal' | 'all';

interface OrganizationContextValue {
  organizations: Organization[];
  currentOrganization: Organization | undefined;
  currentOrganizationId: string | null;
  personalScope: PersonalScope;
  switchOrganization: (organizationId: string) => void;
  setPersonalScope: (scope: PersonalScope) => void;
  reloadOrganizations: () => void;
  isLoading: boolean;
  error: Error | null;
}

const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined);

const ORG_STORAGE_KEY = 'currentOrganizationId';
const SCOPE_STORAGE_KEY = 'personalScope';

export function OrganizationProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage ONCE
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(() => {
    return localStorage.getItem(ORG_STORAGE_KEY);
  });

  const [personalScope, setPersonalScopeState] = useState<PersonalScope>(() => {
    const saved = localStorage.getItem(SCOPE_STORAGE_KEY);
    return (saved === 'all' || saved === 'personal') ? saved : 'personal';
  });

  const queryClient = useQueryClient();

  // Fetch user's organizations
  const { data: organizations = [], isLoading, error } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Get current organization details
  const currentOrganization = organizations?.find(org => org.id === currentOrganizationId);

  // Set default organization on load (only if not already set)
  useEffect(() => {
    if (organizations && organizations.length > 0 && !currentOrganizationId) {
      // Try to restore from localStorage
      const savedOrgId = localStorage.getItem(ORG_STORAGE_KEY);
      const savedOrg = savedOrgId ? organizations.find(org => org.id === savedOrgId) : null;
      
      if (savedOrg) {
        setCurrentOrganizationId(savedOrg.id);
      } else {
        // Look for "Personal" organization first, otherwise take the first one
        const personalOrg = organizations.find(org => org.name === "Personal");
        const defaultOrg = personalOrg || organizations[0];
        setCurrentOrganizationId(defaultOrg.id);
        localStorage.setItem(ORG_STORAGE_KEY, defaultOrg.id);
      }
    }
  }, [organizations, currentOrganizationId]);

  // Update global organization ID whenever it changes
  useEffect(() => {
    setGlobalOrganizationId(currentOrganizationId);
    if (currentOrganizationId) {
      localStorage.setItem(ORG_STORAGE_KEY, currentOrganizationId);
    }
  }, [currentOrganizationId]);

  // Persist personalScope to localStorage and update global state
  useEffect(() => {
    localStorage.setItem(SCOPE_STORAGE_KEY, personalScope);
    setGlobalPersonalScope(personalScope);
  }, [personalScope]);

  // Switch organization
  const switchOrganization = (organizationId: string) => {
    setCurrentOrganizationId(organizationId);
    localStorage.setItem(ORG_STORAGE_KEY, organizationId);
    // Invalidate all queries that depend on organization context
    queryClient.invalidateQueries();
  };

  // Set personal scope
  const setPersonalScope = (scope: PersonalScope) => {
    setPersonalScopeState(scope);
    localStorage.setItem(SCOPE_STORAGE_KEY, scope);
    // Invalidate all queries when scope changes
    queryClient.invalidateQueries();
  };

  // Force reload organizations
  const reloadOrganizations = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
  };

  return (
    <OrganizationContext.Provider
      value={{
        organizations,
        currentOrganization,
        currentOrganizationId,
        personalScope,
        switchOrganization,
        setPersonalScope,
        reloadOrganizations,
        isLoading,
        error: error as Error | null,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return context;
}
