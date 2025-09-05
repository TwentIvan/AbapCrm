import { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Palette, Check } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { ThemeConfiguration } from "@/lib/theme-system";

interface ThemeSelectorProps {
  variant?: "dropdown" | "dialog";
  size?: "sm" | "default" | "lg";
}

export function ThemeSelector({ variant = "dropdown", size = "default" }: ThemeSelectorProps) {
  const { currentTheme, availableThemes, setTheme, isLoading } = useTheme();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleThemeChange = async (themeId: string) => {
    await setTheme(themeId);
    if (variant === "dialog") {
      setIsDialogOpen(false);
    }
  };

  const ThemePreview = ({ theme }: { theme: ThemeConfiguration }) => (
    <div className="flex items-center space-x-3">
      <div className="flex space-x-1">
        <div 
          className="w-4 h-4 rounded-full border"
          style={{ backgroundColor: theme.colors.primary.light, borderColor: theme.colors.primary.border }}
        />
        <div 
          className="w-4 h-4 rounded-full border"
          style={{ backgroundColor: theme.colors.secondary.light, borderColor: theme.colors.secondary.border }}
        />
      </div>
      <span className="flex-1">{theme.displayName}</span>
      {currentTheme.id === theme.id && (
        <Check className="h-4 w-4 text-green-600" />
      )}
    </div>
  );

  const ThemeList = () => (
    <div className="space-y-2">
      {availableThemes.map((theme) => (
        <Button
          key={theme.id}
          variant={currentTheme.id === theme.id ? "secondary" : "ghost"}
          className="w-full justify-start h-auto p-3"
          onClick={() => handleThemeChange(theme.id)}
          disabled={isLoading}
        >
          <ThemePreview theme={theme} />
        </Button>
      ))}
    </div>
  );

  if (variant === "dialog") {
    return (
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size={size} className="gap-2">
            <Palette className="h-4 w-4" />
            <span>Tema: {currentTheme.displayName}</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Seleziona Tema Colore</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <ThemeList />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Dropdown variant
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} className="gap-2" disabled={isLoading}>
          <Palette className="h-4 w-4" />
          {size !== "sm" && <span>{currentTheme.displayName}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="p-2">
          <div className="text-sm font-medium mb-2">Tema Colore</div>
          <DropdownMenuSeparator />
        </div>
        {availableThemes.map((theme) => (
          <DropdownMenuItem
            key={theme.id}
            onClick={() => handleThemeChange(theme.id)}
            disabled={isLoading}
            className="p-3"
          >
            <ThemePreview theme={theme} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}