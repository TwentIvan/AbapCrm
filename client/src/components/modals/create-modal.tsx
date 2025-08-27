import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FolderOpen, CheckSquare, Handshake, Building, Calendar, X } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

interface CreateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const createOptions = [
  {
    id: "project",
    title: "Project", 
    description: "New SAP project",
    icon: FolderOpen,
    route: "/projects",
    testId: "button-create-project"
  },
  {
    id: "task",
    title: "Task",
    description: "Add new task", 
    icon: CheckSquare,
    route: "/tasks",
    testId: "button-create-task"
  },
  {
    id: "deal",
    title: "Deal",
    description: "New opportunity",
    icon: Handshake, 
    route: "/deals",
    testId: "button-create-deal"
  },
  {
    id: "partner",
    title: "Partner",
    description: "Add client/partner",
    icon: Building,
    route: "/partners", 
    testId: "button-create-partner"
  },
];

export default function CreateModal({ isOpen, onClose }: CreateModalProps) {
  const [, setLocation] = useLocation();

  const handleOptionClick = (route: string) => {
    onClose();
    setLocation(route);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="modal-create">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Create New</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              data-testid="button-close-modal"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-3 mt-4">
          {createOptions.map((option) => {
            const Icon = option.icon;
            
            return (
              <Button
                key={option.id}
                variant="outline"
                className="p-4 h-auto text-left flex flex-col items-start space-y-2 hover:bg-accent transition-colors"
                onClick={() => handleOptionClick(option.route)}
                data-testid={option.testId}
              >
                <Icon className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">{option.title}</p>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </div>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
