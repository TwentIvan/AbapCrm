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
import { useQuery } from "@tanstack/react-query";
import { Building, ChevronDown, Settings, LogOut, Users } from "lucide-react";
import AccountSettingsDialog from "./account-settings-dialog";
import ManageOrganizationsDialog from "./manage-organizations-dialog";

export default function AccountManager() {
  const { user } = useAuth();
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

  const userInitials = user.firstName && user.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}` 
    : user.username?.[0]?.toUpperCase() || "U";

  return (
    <div className="flex items-center space-x-3">
      {/* Current Organization Display */}
      <div className="flex items-center space-x-2 text-sm">
        <Building className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-foreground" data-testid="text-current-organization">
          Personal
        </span>
        <Badge variant="secondary" className="text-xs">
          admin
        </Badge>
      </div>

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
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            Organizzazioni
          </div>
          <DropdownMenuItem className="flex items-center justify-between bg-muted">
            <div className="flex items-center space-x-2">
              <Building className="h-4 w-4" />
              <span>Personal</span>
            </div>
            <Badge variant="outline" className="text-xs">
              admin
            </Badge>
          </DropdownMenuItem>
          <DropdownMenuSeparator />

          {/* Account Settings */}
          <DropdownMenuItem 
            onClick={() => setShowAccountSettings(true)}
            data-testid="button-account-settings"
          >
            <Settings className="h-4 w-4 mr-2" />
            Impostazioni Account
          </DropdownMenuItem>
          
          <DropdownMenuItem 
            onClick={() => setShowManageOrganizations(true)}
            data-testid="button-manage-organizations"
          >
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