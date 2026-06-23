import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Search, Mail, Calendar, FolderTree, Building, User, ChevronDown, Check, Users, X, FolderOpen, CheckSquare, Handshake, FileText, DollarSign, Server, Key, Wifi, Clock, Settings, LogOut, Globe, Eye, Sparkles, Plus, ShieldAlert } from "lucide-react";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/contexts/organization-context";
import { useTranslation, Language } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import htuLogo from "@assets/ChatGPT Image 17 ott 2025, 22_22_58_1760756212877.png";

interface HeaderProps {
  title: string;
  subtitle: string;
  onNewClick?: () => void; // Opzionale ora che non c'è più il pulsante New
}

export default function Header({ title, subtitle, onNewClick }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const { organizations, currentOrganization, switchOrganization, personalScope, setPersonalScope, isPersonalOrg } = useOrganization();
  const { language, setLanguage, t } = useTranslation();

  const userInitials = user?.firstName && user?.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}` 
    : user?.username?.[0]?.toUpperCase() || "U";

  // Query per conteggio messaggi non letti
  const { data: unreadMessages } = useQuery<{ count: number }>({
    queryKey: ['/api/messages/unread-count'],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganization,
  });

  // Query per conteggio proposte in sospeso
  const { data: pendingProposals } = useQuery<{ count: number }>({
    queryKey: ['/api/proposals/pending-count'],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganization,
  });

  // Query per conteggio approvazioni MCP in sospeso (Phase 4)
  const { data: pendingApprovals } = useQuery<{ count: number }>({
    queryKey: ['/api/mcp/pending-actions/count'],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganization,
    refetchInterval: 10000,
  });

  // Query per partner associato all'organizzazione corrente
  const { data: orgPartner } = useQuery<{ id: string; name: string; logoUrl?: string | null }>({
    queryKey: ['/api/partners', currentOrganization?.partnerId],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganization?.partnerId,
  });

  // Mappatura route -> icona per l'area corrente
  const getAreaIcon = (path: string) => {
    const routeIconMap: { [key: string]: any } = {
      '/': Building,
      '/organizations': Building,
      '/projects': FolderOpen,
      '/tasks': CheckSquare,
      '/partners': Handshake,
      '/calendar': Calendar,
      '/planning-calendar': Calendar,
      '/timesheet': Clock,
      '/timesheets': Clock,
      '/messages': Mail,
      '/rate-agreements': DollarSign,
      '/human-resources': Users,
      '/sales-orders': FileText,
      '/sap-systems': Server,
      '/system-credentials': Key,
      '/vpn-connections': Wifi,
    };
    
    return routeIconMap[path] || Building; // Default a Building se non trovato
  };

  const AreaIcon = getAreaIcon(location);

  // Helper function per calcolare lo spostamento di ogni button in base al hover
  const getButtonTransform = (buttonId: string, hoveredId: string | null) => {
    if (!hoveredId) return 'translateX(0)';
    
    const buttons = ['proposals', 'messages', 'calendar', 'planning', 'partners'];
    const currentIndex = buttons.indexOf(buttonId);
    const hoveredIndex = buttons.indexOf(hoveredId);
    
    // Se il button corrente è quello in hover, non si sposta
    if (currentIndex === hoveredIndex) return 'translateX(0)';
    
    // Se il button corrente è a sinistra di quello in hover, si sposta a sinistra
    if (currentIndex < hoveredIndex) {
      // Diminuito ancora per distanza perfetta
      return 'translateX(-6px)'; 
    }
    
    return 'translateX(0)';
  };

  // Helper function per lo stile di ogni button
  const getButtonStyle = (buttonId: string, hoveredId: string | null) => {
    const isHovered = buttonId === hoveredId;
    return {
      borderRadius: '0.5rem',
      width: isHovered ? 'auto' : '3.5rem',
      height: '3.5rem',
      minWidth: isHovered ? '200px' : '3.5rem',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      transform: getButtonTransform(buttonId, hoveredId),
      overflow: 'hidden',
      paddingLeft: isHovered ? '1rem' : undefined,
      paddingRight: isHovered ? '1rem' : undefined,
      justifyContent: isHovered ? ('flex-start' as const) : ('center' as const),
      position: 'relative' as const,
      zIndex: isHovered ? 10 : 1,
    };
  };

  return (
    <header className="bg-card sticky top-0 z-10">
      {/* Unified Header with Logo Pattern Background */}
      <div className="px-6 pt-2 pb-8 relative overflow-hidden">
        
        
        {/* Content above background */}
        <div className="relative z-10 flex items-center justify-between w-full">
        <div className="flex items-stretch space-x-4">
          <div 
            className="flex items-center space-x-3 px-4 py-2 bg-sidebar-accent rounded-lg"
            style={{
              border: '2px solid rgba(30, 64, 175, 0.3)'
            }}
          >
            <AreaIcon className="text-muted-foreground flex-shrink-0" style={{ width: '2rem', height: '2rem' }} />
            <div className="flex flex-col overflow-visible">
              <h2 className="text-lg font-semibold text-muted-foreground" style={{ whiteSpace: 'nowrap', overflow: 'visible' }} data-testid="text-page-title">
                {title}
              </h2>
              <p className="text-sm text-muted-foreground" style={{ whiteSpace: 'nowrap', overflow: 'visible' }} data-testid="text-page-subtitle">
                {subtitle}
              </p>
            </div>
          </div>
          
          <div 
            className="flex items-center px-4 py-2 bg-sidebar-accent cursor-pointer rounded-lg"
            onClick={() => !isSearchOpen && setIsSearchOpen(true)}
            data-testid="button-search"
            style={{ 
              border: '2px solid rgba(30, 64, 175, 0.3)',
              width: isSearchOpen ? '300px' : 'auto'
            }}
          >
            {!isSearchOpen ? (
              <>
                <Search className="h-8 w-8 text-muted-foreground flex-shrink-0" style={{ width: '2.25rem', height: '2.25rem', transform: 'scaleX(-1) translateX(-0.5rem)' }} />
                <div className="min-w-0 opacity-0 pointer-events-none">
                  <h2 className="text-lg font-semibold truncate">A</h2>
                  <p className="text-sm truncate">B</p>
                </div>
              </>
            ) : (
              <>
                <button
                  className="w-8 h-8 mr-3 rounded hover:bg-primary/10 text-foreground transition-colors flex items-center justify-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSearchQuery("");
                    setIsSearchOpen(false);
                  }}
                >
                  <X className="h-8 w-8 text-muted-foreground" />
                </button>
                <input
                  type="text"
                  placeholder={`Cerca in ${title}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 border-0 bg-transparent focus:ring-0 focus:outline-0 text-sm px-0 text-foreground placeholder:text-muted-foreground"
                  data-testid="input-search"
                  autoFocus
                  onBlur={() => !searchQuery && setIsSearchOpen(false)}
                />
                <button
                  className="w-8 h-8 ml-2 rounded hover:bg-primary/10 text-foreground transition-colors flex items-center justify-center bg-primary/10 hover:bg-primary/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    // TODO: implementare ricerca globale
                  }}
                >
                  <Globe className="h-8 w-8 text-muted-foreground" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <TooltipProvider delayDuration={300}>
            <Link href="/proposals">
              <Button 
                variant="ghost" 
                className="flex items-center bg-sidebar-accent relative"
                style={{
                  ...getButtonStyle('proposals', hoveredButton),
                  border: '2px solid rgba(30, 64, 175, 0.3)'
                }}
                onMouseEnter={() => setHoveredButton('proposals')}
                onMouseLeave={() => setHoveredButton(null)}
                data-testid="button-proposals"
              >
                <div className="relative flex flex-col items-end">
                  <div className="flex items-baseline space-x-0">
                    <span className="text-lg font-black text-primary">T</span>
                    <span className="text-2xl font-black text-primary">H</span>
                    <span className="text-2xl font-black text-primary">U</span>
                  </div>
                  <span className="text-xs font-bold text-purple-500 dark:text-purple-400 -mt-1">AI</span>
                  {(pendingProposals?.count ?? 0) > 0 && (
                    <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {(pendingProposals?.count ?? 0) > 9 ? '9+' : pendingProposals?.count}
                    </span>
                  )}
                </div>
                {hoveredButton === 'proposals' && (
                  <span className="ml-3 text-foreground font-medium whitespace-nowrap">
                    Proposte AI
                  </span>
                )}
              </Button>
            </Link>

            {/* Phase 4: MCP pending approvals badge */}
            {(pendingApprovals?.count ?? 0) > 0 && (
              <Link href="/mcp-library">
                <Button
                  variant="ghost"
                  className="flex items-center bg-warning/10 dark:bg-amber-950/30 relative"
                  style={{ border: '2px solid rgba(245, 158, 11, 0.4)' }}
                  data-testid="button-pending-approvals"
                >
                  <div className="relative">
                    <ShieldAlert className="h-6 w-6 text-warning" />
                    <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                      {(pendingApprovals?.count ?? 0) > 9 ? '9+' : pendingApprovals?.count}
                    </span>
                  </div>
                  <span className="ml-2 text-warning dark:text-amber-400 font-medium text-xs whitespace-nowrap">
                    Approvazioni
                  </span>
                </Button>
              </Link>
            )}

            <Link href="/messages">
              <Button 
                variant="ghost" 
                className="flex items-center bg-sidebar-accent relative"
                style={{
                  ...getButtonStyle('messages', hoveredButton),
                  border: '2px solid rgba(30, 64, 175, 0.3)'
                }}
                onMouseEnter={() => setHoveredButton('messages')}
                onMouseLeave={() => setHoveredButton(null)}
                data-testid="button-messages"
              >
                <div className="relative">
                  <Mail className="flex-shrink-0" style={{ width: '2rem', height: '2rem', color: '#6b7280' }} />
                  {(unreadMessages?.count ?? 0) > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {(unreadMessages?.count ?? 0) > 9 ? '9+' : unreadMessages?.count}
                    </span>
                  )}
                </div>
                {hoveredButton === 'messages' && (
                  <span className="ml-3 text-foreground font-medium whitespace-nowrap">
                    {t("nav.messages")}
                  </span>
                )}
              </Button>
            </Link>
            
            <Link href="/calendar">
              <Button 
                variant="ghost" 
                className="flex items-center bg-sidebar-accent"
                style={{
                  ...getButtonStyle('calendar', hoveredButton),
                  border: '2px solid rgba(30, 64, 175, 0.3)'
                }}
                onMouseEnter={() => setHoveredButton('calendar')}
                onMouseLeave={() => setHoveredButton(null)}
                data-testid="button-calendar"
              >
                <Calendar className="flex-shrink-0" style={{ width: '2rem', height: '2rem', color: '#6b7280' }} />
                {hoveredButton === 'calendar' && (
                  <span className="ml-3 text-foreground font-medium whitespace-nowrap">
                    Calendario Eventi
                  </span>
                )}
              </Button>
            </Link>
            
            <Link href="/planning-calendar">
              <Button 
                variant="ghost" 
                className="flex items-center bg-sidebar-accent"
                style={{
                  ...getButtonStyle('planning', hoveredButton),
                  border: '2px solid rgba(30, 64, 175, 0.3)'
                }}
                onMouseEnter={() => setHoveredButton('planning')}
                onMouseLeave={() => setHoveredButton(null)}
                data-testid="button-planning-calendar"
              >
                <FolderTree className="flex-shrink-0" style={{ width: '2rem', height: '2rem', color: '#6b7280' }} />
                {hoveredButton === 'planning' && (
                  <span className="ml-3 text-foreground font-medium whitespace-nowrap">
                    Pianificazione Progetti
                  </span>
                )}
              </Button>
            </Link>
          </TooltipProvider>

          <TooltipProvider delayDuration={300}>
            <Link href="/partners">
              <Button 
                variant="ghost" 
                className="flex items-center bg-sidebar-accent"
                style={{
                  ...getButtonStyle('partners', hoveredButton),
                  border: '2px solid rgba(30, 64, 175, 0.3)'
                }}
                onMouseEnter={() => setHoveredButton('partners')}
                onMouseLeave={() => setHoveredButton(null)}
                data-testid="button-partners"
              >
                <Users className="flex-shrink-0" style={{ width: '2rem', height: '2rem', color: '#6b7280' }} />
                {hoveredButton === 'partners' && (
                  <span className="ml-3 text-foreground font-medium whitespace-nowrap">
                    Contatti
                  </span>
                )}
              </Button>
            </Link>
          </TooltipProvider>
          
          
          {user && (
            <div 
              className="relative rounded-lg px-4 py-2 flex items-center space-x-4 bg-sidebar-accent transition-all duration-200"
              style={{
                border: '2px solid rgba(30, 64, 175, 0.3)'
              }}
            >
              {/* Language Selector - Bandiera Flat */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-14 h-14 rounded-lg bg-background border border-border hover:bg-accent flex-shrink-0 p-0 overflow-hidden" 
                    data-testid="button-language-flag"
                  >
                    {language === "it" ? (
                      <div 
                        className="w-12 h-12 rounded-md"
                        style={{
                          background: 'linear-gradient(to right, #009246 33%, #FFFFFF 33%, #FFFFFF 67%, #CE2B37 67%)'
                        }}
                      />
                    ) : (
                      <div 
                        className="w-12 h-12 rounded-md bg-cover bg-center"
                        style={{
                          backgroundImage: 'url(https://cdn-icons-png.flaticon.com/128/197/197374.png)'
                        }}
                      />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem 
                    onClick={() => setLanguage("it")}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-3">
                      <div 
                        className="w-6 h-6 rounded-sm flex-shrink-0"
                        style={{
                          background: 'linear-gradient(to right, #009246 33%, #FFFFFF 33%, #FFFFFF 67%, #CE2B37 67%)'
                        }}
                      />
                      <span>Italiano</span>
                    </div>
                    {language === "it" && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setLanguage("en")}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-3">
                      <div 
                        className="w-6 h-6 rounded-sm bg-cover bg-center flex-shrink-0"
                        style={{
                          backgroundImage: 'url(https://cdn-icons-png.flaticon.com/128/197/197374.png)'
                        }}
                      />
                      <span>English</span>
                    </div>
                    {language === "en" && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Logo Organizzazione - Centro (cliccabile per switch) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div 
                    className="rounded-lg p-[3px] transition-all duration-300"
                    style={
                      currentOrganization?.name === "Personal" && personalScope === 'all'
                        ? {
                            background: 'conic-gradient(from 0deg, #ef4444 0deg 90deg, #22c55e 90deg 180deg, #3b82f6 180deg 270deg, #eab308 270deg 360deg)',
                          }
                        : undefined
                    }
                  >
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={`w-14 h-14 rounded-lg shadow-lg transition-all duration-300 ${
                        currentOrganization?.name === "Personal" && personalScope === 'all'
                          ? 'bg-background hover:bg-accent'
                          : 'bg-background border border-border hover:bg-accent'
                      }`}
                    >
                      {isPersonalOrg ? (
                        <img 
                          src={htuLogo} 
                          alt="THE HUB UP" 
                          className="w-10 h-10 object-contain rounded"
                        />
                      ) : orgPartner?.logoUrl ? (
                        <img 
                          src={orgPartner.logoUrl} 
                          alt={orgPartner.name || "Logo"} 
                          className="w-10 h-10 object-contain rounded"
                        />
                      ) : (
                        <User 
                          className="text-primary"
                          style={{ width: '2rem', height: '2rem' }} 
                        />
                      )}
                    </Button>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  {organizations?.map((org) => (
                    <DropdownMenuItem
                      key={org.id}
                      className={`flex items-center justify-between cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground ${
                        currentOrganization?.id === org.id ? "bg-muted" : ""
                      }`}
                      onClick={() => switchOrganization(org.id)}
                    >
                      <div className="flex items-center space-x-2">
                        <User className="h-4 w-4" style={{ color: '#6b7280' }} />
                        <span className="font-medium">{org.name}</span>
                        {currentOrganization?.id === org.id && (
                          <Check className="h-3 w-3 text-primary" />
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <div className="px-2 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Eye className="h-4 w-4" style={{ color: isPersonalOrg ? '#6b7280' : '#d1d5db' }} />
                        <span className={`text-sm font-medium ${!isPersonalOrg ? 'text-muted-foreground' : ''}`}>
                          Vedi tutte le org
                        </span>
                      </div>
                      <Switch
                        checked={personalScope === 'all'}
                        onCheckedChange={(checked) => {
                          if (isPersonalOrg) {
                            setPersonalScope(checked ? 'all' : 'personal');
                          }
                        }}
                        disabled={!isPersonalOrg}
                        data-testid="switch-personal-scope"
                      />
                    </div>
                    {!isPersonalOrg && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Disponibile solo in Personal
                      </p>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => window.location.href = "/organizations"}>
                    <Building className="h-4 w-4 mr-2" style={{ color: '#6b7280' }} />
                    Gestisci Organizzazioni
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Nomi */}
              <div className="flex flex-col text-base leading-tight min-w-0">
                <span className="font-medium text-foreground truncate">
                  {user.firstName && user.lastName 
                    ? `${user.firstName} ${user.lastName}` 
                    : user.username}
                </span>
                <span className="text-muted-foreground truncate">
                  {currentOrganization?.name || "Nessuna org"}
                </span>
              </div>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="w-14 h-14 rounded-lg bg-primary hover:bg-primary/90 p-0 overflow-hidden">
                    <Avatar className="w-14 h-14 rounded-lg">
                      {user?.profileImageUrl && (
                        <AvatarImage 
                          src={user.profileImageUrl} 
                          alt={user.firstName || user.username || "User"} 
                          className="object-cover"
                        />
                      )}
                      <AvatarFallback className="text-lg font-medium text-primary-foreground bg-primary rounded-lg">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={() => window.location.href = "/account/settings"}
                    data-testid="button-account-settings-fullscreen"
                  >
                    <Settings className="mr-2 h-5 w-5" style={{ color: '#6b7280' }} />
                    Impostazioni Account
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => logoutMutation.mutate()} className="text-destructive">
                    <LogOut className="mr-2 h-5 w-5" style={{ color: '#ef4444' }} />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        </div>
      </div>
    </header>
  );
}
