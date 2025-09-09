import { useLocation } from "wouter";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import AccountSettingsDialog from "@/components/account/account-settings-dialog";

export default function AccountPage() {
  const [location] = useLocation();
  
  // Route detection for full-page mode
  const isFullPageMode = location.startsWith("/account");
  
  // Handle full-page mode: when user navigates directly to /account or /account/settings
  if (isFullPageMode) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header 
            title="Impostazioni Account"
            subtitle="Gestisci le informazioni del tuo account e le configurazioni email"
          />
          <main className="flex-1 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto">
              {/* Render the account settings dialog content in full screen */}
              <div className="space-y-6">
                <AccountSettingsDialog 
                  open={true}
                  onOpenChange={() => {
                    // Navigate back to main page when closed
                    window.location.href = "/";
                  }}
                />
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }
  
  // This should not happen since all /account routes should be full-page
  return <div>Caricamento...</div>;
}