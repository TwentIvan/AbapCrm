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
import { Building, ChevronDown, Settings, LogOut, Users } from "lucide-react";

export default function AccountManager() {
  const { user } = useAuth();
  const { organizations, currentOrganization, switchOrganization, isLoading } = useOrganization();

  if (!user || isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-muted rounded-full animate-pulse"></div>
        <div className="w-24 h-4 bg-muted rounded animate-pulse"></div>
      </div>
    );
  }

  const userInitials = user.firstName && user.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}` 
    : user.username?.[0]?.toUpperCase() || "U";

  return (
    <div className="flex items-center space-x-3">
      {/* Current Organization Display */}
      {currentOrganization && (
        <div className="flex items-center space-x-2 text-sm">
          <Building className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-foreground" data-testid="text-current-organization">
            {currentOrganization.name}
          </span>
          <Badge variant="secondary" className="text-xs">
            {currentOrganization.userRole}
          </Badge>
        </div>
      )}

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
          {/* Organization Switcher */}
          {organizations.length > 1 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                Organizzazioni
              </div>
              {organizations.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => switchOrganization(org.id)}
                  className={`flex items-center justify-between ${
                    currentOrganization?.id === org.id ? 'bg-muted' : ''
                  }`}
                  data-testid={`button-switch-org-${org.id}`}
                >
                  <div className="flex items-center space-x-2">
                    <Building className="h-4 w-4" />
                    <span>{org.name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {org.userRole}
                  </Badge>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}

          {/* Account Settings */}
          <DropdownMenuItem data-testid="button-account-settings">
            <Settings className="h-4 w-4 mr-2" />
            Impostazioni Account
          </DropdownMenuItem>
          
          <DropdownMenuItem data-testid="button-manage-organizations">
            <Users className="h-4 w-4 mr-2" />
            Gestisci Organizzazioni
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
    </div>
  );
}