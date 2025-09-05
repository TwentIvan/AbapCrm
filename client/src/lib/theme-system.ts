// Sistema di gestione temi colore per l'applicazione CRM

export interface ThemeColors {
  primary: {
    main: string;
    light: string;
    border: string;
    hover: string;
  };
  secondary: {
    main: string;
    light: string;
    border: string;
    hover: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
  };
  background: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

export interface ThemeConfiguration {
  id: string;
  name: string;
  displayName: string;
  colors: ThemeColors;
  isDefault?: boolean;
}

// Temi predefiniti disponibili
export const PREDEFINED_THEMES: ThemeConfiguration[] = [
  {
    id: "classic-blue",
    name: "classic-blue", 
    displayName: "Classic Blue",
    isDefault: true,
    colors: {
      primary: {
        main: "rgba(59, 130, 246, 0.9)",
        light: "rgba(59, 130, 246, 0.1)",
        border: "rgba(59, 130, 246, 0.2)",
        hover: "rgba(59, 130, 246, 0.15)"
      },
      secondary: {
        main: "rgba(107, 114, 128, 0.9)",
        light: "rgba(107, 114, 128, 0.1)",
        border: "rgba(107, 114, 128, 0.2)",
        hover: "rgba(107, 114, 128, 0.15)"
      },
      text: {
        primary: "rgba(59, 130, 246, 0.9)",
        secondary: "hsl(var(--foreground))",
        muted: "hsl(var(--muted-foreground))"
      },
      background: {
        primary: "rgba(59, 130, 246, 0.1)",
        secondary: "rgba(59, 130, 246, 0.05)",
        accent: "rgba(255, 255, 255, 0.2)"
      }
    }
  },
  {
    id: "emerald-green",
    name: "emerald-green",
    displayName: "Emerald Green", 
    colors: {
      primary: {
        main: "rgba(16, 185, 129, 0.9)",
        light: "rgba(16, 185, 129, 0.1)",
        border: "rgba(16, 185, 129, 0.2)",
        hover: "rgba(16, 185, 129, 0.15)"
      },
      secondary: {
        main: "rgba(107, 114, 128, 0.9)",
        light: "rgba(107, 114, 128, 0.1)",
        border: "rgba(107, 114, 128, 0.2)",
        hover: "rgba(107, 114, 128, 0.15)"
      },
      text: {
        primary: "rgba(16, 185, 129, 0.9)",
        secondary: "hsl(var(--foreground))",
        muted: "hsl(var(--muted-foreground))"
      },
      background: {
        primary: "rgba(16, 185, 129, 0.1)",
        secondary: "rgba(16, 185, 129, 0.05)",
        accent: "rgba(255, 255, 255, 0.2)"
      }
    }
  },
  {
    id: "purple-elegance", 
    name: "purple-elegance",
    displayName: "Purple Elegance",
    colors: {
      primary: {
        main: "rgba(139, 92, 246, 0.9)",
        light: "rgba(139, 92, 246, 0.1)",
        border: "rgba(139, 92, 246, 0.2)",
        hover: "rgba(139, 92, 246, 0.15)"
      },
      secondary: {
        main: "rgba(107, 114, 128, 0.9)",
        light: "rgba(107, 114, 128, 0.1)",
        border: "rgba(107, 114, 128, 0.2)",
        hover: "rgba(107, 114, 128, 0.15)"
      },
      text: {
        primary: "rgba(139, 92, 246, 0.9)",
        secondary: "hsl(var(--foreground))",
        muted: "hsl(var(--muted-foreground))"
      },
      background: {
        primary: "rgba(139, 92, 246, 0.1)",
        secondary: "rgba(139, 92, 246, 0.05)",
        accent: "rgba(255, 255, 255, 0.2)"
      }
    }
  },
  {
    id: "sunset-orange",
    name: "sunset-orange", 
    displayName: "Sunset Orange",
    colors: {
      primary: {
        main: "rgba(251, 146, 60, 0.9)",
        light: "rgba(251, 146, 60, 0.1)",
        border: "rgba(251, 146, 60, 0.2)",
        hover: "rgba(251, 146, 60, 0.15)"
      },
      secondary: {
        main: "rgba(107, 114, 128, 0.9)",
        light: "rgba(107, 114, 128, 0.1)",
        border: "rgba(107, 114, 128, 0.2)",
        hover: "rgba(107, 114, 128, 0.15)"
      },
      text: {
        primary: "rgba(251, 146, 60, 0.9)",
        secondary: "hsl(var(--foreground))",
        muted: "hsl(var(--muted-foreground))"
      },
      background: {
        primary: "rgba(251, 146, 60, 0.1)",
        secondary: "rgba(251, 146, 60, 0.05)",
        accent: "rgba(255, 255, 255, 0.2)"
      }
    }
  },
  {
    id: "rose-gold",
    name: "rose-gold",
    displayName: "Rose Gold", 
    colors: {
      primary: {
        main: "rgba(244, 114, 182, 0.9)",
        light: "rgba(244, 114, 182, 0.1)",
        border: "rgba(244, 114, 182, 0.2)",
        hover: "rgba(244, 114, 182, 0.15)"
      },
      secondary: {
        main: "rgba(107, 114, 128, 0.9)",
        light: "rgba(107, 114, 128, 0.1)",
        border: "rgba(107, 114, 128, 0.2)",
        hover: "rgba(107, 114, 128, 0.15)"
      },
      text: {
        primary: "rgba(244, 114, 182, 0.9)",
        secondary: "hsl(var(--foreground))",
        muted: "hsl(var(--muted-foreground))"
      },
      background: {
        primary: "rgba(244, 114, 182, 0.1)",
        secondary: "rgba(244, 114, 182, 0.05)",
        accent: "rgba(255, 255, 255, 0.2)"
      }
    }
  }
];

export interface OrganizationSettings {
  theme?: {
    currentTheme: string;
    customThemes?: ThemeConfiguration[];
  };
  // Altri settings dell'organizzazione possono essere aggiunti qui
}

// Utility functions per gestire i temi
export const getThemeById = (themeId: string): ThemeConfiguration | undefined => {
  return PREDEFINED_THEMES.find(theme => theme.id === themeId);
};

export const getDefaultTheme = (): ThemeConfiguration => {
  return PREDEFINED_THEMES.find(theme => theme.isDefault) || PREDEFINED_THEMES[0];
};

export const parseOrganizationSettings = (settingsJson: string | null): OrganizationSettings => {
  if (!settingsJson) return {};
  
  try {
    return JSON.parse(settingsJson) as OrganizationSettings;
  } catch (error) {
    console.error('Error parsing organization settings:', error);
    return {};
  }
};

export const stringifyOrganizationSettings = (settings: OrganizationSettings): string => {
  return JSON.stringify(settings);
};