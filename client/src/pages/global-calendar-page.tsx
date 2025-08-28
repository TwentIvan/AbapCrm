import { useState } from "react";
import GlobalPlanningCalendar from "@/components/calendar/global-planning-calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PlanningWindowForm from "@/components/forms/planning-window-form";
import { PlanningWindow } from "@shared/schema";

export default function GlobalCalendarPage() {
  const [showPlanningWindowDialog, setShowPlanningWindowDialog] = useState(false);
  const [editingPlanningWindow, setEditingPlanningWindow] = useState<PlanningWindow | null>(null);

  const handleWindowSelect = (window: PlanningWindow) => {
    setEditingPlanningWindow(window);
    setShowPlanningWindowDialog(true);
  };

  const handleClosePlanningWindowDialog = () => {
    setShowPlanningWindowDialog(false);
    setEditingPlanningWindow(null);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Global Planning Calendar</h1>
        <p className="text-muted-foreground">
          View all project planning windows across your workspace with hierarchical organization
        </p>
      </div>

      <GlobalPlanningCalendar onWindowSelect={handleWindowSelect} />

      {/* Planning Window Dialog */}
      <Dialog open={showPlanningWindowDialog} onOpenChange={handleClosePlanningWindowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Edit Planning Window
            </DialogTitle>
          </DialogHeader>
          {editingPlanningWindow && (
            <PlanningWindowForm
              projectId={editingPlanningWindow.projectId}
              planningWindow={editingPlanningWindow}
              onSuccess={handleClosePlanningWindowDialog}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}