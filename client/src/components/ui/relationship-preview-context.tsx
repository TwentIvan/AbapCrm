import { createContext, useContext, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RelationshipItem {
  id: string;
  name: string;
}

interface RelationshipPreviewData {
  label: string;
  count: number;
  items: RelationshipItem[];
  targetPath: string;
  filterParam?: string;
  sourceId?: string;
}

interface RelationshipPreviewContextType {
  openPreview: (data: RelationshipPreviewData) => void;
}

const RelationshipPreviewContext = createContext<RelationshipPreviewContextType | null>(null);

export function useRelationshipPreview() {
  const context = useContext(RelationshipPreviewContext);
  if (!context) {
    throw new Error("useRelationshipPreview must be used within RelationshipPreviewProvider");
  }
  return context;
}

export function RelationshipPreviewProvider({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [previewData, setPreviewData] = useState<RelationshipPreviewData | null>(null);

  const openPreview = useCallback((data: RelationshipPreviewData) => {
    setPreviewData(data);
    setIsOpen(true);
  }, []);

  const handleNavigateToAll = () => {
    if (previewData) {
      setIsOpen(false);
      const path = previewData.filterParam && previewData.sourceId
        ? `${previewData.targetPath}?${previewData.filterParam}=${previewData.sourceId}`
        : previewData.targetPath;
      setLocation(path);
    }
  };

  return (
    <RelationshipPreviewContext.Provider value={{ openPreview }}>
      {children}
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {previewData?.label} ({previewData?.count})
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="max-h-64">
            <div className="space-y-2 py-2">
              {previewData?.items && previewData.items.length > 0 ? (
                previewData.items.map((item) => (
                  <div
                    key={item.id}
                    className="w-full text-left p-3 rounded-lg bg-muted"
                    data-testid={`preview-item-${item.id}`}
                  >
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4">
                  {previewData?.count} elementi collegati
                </div>
              )}
            </div>
          </ScrollArea>
          
          <div className="flex justify-end pt-2 border-t">
            <Button 
              onClick={handleNavigateToAll}
              data-testid={`btn-view-all-${previewData?.label?.toLowerCase()}`}
            >
              Vedi tutti →
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </RelationshipPreviewContext.Provider>
  );
}
