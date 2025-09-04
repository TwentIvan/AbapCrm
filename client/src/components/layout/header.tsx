import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Mail, Calendar, FolderTree, Building } from "lucide-react";
import AccountManager from "@/components/account/account-manager";

interface HeaderProps {
  title: string;
  subtitle: string;
  onNewClick?: () => void; // Opzionale ora che non c'è più il pulsante New
}

export default function Header({ title, subtitle, onNewClick }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");

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

          
          {/* User & Organization Box */}
          <div className="bg-muted/20 border border-muted rounded-lg p-2 flex items-center space-x-2">
            <AccountManager />
          </div>
        </div>
      </div>
    </header>
  );
}
