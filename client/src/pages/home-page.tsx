import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import StatsCards from "@/components/dashboard/stats-cards";
import RecentProjects from "@/components/dashboard/recent-projects";
import UpcomingTasks from "@/components/dashboard/upcoming-tasks";
import DealPipeline from "@/components/dashboard/deal-pipeline";
import RecentActivity from "@/components/dashboard/recent-activity";
import CreateModal from "@/components/modals/create-modal";
import { useState } from "react";

export default function HomePage() {
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Dashboard" 
          subtitle="Welcome back, manage your freelance business"
          onNewClick={() => setShowCreateModal(true)}
        />
        
        <div className="p-6 space-y-6">
          <StatsCards />
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <RecentProjects />
            </div>
            <div className="space-y-6">
              <UpcomingTasks />
              <DealPipeline />
            </div>
          </div>

          <RecentActivity />
        </div>
      </main>
      
      <CreateModal 
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}
