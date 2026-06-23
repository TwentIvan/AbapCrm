import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Code, BarChart3, FolderOpen, CheckSquare, Handshake, Building, Calendar, Clock, User, LogOut, FolderTree, Mail, DollarSign, Users, FileText, Server, Key, Shield, Wifi, Radar, Plus, Minus, Settings, Sparkles, Contact, Network, GitBranch, LayoutDashboard, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import newLogo from "@assets/ChatGPT Image 18 ott 2025, 19_07_46_1760807285076.png";

// Anagrafiche direct items
const getDefaultAnagraficheDirectItems = (t: any) => [
  { id: "ana1", name: t("nav.partners"), href: "/partners", icon: Handshake, testId: "nav-partners" },
  { id: "ana2", name: "Risorse", href: "/human-resources", icon: Users, testId: "nav-human-resources" },
  { id: "ana3", name: "Catalogo Skills", href: "/skill-catalog", icon: FolderTree, testId: "nav-skill-catalog" },
];

// Systems group (nested under Anagrafiche)
const getDefaultSystemsItems = (t: any) => [
  { id: "s1", name: "SAP", href: "/sap-systems", icon: Server, testId: "nav-sap-systems" },
  { id: "s2", name: t("nav.vpnConnections"), href: "/vpn-connections", icon: Wifi, testId: "nav-vpn-connections" },
  { id: "s3", name: "Collegamenti Web", href: "/web-links", icon: GitBranch, testId: "nav-web-links" },
  { id: "s4", name: "Credenziali", href: "/system-credentials", icon: Key, testId: "nav-system-credentials" },
  { id: "s5", name: "Connection Workflows", href: "/connection-workflows", icon: GitBranch, testId: "nav-connection-workflows" },
];

// Progetti group (nested items)
const getDefaultProgettiItems = (t: any) => [
  { id: "prj1", name: "Anagrafica", href: "/projects", icon: FolderOpen, testId: "nav-projects" },
  { id: "prj2", name: "Milestones", href: "/project-milestones", icon: BarChart3, testId: "nav-project-milestones" },
  { id: "prj3", name: "Attività", href: "/tasks", icon: CheckSquare, testId: "nav-tasks" },
  { id: "prj4", name: "Assegnazioni", href: "/project-assignments", icon: Users, testId: "nav-project-assignments" },
  { id: "prj5", name: "Gerarchia", href: "/project-hierarchy", icon: FolderTree, testId: "nav-project-hierarchy" },
  { id: "prj6", name: "Resource Planner", href: "/resource-planner", icon: LayoutDashboard, testId: "nav-resource-planner" },
];

// Soluzioni group
const getDefaultSoluzioniItems = (t: any) => [
  { id: "sol1", name: "Elenco", href: "/sap-transport", icon: FolderTree, testId: "nav-solutions-list" },
  { id: "sol2", name: "Pacchetti", href: "/solution-packages", icon: Code, testId: "nav-solution-packages" },
];

// Vendita group
const getDefaultVenditaItems = (t: any) => [
  { id: "v1", name: t("nav.rateAgreements"), href: "/rate-agreements", icon: DollarSign, testId: "nav-rate-agreements" },
  { id: "v2", name: "Offerte", href: "/quotes", icon: FileText, testId: "nav-quotes" },
  { id: "v3", name: "Ordini di vendita", href: "/sales-orders", icon: FileText, testId: "nav-sales-orders" },
  { id: "v4", name: "Fatture", href: "/invoices", icon: FileText, testId: "nav-invoices" },
];

// Acquisti group
const getDefaultAcquistiItems = (t: any) => [
  { id: "a1", name: "Ordini d'acquisto", href: "/purchase-orders", icon: FileText, testId: "nav-purchase-orders" },
  { id: "a2", name: "Fatture fornitori", href: "/vendor-invoices", icon: FileText, testId: "nav-vendor-invoices" },
];

const getDefaultTimeManagementItems = (t: any) => [
  { id: "t1", name: t("nav.timeEntries"), href: "/timesheet", icon: Clock, testId: "nav-timesheet" },
  { id: "t2", name: t("nav.timesheets"), href: "/timesheets", icon: Clock, testId: "nav-timesheets" },
];

// AI Tools section (direct items)
const getDefaultAiToolsItems = (t: any) => [
  { id: "ai1", name: "AI Analytics", href: "/ai-analytics", icon: Brain, testId: "nav-ai-analytics" },
  { id: "ai2", name: "MCP Library", href: "/mcp-library", icon: Server, testId: "nav-mcp-library" },
];

// Parent sections
const getDefaultParentItems = (t: any) => [
  { id: "p0", name: "Anagrafiche", icon: Contact, testId: "nav-anagrafiche", type: "anagrafiche" },
  { id: "p5", name: "Progetti", icon: FolderOpen, testId: "nav-progetti", type: "progetti" },
  { id: "p3", name: "Soluzioni", icon: Radar, testId: "nav-soluzioni", type: "soluzioni" },
  { id: "p1", name: "Vendite", icon: DollarSign, testId: "nav-vendite", type: "vendita" },
  { id: "p2", name: "Acquisti", icon: FileText, testId: "nav-acquisti", type: "acquisti" },
  { id: "p4", name: t("nav.timeManagement"), icon: Clock, testId: "nav-time-management", type: "timeManagement" },
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
          "flex items-center gap-3 px-4 py-2 rounded-md nav-box transition-all duration-200",
          "bg-sidebar-accent dark:bg-sidebar-accent",
          isActive && "bg-sidebar-accent/80 dark:bg-sidebar-accent/80"
        )}
        style={{
          border: '2px solid rgba(30, 64, 175, 0.3)'
        }}
      >
        <div className="p-1.5 rounded-md" style={{ backgroundColor: 'rgba(30, 64, 175, 0.3)' }}>
          <Icon className="h-5 w-5 flex-shrink-0 text-primary" />
        </div>
        <span className={cn(
          "text-sm font-medium flex-1",
          isActive ? "text-primary" : "text-foreground"
        )}>{item.name}</span>
      </div>
    </div>
  );
}

// Simple Parent Item Component (with expand/collapse button)
function ParentItem({ item, children, isOpen, onToggle, hasActiveChild = false }: { item: any; children: React.ReactNode; isOpen: boolean; onToggle: () => void; hasActiveChild?: boolean }) {
  const Icon = item.icon;

  return (
    <>
      <div 
        className="w-full transition-all duration-200 sidebar-nav-item"
        data-testid={item.testId}
      >
        <div 
          className={cn(
            "flex items-center gap-3 h-10 px-4 rounded-md nav-box transition-all duration-200",
            "bg-sidebar-accent dark:bg-sidebar-accent",
            hasActiveChild && "bg-sidebar-accent/80 dark:bg-sidebar-accent/80"
          )}
          style={{
            border: '2px solid rgba(30, 64, 175, 0.3)'
          }}
        >
          <div className="p-1.5 rounded-md" style={{ backgroundColor: 'rgba(30, 64, 175, 0.3)' }}>
            <Icon className="h-5 w-5 flex-shrink-0 text-background" />
          </div>
          <span className={cn(
            "text-sm font-medium flex-1",
            hasActiveChild ? "text-primary" : "text-foreground"
          )}>{item.name}</span>
          <button 
            onClick={onToggle}
            className={cn(
              "ml-2 w-7 h-7 rounded-md hover:bg-sidebar-accent dark:hover:bg-sidebar-accent transition-colors flex items-center justify-center",
              "text-primary"
            )}
          >
            {isOpen ? (
              <Minus className="h-4 w-4 font-bold stroke-[2.5]" />
            ) : (
              <Plus className="h-4 w-4 font-bold stroke-[2.5]" />
            )}
          </button>
        </div>
      </div>
      {isOpen && <div className="mt-2 space-y-2">{children}</div>}
    </>
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
            "flex items-center gap-3 h-10 px-4 rounded-md nav-box transition-all duration-200",
            "bg-sidebar-accent dark:bg-sidebar-accent",
            isActive && "bg-sidebar-accent/80 dark:bg-sidebar-accent/80"
          )}
          style={{
            border: '2px solid rgba(30, 64, 175, 0.3)'
          }}
        >
          <div className="p-1.5 rounded-md" style={{ backgroundColor: 'rgba(30, 64, 175, 0.3)' }}>
            <Icon className="h-4 w-4 flex-shrink-0 text-background" />
          </div>
          <span className={cn(
            "text-sm font-medium flex-1",
            isActive ? "text-primary" : "text-foreground"
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
  const anagraficheDirectItems = getDefaultAnagraficheDirectItems(t);
  const progettiItems = getDefaultProgettiItems(t);
  const soluzioniItems = getDefaultSoluzioniItems(t);
  const venditaItems = getDefaultVenditaItems(t);
  const acquistiItems = getDefaultAcquistiItems(t);
  const systemsItems = getDefaultSystemsItems(t);
  const timeManagementItems = getDefaultTimeManagementItems(t);
  const parentItems = getDefaultParentItems(t);
  const aiToolsItems = getDefaultAiToolsItems(t);
  const [anagraficheManual, setAnagraficheManual] = useState<'open' | 'closed' | null>(null);
  const [progettiManual, setProgettiManual] = useState<'open' | 'closed' | null>(null);
  const [isSoluzioniOpen, setIsSoluzioniOpen] = useState(false);
  const [isVenditaOpen, setIsVenditaOpen] = useState(false);
  const [isAcquistiOpen, setIsAcquistiOpen] = useState(false);
  const [isTimeManagementOpen, setIsTimeManagementOpen] = useState(false);
  const [systemsManual, setSystemsManual] = useState<'open' | 'closed' | null>(null);
  
  // Auto-open parent menus when child is active
  const hasActiveAnagraficheDirectChild = anagraficheDirectItems.some((item: any) => location === item.href);
  const hasActiveSystemsChild = systemsItems.some((item: any) => location === item.href);
  const hasActiveBusinessScenariosChild = location === "/business-scenarios";
  const hasActiveAnagraficheChild = hasActiveAnagraficheDirectChild || hasActiveSystemsChild || hasActiveBusinessScenariosChild;
  const hasActiveProgettiChild = progettiItems.some((item: any) => location === item.href);
  const hasActiveSoluzioniChild = soluzioniItems.some((item: any) => location === item.href);
  const hasActiveVenditaChild = venditaItems.some((item: any) => location === item.href);
  const hasActiveAcquistiChild = acquistiItems.some((item: any) => location === item.href);
  const hasActiveTimeChild = timeManagementItems.some((item: any) => location === item.href);
  
  // Keep menus open if they have active children - with manual override
  const shouldAnagraficheBeOpen = anagraficheManual === 'open' || (anagraficheManual !== 'closed' && hasActiveAnagraficheChild);
  const shouldSystemsBeOpen = systemsManual === 'open' || (systemsManual !== 'closed' && hasActiveSystemsChild);
  const shouldProgettiBeOpen = progettiManual === 'open' || (progettiManual !== 'closed' && hasActiveProgettiChild);
  const shouldSoluzioniBeOpen = isSoluzioniOpen || hasActiveSoluzioniChild;
  const shouldVenditaBeOpen = isVenditaOpen || hasActiveVenditaChild;
  const shouldAcquistiBeOpen = isAcquistiOpen || hasActiveAcquistiChild;
  const shouldTimeManagementBeOpen = isTimeManagementOpen || hasActiveTimeChild;
  
  // Toggle function with manual override
  const handleToggle = (type: string) => {
    console.log('Executing toggle for:', type);
    
    if (type === 'anagrafiche') {
      setAnagraficheManual(shouldAnagraficheBeOpen ? 'closed' : 'open');
    } else if (type === 'systems') {
      setSystemsManual(shouldSystemsBeOpen ? 'closed' : 'open');
    } else if (type === 'progetti') {
      setProgettiManual(shouldProgettiBeOpen ? 'closed' : 'open');
    } else if (type === 'soluzioni') {
      setIsSoluzioniOpen(!isSoluzioniOpen);
    } else if (type === 'vendita') {
      setIsVenditaOpen(!isVenditaOpen);
    } else if (type === 'acquisti') {
      setIsAcquistiOpen(!isAcquistiOpen);
    } else if (type === 'timeManagement') {
      setIsTimeManagementOpen(!isTimeManagementOpen);
    }
  };

  return (
    <aside className="w-80 bg-card flex flex-col">
      {/* Logo Box - Same total height as both headers combined: py-2 + py-4 = py-6 */}
      <div className="px-6 py-6">
        <div className="flex justify-center items-center">
          <img
            src={newLogo}
            alt="App Logo"
            className="w-60 h-40 object-contain"
            data-testid="img-app-logo"
          />
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-4 pt-4 pb-4 space-y-2">
        {/* Anagrafiche Section (3 livelli: Anagrafiche > Partners/Risorse + Sistemi > SAP/VPN/Credenziali) */}
        <ParentItem
            item={{ id: "p0", name: "Anagrafiche", icon: Contact, testId: "nav-anagrafiche", type: "anagrafiche" }}
            isOpen={shouldAnagraficheBeOpen}
            hasActiveChild={hasActiveAnagraficheChild}
            onToggle={() => handleToggle('anagrafiche')}
          >
            {/* Direct items: Partners e Risorse */}
            {anagraficheDirectItems.map((childItem: any) => {
              const isChildActive = location === childItem.href;
              return (
                <SubNavItem 
                  key={childItem.id} 
                  item={childItem} 
                  isActive={isChildActive}
                  onChildClick={() => {}}
                />
              );
            })}
            
            {/* Nested Sistemi section */}
            <div className="ml-4">
              <ParentItem
                item={{ id: "p-systems", name: "Sistemi", icon: Shield, testId: "nav-systems-nested", type: "systems" }}
                isOpen={shouldSystemsBeOpen}
                hasActiveChild={hasActiveSystemsChild}
                onToggle={() => handleToggle('systems')}
              >
                {systemsItems.map((sysItem: any) => {
                  const isSysActive = location === sysItem.href;
                  return (
                    <SubNavItem 
                      key={sysItem.id} 
                      item={sysItem} 
                      isActive={isSysActive}
                      onChildClick={() => {}}
                    />
                  );
                })}
              </ParentItem>
            </div>
            
            {/* Scenari di Business - allo stesso livello di Sistemi */}
            <SubNavItem 
              item={{ id: "bs1", name: "Scenari di Business", href: "/business-scenarios", icon: Network, testId: "nav-business-scenarios" }} 
              isActive={location === "/business-scenarios"}
              onChildClick={() => {}}
            />
          </ParentItem>
        
        {/* Altri Parent Sections (Progetti, Soluzioni, Vendite, Acquisti, Time Management) */}
          {parentItems.map((item: any) => {
            const isAnagraficheItem = item.type === 'anagrafiche';
            const isProgettiItem = item.type === 'progetti';
            const isSoluzioniItem = item.type === 'soluzioni';
            const isVenditaItem = item.type === 'vendita';
            const isAcquistiItem = item.type === 'acquisti';
            const isTimeItem = item.type === 'timeManagement';
            
            // Saltare Anagrafiche già renderizzata sopra
            if (isAnagraficheItem) {
              return null;
            }
            
            let isOpen = false;
            let hasActiveChild = false;
            let childItems: any[] = [];
            
            if (isProgettiItem) {
              isOpen = shouldProgettiBeOpen;
              hasActiveChild = hasActiveProgettiChild;
              childItems = progettiItems;
            } else if (isSoluzioniItem) {
              isOpen = shouldSoluzioniBeOpen;
              hasActiveChild = hasActiveSoluzioniChild;
              childItems = soluzioniItems;
            } else if (isVenditaItem) {
              isOpen = shouldVenditaBeOpen;
              hasActiveChild = hasActiveVenditaChild;
              childItems = venditaItems;
            } else if (isAcquistiItem) {
              isOpen = shouldAcquistiBeOpen;
              hasActiveChild = hasActiveAcquistiChild;
              childItems = acquistiItems;
            } else if (isTimeItem) {
              isOpen = shouldTimeManagementBeOpen;
              hasActiveChild = hasActiveTimeChild;
              childItems = timeManagementItems;
            }
            
            return (
              <ParentItem
                key={item.id}
                item={item}
                isOpen={isOpen}
                hasActiveChild={hasActiveChild}
                onToggle={() => handleToggle(item.type)}
              >
                {childItems.map((subItem: any) => {
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
              </ParentItem>
            );
          })}
      </nav>

      {/* AI Tools section */}
      <div className="px-4 pb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
          AI
        </p>
        {aiToolsItems.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            isActive={location === item.href}
          />
        ))}
      </div>

      {/* User Profile */}
      <div className="p-6 border-t border-border">
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
