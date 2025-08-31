import React, { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Seleziona opzione...",
  searchPlaceholder = "Cerca...",
  emptyMessage = "Nessun risultato trovato.",
  disabled = false,
  className,
  "data-testid": testId,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    
    const query = searchQuery.toLowerCase();
    return options.filter(option => 
      option.label.toLowerCase().includes(query) ||
      option.description?.toLowerCase().includes(query)
    );
  }, [options, searchQuery]);

  const selectedOption = options.find(option => option.value === value);

  return (
    <>
      <Button
        variant="outline"
        className={cn("w-full justify-between text-left", className)}
        disabled={disabled}
        data-testid={testId}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <div className="flex flex-col items-start">
          {selectedOption ? (
            <>
              <span>{selectedOption.label}</span>
              {selectedOption.description && (
                <span className="text-xs text-muted-foreground">
                  {selectedOption.description}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </div>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent 
          className="max-w-[500px]"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Seleziona Sistema</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setOpen(false)}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 shrink-0 opacity-50" />
              <Input
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
                autoFocus
              />
            </div>
            
            <ScrollArea className="max-h-64 w-full">
              <div className="space-y-1">
                {filteredOptions.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    {emptyMessage}
                  </div>
                ) : (
                  filteredOptions.map((option) => (
                    <div
                      key={option.value}
                      className="flex cursor-pointer items-center justify-between rounded-md p-3 text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        onValueChange(option.value);
                        setOpen(false);
                        setSearchQuery("");
                      }}
                    >
                      <div className="flex flex-col">
                        <span>{option.label}</span>
                        {option.description && (
                          <span className="text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        )}
                      </div>
                      <Check
                        className={cn(
                          "ml-2 h-4 w-4",
                          value === option.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}