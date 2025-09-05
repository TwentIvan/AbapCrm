import { useState, useEffect, ReactNode } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { ThemeContext, ThemeContextType } from "@/hooks/use-theme";
import { 
  ThemeConfiguration, 
  PREDEFINED_THEMES, 
  getDefaultTheme, 
  getThemeById,
  parseOrganizationSettings,
  stringifyOrganizationSettings,
  OrganizationSettings 
} from "@/lib/theme-system";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { currentOrganization } = useOrganization();
  const [currentTheme, setCurrentTheme] = useState<ThemeConfiguration>(getDefaultTheme());
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();

  // Mutation per aggiornare le impostazioni dell'organizzazione
  const updateOrganizationMutation = useMutation({
    mutationFn: async ({ organizationId, settings }: { organizationId: string; settings: string }) => {
      return await apiRequest("PATCH", `/api/organizations/${organizationId}`, { 
        settings 
      });
    },
    onSuccess: () => {
      // Invalidate organization cache
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
    }
  });

  // Carica il tema dalle impostazioni dell'organizzazione
  useEffect(() => {
    if (currentOrganization?.settings) {
      const orgSettings = parseOrganizationSettings(currentOrganization.settings);
      const themeId = orgSettings.theme?.currentTheme;
      
      if (themeId) {
        const theme = getThemeById(themeId);
        if (theme) {
          setCurrentTheme(theme);
          applyThemeToDOM(theme);
        }
      }
    } else {
      // Se non ci sono impostazioni, usa il tema di default
      const defaultTheme = getDefaultTheme();
      setCurrentTheme(defaultTheme);
      applyThemeToDOM(defaultTheme);
    }
  }, [currentOrganization]);

  // Applica il tema al DOM per variabili CSS dinamiche
  const applyThemeToDOM = (theme: ThemeConfiguration) => {
    const root = document.documentElement;
    
    // Applica le variabili CSS custom per il tema
    root.style.setProperty('--theme-primary-main', theme.colors.primary.main);
    root.style.setProperty('--theme-primary-light', theme.colors.primary.light);
    root.style.setProperty('--theme-primary-border', theme.colors.primary.border);
    root.style.setProperty('--theme-primary-hover', theme.colors.primary.hover);
    
    root.style.setProperty('--theme-secondary-main', theme.colors.secondary.main);
    root.style.setProperty('--theme-secondary-light', theme.colors.secondary.light);
    root.style.setProperty('--theme-secondary-border', theme.colors.secondary.border);
    root.style.setProperty('--theme-secondary-hover', theme.colors.secondary.hover);
    
    root.style.setProperty('--theme-text-primary', theme.colors.text.primary);
    root.style.setProperty('--theme-background-primary', theme.colors.background.primary);
    root.style.setProperty('--theme-background-secondary', theme.colors.background.secondary);
    root.style.setProperty('--theme-background-accent', theme.colors.background.accent);
  };

  // Funzione per cambiare tema
  const setTheme = async (themeId: string) => {
    if (!currentOrganization) return;
    
    const newTheme = getThemeById(themeId);
    if (!newTheme) return;

    setIsLoading(true);
    
    try {
      // Aggiorna le impostazioni dell'organizzazione
      const currentSettings = parseOrganizationSettings(currentOrganization.settings || null);
      const updatedSettings: OrganizationSettings = {
        ...currentSettings,
        theme: {
          ...currentSettings.theme,
          currentTheme: themeId
        }
      };

      await updateOrganizationMutation.mutateAsync({
        organizationId: currentOrganization.id,
        settings: stringifyOrganizationSettings(updatedSettings)
      });

      // Applica il nuovo tema
      setCurrentTheme(newTheme);
      applyThemeToDOM(newTheme);
      
    } catch (error) {
      console.error('Error updating theme:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const contextValue: ThemeContextType = {
    currentTheme,
    availableThemes: PREDEFINED_THEMES,
    setTheme,
    isLoading: isLoading || updateOrganizationMutation.isPending
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}