import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Mail, Calendar, FolderTree, Building, User, ChevronDown, Check, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";

interface HeaderProps {
  title: string;
  subtitle: string;
  onNewClick?: () => void; // Opzionale ora che non c'è più il pulsante New
}

export default function Header({ title, subtitle, onNewClick }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { user, logoutMutation } = useAuth();
  const { organizations, currentOrganization, switchOrganization } = useOrganization();

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
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 w-64"
              data-testid="input-search"
            />
          </div>
          
          {/* Quick Access Buttons */}
          <div className="flex items-center space-x-2">
            <Link href="/organizations">
              <Button variant="ghost" size="icon" data-testid="button-organizations">
                <Building className="h-7 w-7" />
                <span className="sr-only">Organizations</span>
              </Button>
            </Link>
            
            <Link href="/messages">
              <Button variant="ghost" size="icon" data-testid="button-messages">
                <Mail className="h-7 w-7" />
                <span className="sr-only">Messages</span>
              </Button>
            </Link>
            
            <Link href="/calendar">
              <Button variant="ghost" size="icon" data-testid="button-calendar">
                <Calendar className="h-7 w-7" />
                <span className="sr-only">Calendar</span>
              </Button>
            </Link>
            
            <Link href="/planning-calendar">
              <Button variant="ghost" size="icon" data-testid="button-planning-calendar">
                <FolderTree className="h-7 w-7" />
                <span className="sr-only">Planning Calendar</span>
              </Button>
            </Link>
          </div>

          
          {/* User & Organization Box with Switch */}
          {user && (
            <div className="bg-muted/20 border border-muted rounded-full px-4 py-2 flex items-center space-x-4">
              {/* Logo Organizzazione - Sinistra (cliccabile per switch) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="w-10 h-10 rounded-full bg-background border border-border hover:bg-accent">
                    {currentOrganization?.logoUrl ? (
                      <img 
                        src={currentOrganization.logoUrl} 
                        alt={`${currentOrganization.name} logo`}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <Building className="h-6 w-6 text-muted-foreground" />
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
              <div className="flex flex-col text-sm leading-tight min-w-0">
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
                  <Button variant="ghost" size="icon" className="w-10 h-10 rounded-full bg-primary hover:bg-primary/90">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="text-sm font-medium text-primary-foreground bg-primary">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => console.log('Account Settings')}>
                    <User className="mr-2 h-4 w-4" />
                    Impostazioni Account
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => logoutMutation.mutate()} className="text-destructive">
                    <User className="mr-2 h-4 w-4" />
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
