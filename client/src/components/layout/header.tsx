import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Mail, Calendar, FolderTree, Building, User, ChevronDown, Check, Users, X, Globe } from "lucide-react";
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

interface HeaderProps {
  title: string;
  subtitle: string;
  onNewClick?: () => void; // Opzionale ora che non c'è più il pulsante New
}

export default function Header({ title, subtitle, onNewClick }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { user, logoutMutation } = useAuth();
  const { organizations, currentOrganization, switchOrganization } = useOrganization();
  const { language, setLanguage, t } = useTranslation();

  const userInitials = user?.firstName && user?.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}` 
    : user?.username?.[0]?.toUpperCase() || "U";

  return (
    <header className="bg-card border-b border-border px-6 py-4 sticky top-0 z-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground" data-testid="text-page-title">
            {title}
          </h2>
          <p className="text-muted-foreground" data-testid="text-page-subtitle">
            {subtitle}
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <TooltipProvider delayDuration={300}>
            {/* Search Icon */}
            <div className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-12 w-12 rounded-full" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%', border: '1px solid rgba(59, 130, 246, 0.2)' }}
                          data-testid="button-search"
                        >
                          <Search className="h-8 w-8 text-muted-foreground" style={{ width: '2rem', height: '2rem', color: '#6b7280' }} />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-2" align="start">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
                          <Input
                            type="text"
                            placeholder="Cerca in tutto il CRM..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 pr-10 h-12 text-base"
                            data-testid="input-search"
                            autoFocus
                          />
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8"
                            onClick={() => {
                              setSearchQuery("");
                              setIsSearchOpen(false);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </TooltipTrigger>
                <TooltipContent 
                  className="rounded-full px-6 py-3 text-base font-medium shadow-lg border"
                  style={{ minWidth: '240px', backgroundColor: '#ebf3fe', borderColor: 'rgba(59, 130, 246, 0.2)' }}
                  sideOffset={10}
                >
                  {t("header.search")}
                </TooltipContent>
              </Tooltip>
            </div>
            
            {/* Quick Access Buttons */}
            <div className="flex items-center space-x-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/organizations">
                    <Button variant="ghost" size="icon" className="h-12 w-12 rounded-full" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%' }} data-testid="button-organizations">
                      <Building className="h-8 w-8" style={{ width: '2rem', height: '2rem', color: '#6b7280' }} />
                      <span className="sr-only">Organizations</span>
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent 
                  className="rounded-full px-6 py-3 text-base font-medium shadow-lg border"
                  style={{ minWidth: '240px', backgroundColor: '#ebf3fe', borderColor: 'rgba(59, 130, 246, 0.2)' }}
                  sideOffset={10}
                >
                  {t("nav.organizations")}
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/messages">
                    <Button variant="ghost" size="icon" className="h-12 w-12 rounded-full" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%' }} data-testid="button-messages">
                      <Mail className="h-8 w-8" style={{ width: '2rem', height: '2rem', color: '#6b7280' }} />
                      <span className="sr-only">Messages</span>
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent 
                  className="rounded-full px-6 py-3 text-base font-medium shadow-lg border"
                  style={{ minWidth: '240px', backgroundColor: '#ebf3fe', borderColor: 'rgba(59, 130, 246, 0.2)' }}
                  sideOffset={10}
                >
                  {t("nav.messages")}
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/calendar">
                    <Button variant="ghost" size="icon" className="h-12 w-12 rounded-full" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%' }} data-testid="button-calendar">
                      <Calendar className="h-8 w-8" style={{ width: '2rem', height: '2rem', color: '#6b7280' }} />
                      <span className="sr-only">Calendar</span>
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent 
                  className="rounded-full px-6 py-3 text-base font-medium shadow-lg border"
                  style={{ minWidth: '240px', backgroundColor: '#ebf3fe', borderColor: 'rgba(59, 130, 246, 0.2)' }}
                  sideOffset={10}
                >
                  Calendario Eventi
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/planning-calendar">
                    <Button variant="ghost" size="icon" className="h-12 w-12 rounded-full" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%' }} data-testid="button-planning-calendar">
                      <FolderTree className="h-8 w-8" style={{ width: '2rem', height: '2rem', color: '#6b7280' }} />
                      <span className="sr-only">Planning Calendar</span>
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent 
                  className="rounded-full px-6 py-3 text-base font-medium shadow-lg border"
                  style={{ minWidth: '240px', backgroundColor: '#ebf3fe', borderColor: 'rgba(59, 130, 246, 0.2)' }}
                  sideOffset={10}
                >
                  Pianificazione Progetti
                </TooltipContent>
              </Tooltip>

              {/* Language Selector */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-12 w-12 rounded-full" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%' }} data-testid="button-language">
                          <Globe className="h-8 w-8" style={{ width: '2rem', height: '2rem', color: '#6b7280' }} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          onClick={() => setLanguage("it")}
                          className="flex items-center justify-between"
                        >
                          <span>🇮🇹 Italiano</span>
                          {language === "it" && <Check className="h-4 w-4" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => setLanguage("en")}
                          className="flex items-center justify-between"
                        >
                          <span>🇬🇧 English</span>
                          {language === "en" && <Check className="h-4 w-4" />}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TooltipTrigger>
                <TooltipContent 
                  className="rounded-full px-6 py-3 text-base font-medium shadow-lg border"
                  style={{ minWidth: '240px', backgroundColor: '#ebf3fe', borderColor: 'rgba(59, 130, 246, 0.2)' }}
                  sideOffset={10}
                >
                  {t("header.language")}
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>

          
          {/* User & Organization Box with Switch */}
          {user && (
            <div className="rounded-full px-4 py-2 flex items-center space-x-4" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              {/* Logo Organizzazione - Sinistra (cliccabile per switch) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="w-14 h-14 rounded-full bg-background border border-border hover:bg-accent">
                    {currentOrganization?.logoUrl ? (
                      <img 
                        src={currentOrganization.logoUrl} 
                        alt={`${currentOrganization.name} logo`}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <Building className="h-12 w-12 text-muted-foreground" />
                    )}
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
                        {org.logoUrl ? (
                          <img 
                            src={org.logoUrl} 
                            alt={`${org.name} logo`}
                            className="h-4 w-4 rounded object-cover"
                          />
                        ) : (
                          <Building className="h-4 w-4" />
                        )}
                        <span className="font-medium">{org.name}</span>
                        {currentOrganization?.id === org.id && (
                          <Check className="h-3 w-3 text-primary" />
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => window.location.href = "/organizations"}>
                    <Users className="h-4 w-4 mr-2" />
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
                  <DropdownMenuItem onClick={() => console.log('Account Settings')}>
                    <User className="mr-2 h-5 w-5" />
                    Impostazioni Account
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => logoutMutation.mutate()} className="text-destructive">
                    <User className="mr-2 h-5 w-5" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
