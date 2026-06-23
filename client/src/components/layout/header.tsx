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
import { Wordmark } from "@/components/brand/Wordmark";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/contexts/organization-context";
import { useTranslation, Language } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import htuLogo from "@assets/HTU-logo-512_(1)_1782240207188.png";

interface HeaderProps {
  title: string;
  subtitle: string;
  onNewClick?: () => void;
}

export default function Header({ title, subtitle, onNewClick }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const { organizations, currentOrganization, switchOrganization, personalScope, setPersonalScope, isPersonalOrg } = useOrganization();
  const { language, setLanguage, t } = useTranslation();

  const userInitials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.username?.[0]?.toUpperCase() || "U";

  const { data: unreadMessages } = useQuery<{ count: number }>({
    queryKey: ['/api/messages/unread-count'],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganization,
  });

  const { data: pendingProposals } = useQuery<{ count: number }>({
    queryKey: ['/api/proposals/pending-count'],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganization,
  });

  const { data: pendingApprovals } = useQuery<{ count: number }>({
    queryKey: ['/api/mcp/pending-actions/count'],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganization,
    refetchInterval: 10000,
  });

  const { data: orgPartner } = useQuery<{ id: string; name: string; logoUrl?: string | null }>({
    queryKey: ['/api/partners', currentOrganization?.partnerId],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganization?.partnerId,
  });

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
    return routeIconMap[path] || Building;
  };

  const AreaIcon = getAreaIcon(location);

  return (
    <header className="bg-card border-b border-border sticky top-0 z-10">
      {/* Top bar: Wordmark + actions */}
      <div className="px-6 py-3 flex items-center justify-between">
        <Wordmark height={36} />

        <div className="flex items-center gap-2">
          {/* Search */}
          {isSearchOpen ? (
            <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5 w-64">
              <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                placeholder={`Cerca in ${title}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm focus:outline-none text-foreground placeholder:text-muted-foreground"
                data-testid="input-search"
                autoFocus
                onBlur={() => !searchQuery && setIsSearchOpen(false)}
              />
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => { setSearchQuery(""); setIsSearchOpen(false); }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              onClick={() => setIsSearchOpen(true)}
              data-testid="button-search"
            >
              <Search className="h-4 w-4" />
            </Button>
          )}

          {/* AI Proposals */}
          <Link href="/proposals">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground relative"
              data-testid="button-proposals"
            >
              <Sparkles className="h-4 w-4" />
              {(pendingProposals?.count ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-agent text-agent-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {(pendingProposals?.count ?? 0) > 9 ? '9+' : pendingProposals?.count}
                </span>
              )}
            </Button>
          </Link>

          {/* MCP Approvals */}
          {(pendingApprovals?.count ?? 0) > 0 && (
            <Link href="/mcp-library">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-warning hover:text-warning relative"
                data-testid="button-pending-approvals"
              >
                <ShieldAlert className="h-4 w-4" />
                <span className="absolute -top-0.5 -right-0.5 bg-warning text-warning-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {(pendingApprovals?.count ?? 0) > 9 ? '9+' : pendingApprovals?.count}
                </span>
              </Button>
            </Link>
          )}

          {/* Messages */}
          <Link href="/messages">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground relative"
              data-testid="button-messages"
            >
              <Mail className="h-4 w-4" />
              {(unreadMessages?.count ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {(unreadMessages?.count ?? 0) > 9 ? '9+' : unreadMessages?.count}
                </span>
              )}
            </Button>
          </Link>

          {/* Calendar */}
          <Link href="/calendar">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              data-testid="button-calendar"
            >
              <Calendar className="h-4 w-4" />
            </Button>
          </Link>

          {/* Planning */}
          <Link href="/planning-calendar">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              data-testid="button-planning-calendar"
            >
              <FolderTree className="h-4 w-4" />
            </Button>
          </Link>

          {/* Partners */}
          <Link href="/partners">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              data-testid="button-partners"
            >
              <Users className="h-4 w-4" />
            </Button>
          </Link>

          <div className="w-px h-6 bg-border mx-1" />

          {/* Language */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 p-0 overflow-hidden"
                data-testid="button-language-flag"
              >
                {language === "it" ? (
                  <div
                    className="w-6 h-6 rounded-sm"
                    style={{
                      background: 'linear-gradient(to right, #009246 33%, #FFFFFF 33%, #FFFFFF 67%, #CE2B37 67%)'
                    }}
                  />
                ) : (
                  <div
                    className="w-6 h-6 rounded-sm bg-cover bg-center"
                    style={{
                      backgroundImage: 'url(https://cdn-icons-png.flaticon.com/128/197/197374.png)'
                    }}
                  />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setLanguage("it")}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-5 h-5 rounded-sm flex-shrink-0"
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
                <div className="flex items-center gap-2">
                  <div
                    className="w-5 h-5 rounded-sm bg-cover bg-center flex-shrink-0"
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

          {/* Org switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg p-0 overflow-hidden"
              >
                {isPersonalOrg ? (
                  <img src={htuLogo} alt="THE HUB UP" className="w-7 h-7 object-contain" />
                ) : orgPartner?.logoUrl ? (
                  <img src={orgPartner.logoUrl} alt={orgPartner.name || "Logo"} className="w-7 h-7 object-contain rounded" />
                ) : (
                  <Building className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {organizations?.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  className={cn("cursor-pointer", currentOrganization?.id === org.id && "bg-muted")}
                  onClick={() => switchOrganization(org.id)}
                >
                  <span className="font-medium">{org.name}</span>
                  {currentOrganization?.id === org.id && <Check className="h-3 w-3 ml-auto text-primary" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <div className="px-2 py-2">
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${!isPersonalOrg ? 'text-muted-foreground' : ''}`}>
                    Vedi tutte le org
                  </span>
                  <Switch
                    checked={personalScope === 'all'}
                    onCheckedChange={(checked) => {
                      if (isPersonalOrg) setPersonalScope(checked ? 'all' : 'personal');
                    }}
                    disabled={!isPersonalOrg}
                    data-testid="switch-personal-scope"
                  />
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => window.location.href = "/organizations"}>
                <Building className="h-4 w-4 mr-2 text-muted-foreground" />
                Gestisci Organizzazioni
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User avatar */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full p-0 overflow-hidden">
                <Avatar className="h-9 w-9">
                  {user?.profileImageUrl && (
                    <AvatarImage src={user.profileImageUrl} alt={user.firstName || user.username || "User"} className="object-cover" />
                  )}
                  <AvatarFallback className="text-xs font-medium bg-primary text-primary-foreground">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">
                  {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.username}
                </p>
                <p className="text-xs text-muted-foreground">
                  {currentOrganization?.name || "Nessuna org"}
                </p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => window.location.href = "/account/settings"} data-testid="button-account-settings-fullscreen">
                <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
                Impostazioni Account
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logoutMutation.mutate()} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Page context bar */}
      <div className="px-6 py-3 border-t border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <AreaIcon className="h-5 w-5 text-primary flex-shrink-0" />
          <div>
            <h2 className="text-base font-semibold text-foreground leading-tight" data-testid="text-page-title">
              {title}
            </h2>
            <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
              {subtitle}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
