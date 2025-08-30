import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Code, BarChart3, FolderOpen, CheckSquare, Handshake, Building, Calendar, Clock, User, LogOut, FolderTree, Mail, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import hubUpLogo from "@assets/generated_images/hub_up_logo.png";
import ImageContainer from "@/components/ui/image-container";

const navigation = [
  { name: "Dashboard", href: "/", icon: BarChart3, testId: "nav-dashboard" },
  { name: "Projects", href: "/projects", icon: FolderOpen, testId: "nav-projects" },
  { name: "Tasks", href: "/tasks", icon: CheckSquare, testId: "nav-tasks" },
  { name: "Time Entries", href: "/timesheet", icon: Clock, testId: "nav-timesheet" },
  { name: "Timesheets", href: "/timesheets", icon: Clock, testId: "nav-timesheets" },
  { name: "Deals", href: "/deals", icon: Handshake, testId: "nav-deals" },
  { name: "Partners", href: "/partners", icon: Building, testId: "nav-partners" },
  { name: "Rate Agreements", href: "/rate-agreements", icon: DollarSign, testId: "nav-rate-agreements" },
  { name: "Messages", href: "/messages", icon: Mail, testId: "nav-messages" },
  { name: "Calendar", href: "/calendar", icon: Calendar, testId: "nav-calendar" },
  { name: "Planning Calendar", href: "/planning-calendar", icon: FolderTree, testId: "nav-planning-calendar" },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      {/* Logo and Brand */}
      <div className="p-6 border-b border-border">
        <div className="flex justify-center">
          <ImageContainer
            src={hubUpLogo}
            alt="The Hub Up"
            fallbackType="logo"
            size="custom"
            containerClassName="w-64 h-44"
            data-testid="img-app-logo"
          />
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-2">
        {navigation.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          
          return (
            <Link key={item.name} href={item.href}>
              <Button
                variant={isActive ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start space-x-3",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
                data-testid={item.testId}
              >
                <Icon className="h-5 w-5" />
                <span>{item.name}</span>
              </Button>
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center space-x-3 p-3 rounded-md hover:bg-accent transition-colors">
          <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
            <User className="h-4 w-4 text-muted-foreground" />
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
            onClick={() => logoutMutation.mutate()}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
