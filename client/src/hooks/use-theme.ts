import { createContext, useContext } from "react";
import { ThemeConfiguration, PREDEFINED_THEMES, getDefaultTheme } from "@/lib/theme-system";

export interface ThemeContextType {
  currentTheme: ThemeConfiguration;
  availableThemes: ThemeConfiguration[];
  setTheme: (themeId: string) => Promise<void>;
  isLoading: boolean;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}