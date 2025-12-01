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
  isPersonalOrg: boolean;
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

const IS_PERSONAL_ORG_KEY = 'isPersonalOrg';

export function OrganizationProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage ONCE
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(() => {
    return localStorage.getItem(ORG_STORAGE_KEY);
  });

  const [personalScope, setPersonalScopeState] = useState<PersonalScope>(() => {
    const saved = localStorage.getItem(SCOPE_STORAGE_KEY);
    return (saved === 'all' || saved === 'personal') ? saved : 'personal';
  });

  // Stable state for isPersonalOrg - initialized from localStorage
  const [isPersonalOrgState, setIsPersonalOrgState] = useState<boolean>(() => {
    return localStorage.getItem(IS_PERSONAL_ORG_KEY) === 'true';
  });

  const queryClient = useQueryClient();

  // Fetch user's organizations - use staleTime to prevent refetching during switch
  const { data: organizations = [], isLoading, error } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 5 * 60 * 1000, // 5 minutes - organizations rarely change
    refetchOnMount: false, // Use cached data
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Get current organization details
  const currentOrganization = organizations?.find(org => org.id === currentOrganizationId);
  
  // Update isPersonalOrg state ONLY when we have confirmed data
  useEffect(() => {
    if (currentOrganization) {
      const isPersonal = currentOrganization.name === "Personal";
      setIsPersonalOrgState(isPersonal);
      localStorage.setItem(IS_PERSONAL_ORG_KEY, isPersonal ? 'true' : 'false');
    }
  }, [currentOrganization]);

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
    // IMPORTANT: Update global header FIRST before invalidating queries
    // This ensures new API calls use the correct organization header
    setGlobalOrganizationId(organizationId);
    localStorage.setItem(ORG_STORAGE_KEY, organizationId);
    setCurrentOrganizationId(organizationId);
    
    // Immediately update isPersonalOrg based on cached organizations
    const targetOrg = organizations.find(org => org.id === organizationId);
    if (targetOrg) {
      const isPersonal = targetOrg.name === "Personal";
      setIsPersonalOrgState(isPersonal);
      localStorage.setItem(IS_PERSONAL_ORG_KEY, isPersonal ? 'true' : 'false');
    }
    
    // Small delay to ensure header is set before queries refetch
    setTimeout(() => {
      // Don't invalidate organizations query - it rarely changes
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return key !== '/api/organizations';
        }
      });
    }, 0);
  };

  // Set personal scope
  const setPersonalScope = (scope: PersonalScope) => {
    // IMPORTANT: Update global header FIRST before invalidating queries
    setGlobalPersonalScope(scope);
    localStorage.setItem(SCOPE_STORAGE_KEY, scope);
    setPersonalScopeState(scope);
    
    // Small delay to ensure header is set before queries refetch
    setTimeout(() => {
      queryClient.invalidateQueries();
    }, 0);
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
        isPersonalOrg: isPersonalOrgState,
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
