import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Code, BarChart3, FolderOpen, CheckSquare, Handshake, Building, Calendar, Clock, User, LogOut, FolderTree, Mail, DollarSign, Users, FileText, Server, Key, Shield, Wifi, Radar, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import newLogo from "@assets/thu solo logo_1757017376100.jpg";
import ImageContainer from "@/components/ui/image-container";

// Main navigation (Organizations già rimosso dalla lista principale)  
const getDefaultNavigation = (t: any) => [
  { id: "1", name: t("nav.projects"), href: "/projects", icon: FolderOpen, testId: "nav-projects" },
  { id: "2", name: t("nav.tasks"), href: "/tasks", icon: CheckSquare, testId: "nav-tasks" },
  { id: "3", name: t("nav.partners"), href: "/partners", icon: Handshake, testId: "nav-partners" },
  { id: "4", name: t("nav.salesOrders"), href: "/sales-orders", icon: FileText, testId: "nav-sales-orders" },
  { id: "5", name: t("nav.rateAgreements"), href: "/rate-agreements", icon: DollarSign, testId: "nav-rate-agreements" },
  { id: "6", name: t("nav.humanResources"), href: "/human-resources", icon: Users, testId: "nav-human-resources" },
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
      className="w-full p-2 rounded-md group flex items-center cursor-pointer transition-colors sidebar-nav-item text-muted-foreground hover:bg-muted/20"
      data-testid={item.testId}
      onClick={() => setLocation(item.href)}
    >
      <div 
        className="flex items-center px-3 py-2 rounded-full nav-box transition-colors flex-1" 
        style={{ 
          backgroundColor: isActive ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.1)', 
          border: '1px solid rgba(59, 130, 246, 0.2)', 
          minWidth: '240px', 
          maxWidth: '240px' 
        }}
      >
        <Icon className="h-5 w-5 flex-shrink-0 mr-3 text-muted-foreground" />
        <span className="text-base font-medium flex-1 text-muted-foreground">{item.name}</span>
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
        className="w-full p-2 rounded-md group flex items-center transition-colors sidebar-nav-item text-muted-foreground hover:bg-muted/20"
        data-testid={item.testId}
      >
        <div 
          className="flex items-center px-3 py-2 rounded-full nav-box transition-colors flex-1" 
          style={{ 
            backgroundColor: hasActiveChild ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.1)', 
            border: '1px solid rgba(59, 130, 246, 0.2)', 
            minWidth: '240px', 
            maxWidth: '240px' 
          }}
        >
          <Icon className="h-6 w-6 flex-shrink-0 mr-3 text-muted-foreground" />
          <span className="text-base font-medium flex-1 text-muted-foreground">{item.name}</span>
          <button 
            onClick={onToggle}
            className="ml-2 w-6 h-6 rounded-full border border-current hover:bg-white/20 transition-colors flex items-center justify-center"
            style={{ borderColor: 'rgba(59, 130, 246, 0.9)', color: 'rgba(59, 130, 246, 0.9)' }}
          >
            {isOpen ? (
              <Minus className="h-3 w-3" style={{ color: 'rgba(59, 130, 246, 0.9)' }} />
            ) : (
              <Plus className="h-3 w-3" style={{ color: 'rgba(59, 130, 246, 0.9)' }} />
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
    <div className="ml-4">
      <div className="w-full p-2 rounded-md group flex items-center transition-colors sidebar-nav-item text-muted-foreground hover:bg-muted/20">
        <button 
          className="flex items-center px-3 py-1 rounded-full nav-box transition-colors flex-1 cursor-pointer border-0 bg-transparent" 
          style={{ 
            backgroundColor: isActive ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.08)', 
            border: '1px solid rgba(59, 130, 246, 0.15)', 
            minWidth: '220px', 
            maxWidth: '220px' 
          }}
          onClick={() => {
            console.log('Child clicked:', item.name);
            onChildClick(); // Aggiorna il timestamp
            setLocation(item.href);
          }}
          data-testid={item.testId}
          type="button"
        >
          <Icon className="h-5 w-5 flex-shrink-0 mr-2 text-muted-foreground" />
          <span className="text-sm font-medium flex-1 text-muted-foreground text-left">{item.name}</span>
        </button>
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
  const [lastClickTime, setLastClickTime] = useState(0);

  // Funzione intelligente per il toggle che evita chiusure accidentali
  const handleToggle = (type: string) => {
    const now = Date.now();
    // Se l'ultimo click è stato meno di 100ms fa, ignora (probabilmente è un child click)
    if (now - lastClickTime < 100) {
      console.log('Ignoring toggle due to recent child click');
      return;
    }
    
    console.log('Executing toggle for:', type);
    setLastClickTime(now);
    
    if (type === 'systems') {
      setIsSystemsOpen(!isSystemsOpen);
    } else if (type === 'timeManagement') {
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
            const isOpen = isSystemsItem ? isSystemsOpen : (isTimeItem ? isTimeManagementOpen : false);
            
            // Check if any child is active
            const childItems = isSystemsItem ? systemsItems : timeManagementItems;
            const hasActiveChild = childItems.some((subItem: any) => location === subItem.href);
            
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
                              onChildClick={() => setLastClickTime(Date.now())}
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
