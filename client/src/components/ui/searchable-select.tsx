import React, { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between text-left", className)}
          disabled={disabled}
          data-testid={testId}
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
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-full border-0 bg-transparent px-0 text-sm outline-none ring-0 focus:outline-none focus:ring-0"
            autoFocus={true}
            style={{ outline: 'none', border: 'none' }}
          />
        </div>
        <ScrollArea className="max-h-64">
          <div className="p-1">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  className="flex cursor-pointer items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
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
      </PopoverContent>
    </Popover>
  );
}