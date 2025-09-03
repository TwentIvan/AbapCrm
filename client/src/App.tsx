import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";

import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import OrganizationsPage from "@/pages/organizations-page";
import ProjectsPage from "@/pages/projects-page";
import TasksPage from "@/pages/tasks-page";
import DealsPage from "@/pages/deals-page";
import PartnersPage from "@/pages/partners-page";
import CalendarPage from "@/pages/calendar-page";
import GlobalCalendarPage from "@/pages/global-calendar-page";
import TimesheetPage from "@/pages/timesheet-page";
import TimesheetsPage from "@/pages/timesheets-page";
import MessagesPage from "@/pages/messages-page";
import RateAgreementsPage from "@/pages/rate-agreements-page";
import HumanResourcesPage from "@/pages/human-resources-page";
import SalesOrdersPage from "@/pages/sales-orders-page";
import SapSystemsPage from "@/pages/sap-systems-page";
import { SystemCredentialsPage } from "@/pages/system-credentials-page";
import VpnSystemsPage from "@/pages/vpn-systems-page";
import VPNDiscoveryPage from "@/pages/vpn-discovery-page";
import VPNConnectionsPage from "@/pages/vpn-connections-page";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={HomePage} />
      <ProtectedRoute path="/organizations" component={OrganizationsPage} />
      <ProtectedRoute path="/projects" component={ProjectsPage} />
      <ProtectedRoute path="/tasks" component={TasksPage} />
      <ProtectedRoute path="/deals" component={DealsPage} />
      <ProtectedRoute path="/partners" component={PartnersPage} />
      <ProtectedRoute path="/calendar" component={CalendarPage} />
      <ProtectedRoute path="/planning-calendar" component={GlobalCalendarPage} />
      <ProtectedRoute path="/timesheet" component={TimesheetPage} />
      <ProtectedRoute path="/timesheets" component={TimesheetsPage} />
      <ProtectedRoute path="/messages" component={MessagesPage} />
      <ProtectedRoute path="/rate-agreements" component={RateAgreementsPage} />
      <ProtectedRoute path="/human-resources" component={HumanResourcesPage} />
      <ProtectedRoute path="/sales-orders" component={SalesOrdersPage} />
      <ProtectedRoute path="/sap-systems" component={SapSystemsPage} />
      <ProtectedRoute path="/vpn-systems" component={VpnSystemsPage} />
      <ProtectedRoute path="/vpn-connections" component={VPNConnectionsPage} />
      <ProtectedRoute path="/vpn-discovery" component={VPNDiscoveryPage} />
      <ProtectedRoute path="/system-credentials" component={SystemCredentialsPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/login" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
