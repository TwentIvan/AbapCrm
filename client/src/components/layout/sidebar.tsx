import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Code, BarChart3, FolderOpen, CheckSquare, Handshake, Building, Calendar, Clock, User, LogOut, FolderTree, Mail, DollarSign, Users, FileText, Server, Key, Shield, Wifi, Radar, Plus, Minus, Settings, Sparkles, Contact, Network, GitBranch, LayoutDashboard, Brain, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import htuLogo from "@assets/HTU-logo-512_(1)_1782240207188.png";

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

function NavItem({ item, isActive }: { item: any; isActive: boolean }) {
  const [, setLocation] = useLocation();
  const Icon = item.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      data-testid={item.testId}
      onClick={() => setLocation(item.href)}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="text-sm font-medium">{item.name}</span>
    </div>
  );
}

function ParentItem({ item, children, isOpen, onToggle, hasActiveChild = false }: { item: any; children: React.ReactNode; isOpen: boolean; onToggle: () => void; hasActiveChild?: boolean }) {
  const Icon = item.icon;

  return (
    <div>
      <button
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
          hasActiveChild
            ? "text-primary"
            : "text-foreground hover:bg-muted"
        )}
        onClick={onToggle}
        data-testid={item.testId}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm font-semibold flex-1 text-left">{item.name}</span>
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {isOpen && <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-3">{children}</div>}
    </div>
  );
}

function SubNavItem({ item, isActive, onChildClick }: { item: any; isActive: boolean; onChildClick: () => void }) {
  const [, setLocation] = useLocation();
  const Icon = item.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-1.5 rounded-md cursor-pointer transition-colors",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      onClick={() => setLocation(item.href)}
      data-testid={item.testId}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="text-sm">{item.name}</span>
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

  const hasActiveAnagraficheDirectChild = anagraficheDirectItems.some((item: any) => location === item.href);
  const hasActiveSystemsChild = systemsItems.some((item: any) => location === item.href);
  const hasActiveBusinessScenariosChild = location === "/business-scenarios";
  const hasActiveAnagraficheChild = hasActiveAnagraficheDirectChild || hasActiveSystemsChild || hasActiveBusinessScenariosChild;
  const hasActiveProgettiChild = progettiItems.some((item: any) => location === item.href);
  const hasActiveSoluzioniChild = soluzioniItems.some((item: any) => location === item.href);
  const hasActiveVenditaChild = venditaItems.some((item: any) => location === item.href);
  const hasActiveAcquistiChild = acquistiItems.some((item: any) => location === item.href);
  const hasActiveTimeChild = timeManagementItems.some((item: any) => location === item.href);

  const shouldAnagraficheBeOpen = anagraficheManual === 'open' || (anagraficheManual !== 'closed' && hasActiveAnagraficheChild);
  const shouldSystemsBeOpen = systemsManual === 'open' || (systemsManual !== 'closed' && hasActiveSystemsChild);
  const shouldProgettiBeOpen = progettiManual === 'open' || (progettiManual !== 'closed' && hasActiveProgettiChild);
  const shouldSoluzioniBeOpen = isSoluzioniOpen || hasActiveSoluzioniChild;
  const shouldVenditaBeOpen = isVenditaOpen || hasActiveVenditaChild;
  const shouldAcquistiBeOpen = isAcquistiOpen || hasActiveAcquistiChild;
  const shouldTimeManagementBeOpen = isTimeManagementOpen || hasActiveTimeChild;

  const handleToggle = (type: string) => {
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
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5">
        <img
          src={htuLogo}
          alt="HTU Logo"
          className="h-16 object-contain"
          data-testid="img-app-logo"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pb-4 space-y-1 overflow-y-auto">
        {/* Anagrafiche */}
        <ParentItem
          item={{ id: "p0", name: "Anagrafiche", icon: Contact, testId: "nav-anagrafiche", type: "anagrafiche" }}
          isOpen={shouldAnagraficheBeOpen}
          hasActiveChild={hasActiveAnagraficheChild}
          onToggle={() => handleToggle('anagrafiche')}
        >
          {anagraficheDirectItems.map((childItem: any) => (
            <SubNavItem
              key={childItem.id}
              item={childItem}
              isActive={location === childItem.href}
              onChildClick={() => {}}
            />
          ))}

          <ParentItem
            item={{ id: "p-systems", name: "Sistemi", icon: Shield, testId: "nav-systems-nested", type: "systems" }}
            isOpen={shouldSystemsBeOpen}
            hasActiveChild={hasActiveSystemsChild}
            onToggle={() => handleToggle('systems')}
          >
            {systemsItems.map((sysItem: any) => (
              <SubNavItem
                key={sysItem.id}
                item={sysItem}
                isActive={location === sysItem.href}
                onChildClick={() => {}}
              />
            ))}
          </ParentItem>

          <SubNavItem
            item={{ id: "bs1", name: "Scenari di Business", href: "/business-scenarios", icon: Network, testId: "nav-business-scenarios" }}
            isActive={location === "/business-scenarios"}
            onChildClick={() => {}}
          />
        </ParentItem>

        {/* Other sections */}
        {parentItems.map((item: any) => {
          if (item.type === 'anagrafiche') return null;

          let isOpen = false;
          let hasActiveChild = false;
          let childItems: any[] = [];

          if (item.type === 'progetti') {
            isOpen = shouldProgettiBeOpen;
            hasActiveChild = hasActiveProgettiChild;
            childItems = progettiItems;
          } else if (item.type === 'soluzioni') {
            isOpen = shouldSoluzioniBeOpen;
            hasActiveChild = hasActiveSoluzioniChild;
            childItems = soluzioniItems;
          } else if (item.type === 'vendita') {
            isOpen = shouldVenditaBeOpen;
            hasActiveChild = hasActiveVenditaChild;
            childItems = venditaItems;
          } else if (item.type === 'acquisti') {
            isOpen = shouldAcquistiBeOpen;
            hasActiveChild = hasActiveAcquistiChild;
            childItems = acquistiItems;
          } else if (item.type === 'timeManagement') {
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
              {childItems.map((subItem: any) => (
                <SubNavItem
                  key={subItem.id}
                  item={subItem}
                  isActive={location === subItem.href}
                  onChildClick={() => {}}
                />
              ))}
            </ParentItem>
          );
        })}

        {/* AI Section */}
        <div className="pt-4 mt-4 border-t border-border">
          <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
      </nav>

      {/* User */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
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
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => logoutMutation.mutate()}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
