import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Search, Mail, Calendar, FolderTree, Building, User, ChevronDown, Check, Users, X, FolderOpen, CheckSquare, Handshake, FileText, DollarSign, Server, Key, Wifi, Clock, Settings, LogOut, Globe, Eye, Sparkles, Plus } from "lucide-react";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  const { organizations, currentOrganization, switchOrganization, personalScope, setPersonalScope } = useOrganization();
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
      <div className="px-6 pt-2 pb-4 relative overflow-hidden">
        {/* Pattern con loghi HTU molto sfumati - estesi fino in alto */}
        <div className="absolute inset-0" style={{ top: 0, left: 0, right: 0, bottom: 0 }}>
          {/* Loghi molto grandi (molto sfumati) */}
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '160px', top: '5%', left: '1%', transform: 'rotate(-20deg)', opacity: 0.05 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '150px', top: '8%', left: '65%', transform: 'rotate(25deg)', opacity: 0.06 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '140px', top: '60%', left: '22%', transform: 'rotate(-15deg)', opacity: 0.07 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '155px', top: '55%', left: '82%', transform: 'rotate(18deg)', opacity: 0.08 }} />
          
          {/* Loghi grandi (sfumati) */}
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '110px', top: '15%', left: '30%', transform: 'rotate(-25deg)', opacity: 0.08 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '105px', top: '72%', left: '55%', transform: 'rotate(22deg)', opacity: 0.09 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '100px', top: '28%', left: '85%', transform: 'rotate(-12deg)', opacity: 0.10 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '95px', top: '0%', left: '40%', transform: 'rotate(32deg)', opacity: 0.08 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '108px', top: '82%', left: '92%', transform: 'rotate(-28deg)', opacity: 0.09 }} />
          
          {/* Loghi medi (sfumati) */}
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '75px', top: '40%', left: '10%', transform: 'rotate(28deg)', opacity: 0.09 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '70px', top: '12%', left: '48%', transform: 'rotate(-18deg)', opacity: 0.10 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '72px', top: '78%', left: '8%', transform: 'rotate(15deg)', opacity: 0.11 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '68px', top: '46%', left: '70%', transform: 'rotate(-30deg)', opacity: 0.12 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '74px', top: '22%', left: '18%', transform: 'rotate(18deg)', opacity: 0.10 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '66px', top: '65%', left: '38%', transform: 'rotate(-24deg)', opacity: 0.11 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '71px', top: '2%', left: '52%', transform: 'rotate(22deg)', opacity: 0.09 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '69px', top: '56%', left: '95%', transform: 'rotate(-14deg)', opacity: 0.10 }} />
          
          {/* Loghi piccoli (leggermente sfumati) */}
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '50px', top: '18%', left: '15%', transform: 'rotate(-22deg)', opacity: 0.12 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '48px', top: '62%', left: '45%', transform: 'rotate(20deg)', opacity: 0.13 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '52px', top: '32%', left: '60%', transform: 'rotate(-16deg)', opacity: 0.14 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '46px', top: '85%', left: '72%', transform: 'rotate(25deg)', opacity: 0.15 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '44px', top: '6%', left: '8%', transform: 'rotate(-26deg)', opacity: 0.13 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '51px', top: '52%', left: '5%', transform: 'rotate(16deg)', opacity: 0.12 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '47px', top: '28%', left: '42%', transform: 'rotate(-19deg)', opacity: 0.14 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '49px', top: '75%', left: '78%', transform: 'rotate(28deg)', opacity: 0.13 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '45px', top: '14%', left: '75%', transform: 'rotate(-21deg)', opacity: 0.15 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '53px', top: '42%', left: '32%', transform: 'rotate(24deg)', opacity: 0.12 }} />
          <img src={htuLogo} alt="" style={{ position: 'absolute', width: '43px', top: '88%', left: '48%', transform: 'rotate(-17deg)', opacity: 0.14 }} />
        </div>
        
        {/* THE HUB UP - positioned at top */}
        <div className="relative z-10 mb-3">
          <h1 className="text-left font-black tracking-tight uppercase">
            <span className="text-lg text-blue-600 dark:text-blue-400">THE</span>
            {' '}
            <span className="text-3xl text-blue-800 dark:text-blue-600">HUB</span>
            {' '}
            <span className="text-3xl text-blue-400 dark:text-blue-300">UP</span>
          </h1>
        </div>
        
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
                    <span className="text-lg font-black text-blue-600 dark:text-blue-400">T</span>
                    <span className="text-2xl font-black text-blue-500 dark:text-blue-300">H</span>
                    <span className="text-2xl font-black text-blue-600 dark:text-blue-400">U</span>
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
                      <User 
                        className="text-blue-600 dark:text-blue-400"
                        style={{ width: '2rem', height: '2rem' }} 
                      />
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
                  {currentOrganization?.name === "Personal" && (
                    <>
                      <div className="px-2 py-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Eye className="h-4 w-4" style={{ color: '#6b7280' }} />
                            <span className="text-sm font-medium">Vedi tutte le org</span>
                          </div>
                          <Switch
                            checked={personalScope === 'all'}
                            onCheckedChange={(checked) => setPersonalScope(checked ? 'all' : 'personal')}
                            data-testid="switch-personal-scope"
                          />
                        </div>
                      </div>
                      <DropdownMenuSeparator />
                    </>
                  )}
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
                  <Button variant="ghost" size="icon" className="w-14 h-14 rounded-lg bg-primary hover:bg-primary/90">
                    <Avatar className="w-14 h-14 rounded-lg">
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
