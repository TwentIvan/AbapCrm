import { useState } from "react";
import { useTheme } from "./theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Palette, Check } from "lucide-react";

export function ThemeSelector() {
  const { currentTheme, setTheme, themes } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" data-testid="theme-selector">
          <Palette className="h-4 w-4" />
          <span className="ml-2 hidden sm:inline">Tema</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-testid="theme-dropdown">
        {themes.map((theme) => (
          <DropdownMenuItem 
            key={theme.name} 
            onClick={() => setTheme(theme.name)}
            className="flex items-center justify-between"
            data-testid={`theme-option-${theme.name}`}
          >
            <div className="flex items-center">
              <div 
                className="w-4 h-4 rounded-full mr-2 border border-gray-300"
                style={{ backgroundColor: theme.primary }}
              />
              {theme.label}
            </div>
            {currentTheme.name === theme.name && (
              <Check className="h-4 w-4" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}