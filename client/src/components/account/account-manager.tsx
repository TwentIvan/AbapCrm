import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { Building, ChevronDown, Settings, LogOut, Users, Check } from "lucide-react";
import AccountSettingsDialog from "./account-settings-dialog";
import ManageOrganizationsDialog from "./manage-organizations-dialog";

export default function AccountManager() {
  const { user } = useAuth();
  const { organizations, currentOrganization, switchOrganization, isLoading } = useOrganization();
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [showManageOrganizations, setShowManageOrganizations] = useState(false);

  if (!user) {
    return (
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-muted rounded-full animate-pulse"></div>
        <div className="w-24 h-4 bg-muted rounded animate-pulse"></div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2 text-sm">
          <Building className="h-4 w-4 text-muted-foreground" />
          <div className="w-20 h-4 bg-muted rounded animate-pulse"></div>
          <div className="w-12 h-4 bg-muted rounded animate-pulse"></div>
        </div>
        <div className="w-8 h-8 bg-muted rounded-full animate-pulse"></div>
      </div>
    );
  }

  const userInitials = user.firstName && user.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}` 
    : user.username?.[0]?.toUpperCase() || "U";

  return (
    <div className="flex items-center space-x-3">
      {/* Organization Switcher Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center space-x-2 h-auto p-2" data-testid="button-org-switcher">
            {currentOrganization?.logoUrl ? (
              <img 
                src={currentOrganization.logoUrl} 
                alt={`${currentOrganization.name} logo`}
                className="h-5 w-5 rounded object-cover"
              />
            ) : (
              <Building className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="font-medium text-foreground text-sm" data-testid="text-current-organization">
              {currentOrganization?.name || (organizations.length > 0 ? "Seleziona organizzazione" : "Nessuna organizzazione")}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent align="start" className="w-64">
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            Organizzazioni
          </div>
          {organizations.map((org) => (
            <DropdownMenuItem
              key={org.id}
              className={`flex items-center justify-between cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground ${
                currentOrganization?.id === org.id ? "bg-muted" : ""
              }`}
              onClick={() => switchOrganization(org.id)}
              data-testid={`button-switch-org-${org.id}`}
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
          <DropdownMenuItem 
            onClick={() => setShowManageOrganizations(true)}
            data-testid="button-manage-organizations"
          >
            <Users className="h-4 w-4 mr-2" />
            Gestisci Organizzazioni
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Account Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center space-x-2 h-auto p-2" data-testid="button-account-menu">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-sm">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium">
                {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.username}
              </span>
              <span className="text-xs text-muted-foreground">
                {user.email}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent align="end" className="w-64">
          {/* Account Settings */}
          <DropdownMenuItem 
            onClick={() => setShowAccountSettings(true)}
            data-testid="button-account-settings"
          >
            <Settings className="h-4 w-4 mr-2" />
            Impostazioni Account
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem 
            onClick={() => window.location.href = "/api/logout"}
            className="text-destructive focus:text-destructive"
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Esci
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialogs */}
      <AccountSettingsDialog 
        open={showAccountSettings} 
        onOpenChange={setShowAccountSettings}
      />
      <ManageOrganizationsDialog 
        open={showManageOrganizations} 
        onOpenChange={setShowManageOrganizations}
      />
    </div>
  );
}