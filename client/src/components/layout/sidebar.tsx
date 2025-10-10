import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Code, BarChart3, FolderOpen, CheckSquare, Handshake, Building, Calendar, Clock, User, LogOut, FolderTree, Mail, DollarSign, Users, FileText, Server, Key, Shield, Wifi, Radar, Plus, Minus, Settings, Sparkles, Contact } from "lucide-react";
import { cn } from "@/lib/utils";
import newLogo from "@assets/thu solo logo_1757017376100.jpg";
import ImageContainer from "@/components/ui/image-container";

// Main navigation (Organizations già rimosso dalla lista principale)  
const getDefaultNavigation = (t: any) => [
  { id: "1", name: t("nav.projects"), href: "/projects", icon: FolderOpen, testId: "nav-projects" },
  { id: "2", name: t("nav.tasks"), href: "/tasks", icon: CheckSquare, testId: "nav-tasks" },
  { id: "3", name: t("nav.partners"), href: "/partners", icon: Handshake, testId: "nav-partners" },
  { id: "3b", name: t("nav.contacts"), href: "/contacts", icon: Contact, testId: "nav-contacts" },
  { id: "4", name: t("nav.messages"), href: "/messages", icon: Mail, testId: "nav-messages" },
  { id: "5", name: t("nav.proposals"), href: "/proposals", icon: Sparkles, testId: "nav-proposals" },
  { id: "6", name: t("nav.salesOrders"), href: "/sales-orders", icon: FileText, testId: "nav-sales-orders" },
  { id: "7", name: t("nav.rateAgreements"), href: "/rate-agreements", icon: DollarSign, testId: "nav-rate-agreements" },
  { id: "8", name: t("nav.humanResources"), href: "/human-resources", icon: Users, testId: "nav-human-resources" },
];

// Systems group
const getDefaultSystemsItems = (t: any) => [
  { id: "s1", name: t("nav.sapSystems"), href: "/sap-systems", icon: Server, testId: "nav-sap-systems" },
  { id: "s2", name: t("nav.vpnConnections"), href: "/vpn-connections", icon: Wifi, testId: "nav-vpn-connections" },
  { id: "s3", name: t("nav.systemCredentials"), href: "/system-credentials", icon: Key, testId: "nav-system-credentials" },
];

const getDefaultTimeManagementItems = (t: any) => [
  { id: "t1", name: t("nav.timeEntries"), href: "/timesheet", icon: Clock, testId: "nav-timesheet" },
  { id: "t2", name: t("nav.timesheets"), href: "/timesheets", icon: Clock, testId: "nav-timesheets" },
];

// Parent sections
const getDefaultParentItems = (t: any) => [
  { id: "p1", name: t("nav.systems"), icon: Shield, testId: "nav-systems", type: "systems" },
  { id: "p2", name: t("nav.timeManagement"), icon: Clock, testId: "nav-time-management", type: "timeManagement" },
];

// Simple Navigation Item Component
function NavItem({ item, isActive }: { item: any; isActive: boolean }) {
  const [, setLocation] = useLocation();
  const Icon = item.icon;

  return (
    <div 
      className="w-full cursor-pointer transition-all duration-200 sidebar-nav-item"
      data-testid={item.testId}
      onClick={() => setLocation(item.href)}
    >
      <div 
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl nav-box transition-all duration-200",
          "bg-white dark:bg-gray-800 shadow-sm hover:shadow-md",
          isActive && "bg-blue-50 dark:bg-blue-900/30"
        )}
      >
        <div className={cn(
          "p-2 rounded-lg transition-colors",
          isActive ? "bg-blue-500" : "bg-blue-400"
        )}>
          <Icon className="h-5 w-5 flex-shrink-0 text-white" />
        </div>
        <span className={cn(
          "text-sm font-medium flex-1",
          isActive ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"
        )}>{item.name}</span>
      </div>
    </div>
  );
}

// Simple Parent Item Component (with expand/collapse button)
function ParentItem({ item, children, isOpen, onToggle, hasActiveChild = false }: { item: any; children: React.ReactNode; isOpen: boolean; onToggle: () => void; hasActiveChild?: boolean }) {
  const Icon = item.icon;

  return (
    <div className="space-y-1">
      <div 
        className="w-full transition-all duration-200 sidebar-nav-item"
        data-testid={item.testId}
      >
        <div 
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl nav-box transition-all duration-200",
            "bg-white dark:bg-gray-800 shadow-sm hover:shadow-md",
            hasActiveChild && "bg-blue-50 dark:bg-blue-900/30"
          )}
        >
          <div className={cn(
            "p-2 rounded-lg transition-colors",
            hasActiveChild ? "bg-blue-500" : "bg-blue-400"
          )}>
            <Icon className="h-5 w-5 flex-shrink-0 text-white" />
          </div>
          <span className={cn(
            "text-sm font-medium flex-1",
            hasActiveChild ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"
          )}>{item.name}</span>
          <button 
            onClick={onToggle}
            className={cn(
              "ml-2 w-6 h-6 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-center",
              "text-blue-500 dark:text-blue-400"
            )}
          >
            {isOpen ? (
              <Minus className="h-3 w-3" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>
      {isOpen && children}
    </div>
  );
}

// Simple Sub-Navigation Item Component (smaller)
function SubNavItem({ item, isActive, onChildClick }: { item: any; isActive: boolean; onChildClick: () => void }) {
  const [, setLocation] = useLocation();
  const Icon = item.icon;

  return (
    <div className="ml-6">
      <div 
        className="w-full cursor-pointer transition-all duration-200 sidebar-nav-item"
        onClick={() => {
          console.log('Child clicked:', item.name);
          setLocation(item.href);
        }}
        data-testid={item.testId}
      >
        <div 
          className={cn(
            "flex items-center gap-3 px-4 py-2.5 rounded-xl nav-box transition-all duration-200",
            "bg-white dark:bg-gray-800 shadow-sm hover:shadow-md",
            isActive && "bg-blue-50 dark:bg-blue-900/30"
          )}
        >
          <div className={cn(
            "p-1.5 rounded-lg transition-colors",
            isActive ? "bg-blue-500" : "bg-blue-400"
          )}>
            <Icon className="h-4 w-4 flex-shrink-0 text-white" />
          </div>
          <span className={cn(
            "text-sm font-medium flex-1",
            isActive ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"
          )}>{item.name}</span>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const { t } = useTranslation();
  const navigation = getDefaultNavigation(t);
  const systemsItems = getDefaultSystemsItems(t);
  const timeManagementItems = getDefaultTimeManagementItems(t);
  const parentItems = getDefaultParentItems(t);
  const [isTimeManagementOpen, setIsTimeManagementOpen] = useState(false);
  const [isSystemsOpen, setIsSystemsOpen] = useState(false);
  
  // Auto-open parent menus when child is active
  const hasActiveSystemsChild = systemsItems.some((item: any) => location === item.href);
  const hasActiveTimeChild = timeManagementItems.some((item: any) => location === item.href);
  
  // Keep menus open if they have active children
  const shouldSystemsBeOpen = isSystemsOpen || hasActiveSystemsChild;
  const shouldTimeManagementBeOpen = isTimeManagementOpen || hasActiveTimeChild;
  // Semplice funzione di toggle - chiude solo se non ci sono figli attivi
  const handleToggle = (type: string) => {
    console.log('Executing toggle for:', type);
    
    if (type === 'systems') {
      // Non chiudere se c'è un figlio attivo
      if (hasActiveSystemsChild && isSystemsOpen) {
        console.log('Preventing systems close - has active child');
        return;
      }
      setIsSystemsOpen(!isSystemsOpen);
    } else if (type === 'timeManagement') {
      // Non chiudere se c'è un figlio attivo
      if (hasActiveTimeChild && isTimeManagementOpen) {
        console.log('Preventing timeManagement close - has active child');
        return;
      }
      setIsTimeManagementOpen(!isTimeManagementOpen);
    }
  };

  return (
    <aside className="w-80 bg-card border-r border-border flex flex-col">
      {/* Logo and Brand */}
      <div className="p-6 border-b border-border">
        <div className="flex justify-center">
          <ImageContainer
            src={newLogo}
            alt="App Logo"
            fallbackType="logo"
            size="custom"
            containerClassName="w-64 h-44 bg-transparent"
            className="object-contain"
            data-testid="img-app-logo"
          />
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-2">
        {/* Main Navigation */}
        {navigation.map((item: any) => {
          const isActive = location === item.href;
          return (
            <NavItem key={item.id} item={item} isActive={isActive} />
          );
        })}
        
        {/* Parent Sections (Systems & Time Management) */}
        <div>
          {parentItems.map((item: any) => {
            const isSystemsItem = item.type === 'systems';
            const isTimeItem = item.type === 'timeManagement';
            const isOpen = isSystemsItem ? shouldSystemsBeOpen : (isTimeItem ? shouldTimeManagementBeOpen : false);
            
            // Check if any child is active  
            const hasActiveChild = isSystemsItem ? hasActiveSystemsChild : hasActiveTimeChild;
            
            return (
              <div key={item.id}>
                <ParentItem
                  item={item}
                  isOpen={isOpen}
                  hasActiveChild={hasActiveChild}
                  onToggle={() => handleToggle(item.type)}
                  children={
                    isOpen && (
                      <div className="space-y-1">
                        {(isSystemsItem ? systemsItems : timeManagementItems).map((subItem: any) => {
                          const isActive = location === subItem.href;
                          return (
                            <SubNavItem 
                              key={subItem.id} 
                              item={subItem} 
                              isActive={isActive} 
                              onChildClick={() => {}}
                            />
                          );
                        })}
                      </div>
                    )
                  }
                />
              </div>
            );
          })}
        </div>
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center space-x-3 p-3 rounded-md hover:bg-accent transition-colors">
          <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate" data-testid="text-user-name">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-muted-foreground truncate" data-testid="text-user-email">
              {user?.email}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logoutMutation.mutate()}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
