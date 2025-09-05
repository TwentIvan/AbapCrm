import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Mail, Calendar, FolderTree, Building, User, ChevronDown, Check, Users, X, FolderOpen, CheckSquare, Handshake, FileText, DollarSign, Server, Key, Wifi, Clock, Settings, LogOut, Globe } from "lucide-react";
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
import { useOrganization } from "@/hooks/use-organization";
import { useTranslation, Language } from "@/lib/i18n";
import AccountSettingsDialog from "@/components/account/account-settings-dialog";

interface HeaderProps {
  title: string;
  subtitle: string;
  onNewClick?: () => void; // Opzionale ora che non c'è più il pulsante New
}

export default function Header({ title, subtitle, onNewClick }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const { organizations, currentOrganization, switchOrganization } = useOrganization();
  const { language, setLanguage, t } = useTranslation();

  const userInitials = user?.firstName && user?.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}` 
    : user?.username?.[0]?.toUpperCase() || "U";

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
    
    const buttons = ['messages', 'calendar', 'planning'];
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
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      borderRadius: isHovered ? '2rem' : '50%',
      border: '1px solid rgba(59, 130, 246, 0.2)',
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
    <header className="bg-card border-b border-border px-6 py-4 sticky top-0 z-10">
      <div className="flex items-center justify-between">
        <div className="flex items-stretch space-x-1">
          {/* Area Title with Icon */}
          <div 
            className="flex items-center space-x-3 px-4 py-2 shadow-sm"
            style={{ 
              background: 'linear-gradient(to right, rgba(59, 130, 246, 0.15), rgba(255, 255, 255, 0.8))',
              borderRadius: '3rem 0 0 3rem',
              border: '1px solid rgba(59, 130, 246, 0.2)'
            }}
          >
            <AreaIcon className="text-muted-foreground flex-shrink-0" style={{ width: '2rem', height: '2rem' }} />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold truncate text-muted-foreground" data-testid="text-page-title">
                {title}
              </h2>
              <p className="text-sm text-muted-foreground truncate" data-testid="text-page-subtitle">
                {subtitle}
              </p>
            </div>
          </div>
          
          {/* Search Box - espandibile */}
          <div 
            className="flex items-center px-4 py-2 shadow-sm cursor-pointer transition-all duration-300"
            style={{ 
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              borderRadius: '0 3rem 3rem 0',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              width: isSearchOpen ? '300px' : 'auto',
              minWidth: isSearchOpen ? '300px' : 'auto'
            }}
            onClick={() => !isSearchOpen && setIsSearchOpen(true)}
            data-testid="button-search"
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
            {/* Quick Access Buttons */}
            <div className="flex items-center space-x-2">
              {/* Messages Button */}
              <Link href="/messages">
                <Button 
                  variant="ghost" 
                  className="flex items-center"
                  style={getButtonStyle('messages', hoveredButton)}
                  onMouseEnter={() => setHoveredButton('messages')}
                  onMouseLeave={() => setHoveredButton(null)}
                  data-testid="button-messages"
                >
                  <Mail className="flex-shrink-0" style={{ width: '2rem', height: '2rem', color: '#6b7280' }} />
                  {hoveredButton === 'messages' && (
                    <span className="ml-3 text-foreground font-medium whitespace-nowrap">
                      {t("nav.messages")}
                    </span>
                  )}
                </Button>
              </Link>
              
              {/* Calendar Button */}
              <Link href="/calendar">
                <Button 
                  variant="ghost" 
                  className="flex items-center"
                  style={getButtonStyle('calendar', hoveredButton)}
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
              
              {/* Planning Calendar Button */}
              <Link href="/planning-calendar">
                <Button 
                  variant="ghost" 
                  className="flex items-center"
                  style={getButtonStyle('planning', hoveredButton)}
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
              

            </div>
          </TooltipProvider>

          
          {/* User & Organization Box with Switch */}
          {user && (
            <div className="relative rounded-full px-4 py-2 flex items-center space-x-4" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              {/* Language Selector - Bandiera Flat */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-14 h-14 rounded-full bg-background border border-border hover:bg-accent flex-shrink-0 p-0 overflow-hidden" 
                    data-testid="button-language-flag"
                  >
                    {language === "it" ? (
                      <div 
                        className="w-12 h-12 rounded-full"
                        style={{
                          background: 'linear-gradient(to right, #009246 33%, #FFFFFF 33%, #FFFFFF 67%, #CE2B37 67%)'
                        }}
                      />
                    ) : (
                      <div 
                        className="w-12 h-12 rounded-full bg-cover bg-center"
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
                        className="w-6 h-6 rounded-full flex-shrink-0"
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
                        className="w-6 h-6 rounded-full bg-cover bg-center flex-shrink-0"
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
                  <Button variant="ghost" size="icon" className="w-14 h-14 rounded-full bg-background border border-border hover:bg-accent">
                    <User className="text-muted-foreground" style={{ width: '2rem', height: '2rem', color: '#6b7280' }} />
                  </Button>
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
              
              {/* Avatar Utente - Destra (cliccabile per logout/impostazioni) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90">
                    <Avatar className="w-14 h-14">
                      <AvatarFallback className="text-lg font-medium text-primary-foreground bg-primary">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={() => setShowAccountSettings(true)}
                    data-testid="button-account-settings"
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
      
      {/* Account Settings Dialog */}
      <AccountSettingsDialog 
        open={showAccountSettings} 
        onOpenChange={setShowAccountSettings}
      />
    </header>
  );
}
