import { useState } from "react";
import GlobalPlanningCalendar from "@/components/calendar/global-planning-calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PlanningWindowForm from "@/components/forms/planning-window-form";
import { PlanningWindow } from "@shared/schema";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";

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
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <Header 
          title="Global Planning Calendar"
          subtitle="View all project planning windows across your workspace with hierarchical organization"
          onNewClick={() => setShowPlanningWindowDialog(true)}
        />
        <main className="p-6 space-y-6">
          <GlobalPlanningCalendar onWindowSelect={handleWindowSelect} />
        </main>
      </div>


      {/* Planning Window Dialog */}
      <Dialog open={showPlanningWindowDialog} onOpenChange={handleClosePlanningWindowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingPlanningWindow ? "Edit Planning Window" : "New Planning Window"}
            </DialogTitle>
          </DialogHeader>
          <PlanningWindowForm
            projectId={editingPlanningWindow?.projectId}
            planningWindow={editingPlanningWindow}
            onSuccess={handleClosePlanningWindowDialog}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}