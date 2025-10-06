import React, { createContext, useContext, useState, useEffect } from "react";

// Tipi per il sistema di traduzioni
export type Language = "it" | "en";

export interface Translations {
  [key: string]: string | Translations;
}

export interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

// Context
const I18nContext = createContext<I18nContextType | undefined>(undefined);

// Hook per usare le traduzioni
export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used within I18nProvider");
  }
  return context;
}

// Traduzioni
const translations: Record<Language, Translations> = {
  it: {
    // Navigation
    nav: {
      dashboard: "Dashboard",
      projects: "Progetti", 
      tasks: "Attività",
      partners: "Partners",
      contacts: "Contatti",
      deals: "Affari",
      systems: "Sistemi",
      timeManagement: "Gestione Tempo",
      sapSystems: "Sistemi SAP",
      systemCredentials: "Credenziali Sistema",
      vpnConnections: "Connessioni VPN",
      vpnDiscovery: "Scoperta VPN",
      vpnSystems: "Sistemi VPN",
      timeEntries: "Ore Lavorate",
      timesheets: "Timesheet",
      calendar: "Calendario",
      globalCalendar: "Calendario Globale",
      messages: "Messaggi",
      proposals: "Proposte AI",
      organizations: "Organizzazioni",
      humanResources: "Risorse Umane",
      rateAgreements: "Accordi Tariffe",
      salesOrders: "Ordini Vendita",
      emailAccounts: "Account Email"
    },
    // Header
    header: {
      settings: "Impostazioni",
      profile: "Profilo",
      logout: "Esci",
      notifications: "Notifiche", 
      search: "Cerca",
      language: "Lingua"
    },
    // Common
    common: {
      save: "Salva",
      cancel: "Annulla",
      delete: "Elimina",
      edit: "Modifica",
      add: "Aggiungi",
      create: "Crea",
      update: "Aggiorna",
      confirm: "Conferma",
      yes: "Sì",
      no: "No",
      loading: "Caricamento...",
      error: "Errore",
      success: "Successo",
      warning: "Attenzione",
      info: "Informazione"
    }
  },
  en: {
    // Navigation  
    nav: {
      dashboard: "Dashboard",
      projects: "Projects",
      tasks: "Tasks", 
      partners: "Partners",
      contacts: "Contacts",
      deals: "Deals",
      systems: "Systems",
      timeManagement: "Time Management",
      sapSystems: "SAP Systems",
      systemCredentials: "System Credentials",
      vpnConnections: "VPN Connections", 
      vpnDiscovery: "VPN Discovery",
      vpnSystems: "VPN Systems",
      timeEntries: "Time Entries",
      timesheets: "Timesheets",
      calendar: "Calendar",
      globalCalendar: "Global Calendar",
      messages: "Messages",
      proposals: "AI Proposals",
      organizations: "Organizations",
      humanResources: "Human Resources",
      rateAgreements: "Rate Agreements",
      salesOrders: "Sales Orders",
      emailAccounts: "Email Accounts"
    },
    // Header
    header: {
      settings: "Settings",
      profile: "Profile", 
      logout: "Logout",
      notifications: "Notifications",
      search: "Search",
      language: "Language"
    },
    // Common
    common: {
      save: "Save",
      cancel: "Cancel",
      delete: "Delete",
      edit: "Edit",
      add: "Add", 
      create: "Create",
      update: "Update",
      confirm: "Confirm",
      yes: "Yes",
      no: "No",
      loading: "Loading...",
      error: "Error",
      success: "Success",
      warning: "Warning", 
      info: "Information"
    }
  }
};

// Provider
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem("preferred-language");
    return (stored as Language) || "it"; // Default italiano
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("preferred-language", lang);
  };

  // Funzione per ottenere la traduzione
  const t = (key: string, params?: Record<string, string>): string => {
    const keys = key.split(".");
    let value: any = translations[language];
    
    for (const k of keys) {
      value = value?.[k];
    }
    
    if (typeof value !== "string") {
      console.warn(`Translation missing for key: ${key}`);
      return key;
    }
    
    // Sostituisci parametri se presenti
    if (params) {
      return Object.entries(params).reduce((text, [param, replacement]) => {
        return text.replace(new RegExp(`{${param}}`, "g"), replacement);
      }, value);
    }
    
    return value;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}