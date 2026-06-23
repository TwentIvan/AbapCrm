import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import StatsCards from "@/components/dashboard/stats-cards";
import RecentProjects from "@/components/dashboard/recent-projects";
import UpcomingTasks from "@/components/dashboard/upcoming-tasks";
import DealPipeline from "@/components/dashboard/deal-pipeline";
import RecentActivity from "@/components/dashboard/recent-activity";
import CreateModal from "@/components/modals/create-modal";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, AlertCircle } from "lucide-react";

export default function HomePage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { user } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Dashboard" 
          subtitle="Welcome back, manage your freelance business"
          onNewClick={() => setShowCreateModal(true)}
        />
        
        {/* Email Verification Banner */}
        {user && !user.isEmailVerified && (
          <div className="mx-6 mt-6">
            <Alert className="border-warning/30 bg-warning/10 dark:border-amber-900 dark:bg-amber-950">
              <AlertCircle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Mail className="h-4 w-4" />
                    <span>
                      <strong>Email non verificata:</strong> Controlla la tua email e clicca sul link di conferma per attivare tutte le funzionalità.
                    </span>
                  </div>
                  <span className="text-xs opacity-75">
                    In sviluppo: controlla i log del server per il link di verifica
                  </span>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}
        
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
