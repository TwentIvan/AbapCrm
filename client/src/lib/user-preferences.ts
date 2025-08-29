// User preferences management for table layouts and configurations

export interface TableLayout {
  viewMode: 'cards' | 'list';
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
  sorting: Array<{
    id: string;
    desc: boolean;
    priority: number;
  }>;
  filters: Array<{
    id: string;
    field: string;
    value: any;
    operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte' | 'between' | 'isEmpty' | 'isNotEmpty';
    type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  }>;
  aggregations: {
    enabled: boolean;
    position: 'top' | 'bottom';
    columns: Array<{
      id: string;
      type: 'sum' | 'avg' | 'count' | 'min' | 'max';
    }>;
    subtotals: {
      enabled: boolean;
      groupBy: string[];
    };
  };
  pageSize: number;
}

export interface UserPreferences {
  tables: Record<string, TableLayout>;
  lastUsed: Record<string, Date>;
}

class UserPreferencesService {
  private readonly STORAGE_KEY = 'crm_user_preferences';
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  private getDefaultLayout(): TableLayout {
    return {
      viewMode: 'cards',
      columnVisibility: {},
      columnOrder: [],
      sorting: [],
      filters: [],
      aggregations: {
        enabled: false,
        position: 'bottom',
        columns: [],
        subtotals: {
          enabled: false,
          groupBy: [],
        },
      },
      pageSize: 10,
    };
  }

  private loadFromStorage(): UserPreferences {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        return { tables: {}, lastUsed: {} };
      }
      
      const parsed = JSON.parse(stored);
      // Convert date strings back to Date objects
      Object.keys(parsed.lastUsed || {}).forEach(key => {
        parsed.lastUsed[key] = new Date(parsed.lastUsed[key]);
      });
      
      return parsed;
    } catch (error) {
      console.error('Failed to load user preferences:', error);
      return { tables: {}, lastUsed: {} };
    }
  }

  private saveToStorage(preferences: UserPreferences): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.error('Failed to save user preferences:', error);
    }
  }

  // Get layout for a specific table
  getTableLayout(tableId: string): TableLayout {
    const preferences = this.loadFromStorage();
    return preferences.tables[tableId] || this.getDefaultLayout();
  }

  // Save layout for a specific table
  saveTableLayout(tableId: string, layout: Partial<TableLayout>): void {
    const preferences = this.loadFromStorage();
    
    if (!preferences.tables[tableId]) {
      preferences.tables[tableId] = this.getDefaultLayout();
    }
    
    // Merge with existing layout
    preferences.tables[tableId] = {
      ...preferences.tables[tableId],
      ...layout,
    };
    
    // Update last used timestamp
    preferences.lastUsed[tableId] = new Date();
    
    this.saveToStorage(preferences);
  }

  // Auto-save layout changes with debouncing
  private saveTimeouts = new Map<string, NodeJS.Timeout>();
  
  autoSaveTableLayout(tableId: string, layout: Partial<TableLayout>, delay = 1000): void {
    // Clear existing timeout for this table
    const existingTimeout = this.saveTimeouts.get(tableId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Set new timeout
    const timeout = setTimeout(() => {
      this.saveTableLayout(tableId, layout);
      this.saveTimeouts.delete(tableId);
    }, delay);
    
    this.saveTimeouts.set(tableId, timeout);
  }

  // Get all table preferences
  getAllTableLayouts(): Record<string, TableLayout> {
    const preferences = this.loadFromStorage();
    return preferences.tables;
  }

  // Reset layout to default
  resetTableLayout(tableId: string): void {
    const preferences = this.loadFromStorage();
    preferences.tables[tableId] = this.getDefaultLayout();
    this.saveToStorage(preferences);
  }

  // Export preferences for backup
  exportPreferences(): string {
    const preferences = this.loadFromStorage();
    return JSON.stringify(preferences, null, 2);
  }

  // Import preferences from backup
  importPreferences(data: string): boolean {
    try {
      const preferences = JSON.parse(data);
      this.saveToStorage(preferences);
      return true;
    } catch (error) {
      console.error('Failed to import preferences:', error);
      return false;
    }
  }

  // Clean up old unused layouts
  cleanupOldLayouts(maxAge = 30 * 24 * 60 * 60 * 1000): void {
    const preferences = this.loadFromStorage();
    const now = new Date();
    
    Object.keys(preferences.lastUsed).forEach(tableId => {
      const lastUsed = new Date(preferences.lastUsed[tableId]);
      if (now.getTime() - lastUsed.getTime() > maxAge) {
        delete preferences.tables[tableId];
        delete preferences.lastUsed[tableId];
      }
    });
    
    this.saveToStorage(preferences);
  }
}

// Export singleton instance
export const userPreferences = new UserPreferencesService();

// React hooks for easier integration
import { useState, useEffect, useCallback } from 'react';

export function useTableLayout(tableId: string) {
  const [layout, setLayout] = useState<TableLayout>(() => 
    userPreferences.getTableLayout(tableId)
  );

  const updateLayout = useCallback((updates: Partial<TableLayout>) => {
    setLayout(prevLayout => {
      const newLayout = { ...prevLayout, ...updates };
      userPreferences.autoSaveTableLayout(tableId, newLayout);
      return newLayout;
    });
  }, [tableId]);

  const resetLayout = () => {
    userPreferences.resetTableLayout(tableId);
    setLayout(userPreferences.getTableLayout(tableId));
  };

  return {
    layout,
    updateLayout,
    resetLayout,
  };
}