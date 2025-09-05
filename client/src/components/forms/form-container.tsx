import { ReactNode } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";

interface FormContainerProps {
  // Dialog mode props
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  
  // Content
  title: string;
  description?: string;
  children: ReactNode;
  
  // Full page mode configuration
  fullPageRoute?: string; // e.g., "/projects/new"
  
  // Mode detection
  mode?: "dialog" | "page" | "auto"; // auto detects based on route
  
  // Additional props
  maxWidth?: string;
  showModeToggle?: boolean;
}

export default function FormContainer({
  open = false,
  onOpenChange,
  title,
  description,
  children,
  fullPageRoute,
  mode = "auto",
  maxWidth = "max-w-4xl",
  showModeToggle = true,
}: FormContainerProps) {
  const [location, setLocation] = useLocation();
  
  // Auto-detect mode based on current route
  const currentMode = mode === "auto" 
    ? (fullPageRoute && location === fullPageRoute ? "page" : "dialog")
    : mode;
  
  // Mode toggle handlers
  const switchToFullPage = () => {
    if (fullPageRoute) {
      setLocation(fullPageRoute);
      onOpenChange?.(false);
    }
  };
  
  const switchToDialog = () => {
    if (fullPageRoute) {
      const basePath = fullPageRoute.split("/").slice(0, -1).join("/");
      setLocation(basePath || "/");
    } else {
      // Fallback: go back in history or to home
      if (window.history.length > 1) {
        window.history.back();
      } else {
        setLocation("/");
      }
    }
  };
  
  // Page mode rendering
  if (currentMode === "page") {
    return (
      <div className="min-h-screen bg-muted/20">
        <div className="container mx-auto py-8 px-4">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={switchToDialog}
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Indietro
              </Button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
                {description && (
                  <p className="text-muted-foreground mt-1">{description}</p>
                )}
              </div>
            </div>
            
            {showModeToggle && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={switchToDialog}
                data-testid="button-minimize"
              >
                <Minimize2 className="h-4 w-4 mr-2" />
                Modalità Finestra
              </Button>
            )}
          </div>
          
          <Card className={`${maxWidth} mx-auto`}>
            <CardContent className="p-8">
              {children}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
  
  // Dialog mode rendering
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${maxWidth} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{title}</DialogTitle>
              {description && (
                <DialogDescription className="mt-1">
                  {description}
                </DialogDescription>
              )}
            </div>
            
            {showModeToggle && fullPageRoute && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={switchToFullPage}
                data-testid="button-maximize"
                title="Apri a schermo intero"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogHeader>
        
        {children}
      </DialogContent>
    </Dialog>
  );
}

// Helper hook per gestire form routing
export function useFormRouting(basePath: string, entityId?: string) {
  const [location, setLocation] = useLocation();
  
  const routes = {
    create: `${basePath}/new`,
    edit: (id: string) => `${basePath}/${id}/edit`,
    list: basePath,
  };
  
  const navigation = {
    toCreate: () => setLocation(routes.create),
    toEdit: (id: string) => setLocation(routes.edit(id)),
    toList: () => setLocation(routes.list),
    back: () => setLocation(routes.list),
  };
  
  const currentRoute = {
    isCreate: location === routes.create,
    isEdit: entityId ? location === routes.edit(entityId) : false,
    isList: location === routes.list,
    isFullPage: location === routes.create || (entityId && location === routes.edit(entityId)),
  };
  
  return {
    routes,
    navigation,
    currentRoute,
  };
}