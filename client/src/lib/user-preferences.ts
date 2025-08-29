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

export interface SavedLayout extends TableLayout {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TableConfig {
  layouts: Record<string, SavedLayout>;
  currentLayout: string; // ID of current layout
  lastUsed: Date;
}

export interface UserPreferences {
  tables: Record<string, TableConfig>;
}

class UserPreferencesService {
  private readonly STORAGE_KEY = 'crm_user_preferences';
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  private getDefaultLayout(): TableLayout {
    return {
      viewMode: 'list',
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
        return { tables: {} };
      }
      
      const parsed = JSON.parse(stored);
      // Convert date strings back to Date objects for table configs
      Object.keys(parsed.tables || {}).forEach(tableId => {
        const tableConfig = parsed.tables[tableId];
        if (tableConfig.lastUsed) {
          tableConfig.lastUsed = new Date(tableConfig.lastUsed);
        }
        // Convert dates in layouts
        Object.keys(tableConfig.layouts || {}).forEach(layoutId => {
          const layout = tableConfig.layouts[layoutId];
          if (layout.createdAt) layout.createdAt = new Date(layout.createdAt);
          if (layout.updatedAt) layout.updatedAt = new Date(layout.updatedAt);
        });
      });
      
      return parsed;
    } catch (error) {
      console.error('Failed to load user preferences:', error);
      return { tables: {} };
    }
  }

  private saveToStorage(preferences: UserPreferences): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(preferences));
      console.log('User preferences saved to localStorage');
    } catch (error) {
      console.error('Failed to save user preferences:', error);
    }
  }

  // Get current layout for a specific table
  getTableLayout(tableId: string): TableLayout {
    const preferences = this.loadFromStorage();
    const tableConfig = preferences.tables[tableId];
    
    if (!tableConfig || !tableConfig.currentLayout || !tableConfig.layouts[tableConfig.currentLayout]) {
      return this.getDefaultLayout();
    }
    
    const { name, createdAt, updatedAt, ...layout } = tableConfig.layouts[tableConfig.currentLayout];
    return layout;
  }

  // Get current layout name
  getCurrentLayoutName(tableId: string): string {
    const preferences = this.loadFromStorage();
    const tableConfig = preferences.tables[tableId];
    
    if (!tableConfig || !tableConfig.currentLayout || !tableConfig.layouts[tableConfig.currentLayout]) {
      return 'Default';
    }
    
    return tableConfig.layouts[tableConfig.currentLayout].name;
  }

  // Get all saved layouts for a table
  getSavedLayouts(tableId: string): SavedLayout[] {
    const preferences = this.loadFromStorage();
    const tableConfig = preferences.tables[tableId];
    
    if (!tableConfig || !tableConfig.layouts) {
      return [];
    }
    
    const layouts = Object.entries(tableConfig.layouts).map(([id, layout]) => ({
      ...layout,
      id,
    }));
    
    return layouts;
  }

  // Update current layout for a specific table
  saveTableLayout(tableId: string, layout: Partial<TableLayout>): void {
    const preferences = this.loadFromStorage();
    
    if (!preferences.tables[tableId]) {
      // Initialize table config with default layout
      const defaultLayout = this.getDefaultLayout();
      const defaultId = 'default';
      preferences.tables[tableId] = {
        layouts: {
          [defaultId]: {
            ...defaultLayout,
            id: defaultId,
            name: 'Default',
            isDefault: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        },
        currentLayout: defaultId,
        lastUsed: new Date(),
      };
    }
    
    const tableConfig = preferences.tables[tableId];
    const currentLayoutId = tableConfig.currentLayout || 'default';
    
    // Ensure layouts object exists
    if (!tableConfig.layouts) {
      tableConfig.layouts = {};
    }
    
    const currentLayout = tableConfig.layouts[currentLayoutId];
    
    if (!currentLayout) {
      // If current layout doesn't exist, create it with default values
      const defaultLayout = this.getDefaultLayout();
      tableConfig.layouts[currentLayoutId] = {
        ...defaultLayout,
        id: currentLayoutId,
        name: currentLayoutId === 'default' ? 'Default' : 'Layout',
        isDefault: currentLayoutId === 'default',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
    
    // Get the current layout (after ensuring it exists)
    const finalCurrentLayout = tableConfig.layouts[currentLayoutId];
    
    // Update current layout
    const { name, createdAt, updatedAt, ...existingLayout } = finalCurrentLayout;
    tableConfig.layouts[currentLayoutId] = {
      ...existingLayout,
      ...layout,
      name,
      createdAt,
      updatedAt: new Date(),
    };
    
    // Update last used timestamp
    tableConfig.lastUsed = new Date();
    
    this.saveToStorage(preferences);
  }

  // Save current layout with a new name
  saveLayoutAs(tableId: string, layoutName: string, isDefault: boolean = false): string {
    const preferences = this.loadFromStorage();
    const currentLayout = this.getTableLayout(tableId);
    
    if (!preferences.tables[tableId]) {
      preferences.tables[tableId] = {
        layouts: {},
        currentLayout: '',
        lastUsed: new Date(),
      };
    }
    
    const layoutId = `layout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const savedLayout: SavedLayout = {
      ...currentLayout,
      id: layoutId,
      name: layoutName,
      isDefault,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    preferences.tables[tableId].layouts[layoutId] = savedLayout;
    
    // If this layout should be default, remove default flag from other layouts
    if (isDefault) {
      this.setDefaultLayout(tableId, layoutId);
    } else {
      // Just save without changing current layout
      this.saveToStorage(preferences);
    }
    
    return layoutId;
  }

  // Load a specific layout
  loadLayout(tableId: string, layoutId: string): boolean {
    const preferences = this.loadFromStorage();
    const tableConfig = preferences.tables[tableId];
    
    if (!tableConfig || !tableConfig.layouts[layoutId]) {
      return false;
    }
    
    preferences.tables[tableId].currentLayout = layoutId;
    preferences.tables[tableId].lastUsed = new Date();
    
    this.saveToStorage(preferences);
    return true;
  }

  // Rename a layout
  renameLayout(tableId: string, layoutId: string, newName: string): boolean {
    const preferences = this.loadFromStorage();
    const tableConfig = preferences.tables[tableId];
    
    if (!tableConfig || !tableConfig.layouts[layoutId]) {
      return false;
    }
    
    tableConfig.layouts[layoutId].name = newName;
    tableConfig.layouts[layoutId].updatedAt = new Date();
    
    this.saveToStorage(preferences);
    return true;
  }

  // Set a layout as default (removes default flag from others)
  setDefaultLayout(tableId: string, layoutId: string): boolean {
    const preferences = this.loadFromStorage();
    const tableConfig = preferences.tables[tableId];
    
    if (!tableConfig || !tableConfig.layouts[layoutId]) {
      return false;
    }
    
    // Remove default flag from all layouts
    Object.values(tableConfig.layouts).forEach(layout => {
      layout.isDefault = false;
    });
    
    // Set the specified layout as default
    tableConfig.layouts[layoutId].isDefault = true;
    tableConfig.layouts[layoutId].updatedAt = new Date();
    
    // Set as current layout
    tableConfig.currentLayout = layoutId;
    tableConfig.lastUsed = new Date();
    
    this.saveToStorage(preferences);
    return true;
  }

  // Delete a layout
  deleteLayout(tableId: string, layoutId: string): boolean {
    const preferences = this.loadFromStorage();
    const tableConfig = preferences.tables[tableId];
    
    if (!tableConfig || !tableConfig.layouts[layoutId]) {
      return false;
    }
    
    // Don't allow deleting the last layout
    const layoutCount = Object.keys(tableConfig.layouts).length;
    if (layoutCount <= 1) {
      return false;
    }
    
    delete tableConfig.layouts[layoutId];
    
    // If we deleted the current layout, switch to the first available
    if (tableConfig.currentLayout === layoutId) {
      const remainingLayouts = Object.keys(tableConfig.layouts);
      tableConfig.currentLayout = remainingLayouts[0] || '';
    }
    
    this.saveToStorage(preferences);
    return true;
  }

  // Update an existing layout
  updateLayout(tableId: string, layoutId: string, newConfig: any): boolean {
    const preferences = this.loadFromStorage();
    const tableConfig = preferences.tables[tableId];
    
    if (!tableConfig || !tableConfig.layouts[layoutId]) {
      return false;
    }
    
    // Update the existing layout with new configuration
    const existingLayout = tableConfig.layouts[layoutId];
    tableConfig.layouts[layoutId] = {
      ...existingLayout,
      ...newConfig,
      id: layoutId, // Keep the same ID
      name: existingLayout.name, // Keep the same name
      updatedAt: new Date()
    };
    
    this.saveToStorage(preferences);
    return true;
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

  // Get all table configs
  getAllTableConfigs(): Record<string, TableConfig> {
    const preferences = this.loadFromStorage();
    return preferences.tables;
  }

  // Reset current layout to default
  resetTableLayout(tableId: string): void {
    const preferences = this.loadFromStorage();
    const defaultLayout = this.getDefaultLayout();
    const defaultId = 'default';
    
    preferences.tables[tableId] = {
      layouts: {
        [defaultId]: {
          ...defaultLayout,
          id: defaultId,
          name: 'Default',
          isDefault: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      },
      currentLayout: defaultId,
      lastUsed: new Date(),
    };
    
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
    
    Object.keys(preferences.tables).forEach(tableId => {
      const tableConfig = preferences.tables[tableId];
      const lastUsed = new Date(tableConfig.lastUsed);
      if (now.getTime() - lastUsed.getTime() > maxAge) {
        delete preferences.tables[tableId];
      }
    });
    
    this.saveToStorage(preferences);
  }

  // Update all existing layouts to use list view as default
  updateAllAreasToListView(): void {
    const preferences = this.loadFromStorage();
    let updated = false;
    
    Object.keys(preferences.tables).forEach(tableId => {
      const tableConfig = preferences.tables[tableId];
      if (tableConfig && tableConfig.layouts) {
        Object.keys(tableConfig.layouts).forEach(layoutId => {
          const layout = tableConfig.layouts[layoutId];
          if (layout && layout.viewMode === 'cards') {
            layout.viewMode = 'list';
            layout.updatedAt = new Date();
            updated = true;
            console.log(`Updated ${tableId} layout ${layoutId} to list view`);
          }
        });
      }
    });
    
    if (updated) {
      this.saveToStorage(preferences);
      console.log('All areas updated to use list view as default');
    }
  }
}

// Export singleton instance
export const userPreferences = new UserPreferencesService();

// Auto-update existing layouts to use list view (one-time migration)
userPreferences.updateAllAreasToListView();

// React hooks for easier integration
import { useState, useEffect, useCallback } from 'react';

export function useTableLayout(tableId: string) {
  const [layout, setLayout] = useState<TableLayout>(() => 
    userPreferences.getTableLayout(tableId)
  );
  
  const [currentLayoutName, setCurrentLayoutName] = useState<string>(() => 
    userPreferences.getCurrentLayoutName(tableId)
  );

  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>(() => 
    userPreferences.getSavedLayouts(tableId)
  );

  // Sync with localStorage on component mount and when the component re-renders
  useEffect(() => {
    const loadedLayout = userPreferences.getTableLayout(tableId);
    const loadedLayoutName = userPreferences.getCurrentLayoutName(tableId);
    const loadedSavedLayouts = userPreferences.getSavedLayouts(tableId);
    
    setLayout(loadedLayout);
    setCurrentLayoutName(loadedLayoutName);
    setSavedLayouts(loadedSavedLayouts);
  }, [tableId]);

  const updateLayout = useCallback((updates: Partial<TableLayout>) => {
    setLayout(prevLayout => {
      const newLayout = { ...prevLayout, ...updates };
      userPreferences.autoSaveTableLayout(tableId, newLayout);
      return newLayout;
    });
  }, [tableId]);

  const saveLayoutAs = useCallback((layoutName: string) => {
    const layoutId = userPreferences.saveLayoutAs(tableId, layoutName);
    
    // Refresh state immediately
    const newLayout = userPreferences.getTableLayout(tableId);
    const newCurrentName = userPreferences.getCurrentLayoutName(tableId);
    const newSavedLayouts = userPreferences.getSavedLayouts(tableId);
    
    setLayout(newLayout);
    setCurrentLayoutName(newCurrentName);
    setSavedLayouts(newSavedLayouts);
    return layoutId;
  }, [tableId]);

  const loadLayout = useCallback((layoutId: string) => {
    // Test layouts with dramatic differences
    if (layoutId === 'test-minimal') {
      const testLayout = {
        id: 'test-minimal',
        name: 'Test Minimal',
        columnVisibility: { name: true, logoUrl: true },
        sorting: [],
        filters: [],
        columnOrder: [],
        isDefault: false
      };
      console.log('🧪 Loading MINIMAL test layout');
      setLayout(testLayout);
      setCurrentLayoutName('Test Minimal');
      return true;
    }
    
    if (layoutId === 'test-all') {
      const testLayout = {
        id: 'test-all',
        name: 'Test All',
        columnVisibility: { 
          name: true, logoUrl: true, type: true, company: true, 
          vatNumber: true, fiscalCode: true, address: true, email: true, phone: true 
        },
        sorting: [],
        filters: [],
        columnOrder: [],
        isDefault: false
      };
      console.log('🧪 Loading ALL COLUMNS test layout');
      setLayout(testLayout);
      setCurrentLayoutName('Test All');
      return true;
    }
    
    const success = userPreferences.loadLayout(tableId, layoutId);
    if (success) {
      // Force immediate state update
      const newLayout = userPreferences.getTableLayout(tableId);
      const newCurrentName = userPreferences.getCurrentLayoutName(tableId);
      const newSavedLayouts = userPreferences.getSavedLayouts(tableId);
      
      // Create completely new objects to force re-render
      setLayout({
        ...newLayout,
        columnVisibility: { ...newLayout.columnVisibility },
        filters: [...newLayout.filters],
        sorting: [...newLayout.sorting],
        columnOrder: [...newLayout.columnOrder]
      });
      setCurrentLayoutName(newCurrentName);
      setSavedLayouts(newSavedLayouts);
    }
    return success;
  }, [tableId]);

  const renameLayout = useCallback((layoutId: string, newName: string) => {
    const success = userPreferences.renameLayout(tableId, layoutId, newName);
    if (success) {
      setCurrentLayoutName(userPreferences.getCurrentLayoutName(tableId));
      setSavedLayouts(userPreferences.getSavedLayouts(tableId));
    }
    return success;
  }, [tableId]);

  const deleteLayout = useCallback((layoutId: string) => {
    const success = userPreferences.deleteLayout(tableId, layoutId);
    if (success) {
      setLayout(userPreferences.getTableLayout(tableId));
      setCurrentLayoutName(userPreferences.getCurrentLayoutName(tableId));
      setSavedLayouts(userPreferences.getSavedLayouts(tableId));
    }
    return success;
  }, [tableId]);

  const updateExistingLayout = useCallback((layoutId: string, newConfig: any) => {
    const success = userPreferences.updateLayout(tableId, layoutId, newConfig);
    if (success) {
      setLayout(userPreferences.getTableLayout(tableId));
      setCurrentLayoutName(userPreferences.getCurrentLayoutName(tableId));
      setSavedLayouts(userPreferences.getSavedLayouts(tableId));
    }
    return success;
  }, [tableId]);

  const resetLayout = useCallback(() => {
    userPreferences.resetTableLayout(tableId);
    setLayout(userPreferences.getTableLayout(tableId));
    setCurrentLayoutName(userPreferences.getCurrentLayoutName(tableId));
    setSavedLayouts(userPreferences.getSavedLayouts(tableId));
  }, [tableId]);

  return {
    layout,
    currentLayoutName,
    savedLayouts,
    updateLayout,
    saveLayoutAs,
    loadLayout,
    renameLayout,
    deleteLayout,
    updateExistingLayout,
    resetLayout,
  };
}