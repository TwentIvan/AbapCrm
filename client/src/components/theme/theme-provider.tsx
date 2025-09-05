import React, { createContext, useContext, useState, useEffect } from "react";

export type Theme = {
  name: string;
  label: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentForeground: string;
};

const themes: Theme[] = [
  {
    name: "blue",
    label: "Blu",
    primary: "hsl(221.2 83.2% 53.3%)",
    primaryForeground: "hsl(210 40% 98%)",
    secondary: "hsl(210 40% 96%)", 
    secondaryForeground: "hsl(222.2 84% 4.9%)",
    accent: "hsl(210 40% 96%)",
    accentForeground: "hsl(222.2 84% 4.9%)",
  },
  {
    name: "green",
    label: "Verde",
    primary: "hsl(142.1 76.2% 36.3%)",
    primaryForeground: "hsl(355.7 100% 97.3%)",
    secondary: "hsl(120 40% 96%)",
    secondaryForeground: "hsl(120 84% 4.9%)",
    accent: "hsl(120 40% 96%)",
    accentForeground: "hsl(120 84% 4.9%)",
  },
  {
    name: "purple",
    label: "Viola",
    primary: "hsl(262.1 83.3% 57.8%)",
    primaryForeground: "hsl(210 40% 98%)",
    secondary: "hsl(270 40% 96%)",
    secondaryForeground: "hsl(270 84% 4.9%)",
    accent: "hsl(270 40% 96%)",
    accentForeground: "hsl(270 84% 4.9%)",
  },
  {
    name: "orange",
    label: "Arancione",
    primary: "hsl(24.6 95% 53.1%)",
    primaryForeground: "hsl(60 9.1% 97.8%)",
    secondary: "hsl(30 40% 96%)",
    secondaryForeground: "hsl(30 84% 4.9%)",
    accent: "hsl(30 40% 96%)",
    accentForeground: "hsl(30 84% 4.9%)",
  },
  {
    name: "red",
    label: "Rosso",
    primary: "hsl(0 72.2% 50.6%)",
    primaryForeground: "hsl(0 85.7% 97.3%)",
    secondary: "hsl(0 40% 96%)",
    secondaryForeground: "hsl(0 84% 4.9%)",
    accent: "hsl(0 40% 96%)",
    accentForeground: "hsl(0 84% 4.9%)",
  },
];

type ThemeProviderContext = {
  currentTheme: Theme;
  setTheme: (themeName: string) => void;
  themes: Theme[];
};

const ThemeProviderContext = createContext<ThemeProviderContext | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<Theme>(themes[0]);

  const setTheme = (themeName: string) => {
    const theme = themes.find(t => t.name === themeName) || themes[0];
    setCurrentTheme(theme);
    localStorage.setItem("theme", themeName);
    
    // Apply CSS variables to document root
    const root = document.documentElement;
    root.style.setProperty("--primary", theme.primary);
    root.style.setProperty("--primary-foreground", theme.primaryForeground);
    root.style.setProperty("--secondary", theme.secondary);
    root.style.setProperty("--secondary-foreground", theme.secondaryForeground);
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--accent-foreground", theme.accentForeground);
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  return (
    <ThemeProviderContext.Provider value={{
      currentTheme,
      setTheme,
      themes
    }}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}