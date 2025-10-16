import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { AuthProvider } from "@/hooks/use-auth";
import { I18nProvider } from "@/lib/i18n";
import { OrganizationProvider } from "@/contexts/organization-context";
import { ProtectedRoute } from "./lib/protected-route";

import AuthPage from "@/pages/auth-page";
import OrganizationsPage from "@/pages/organizations-page";
import ProjectsPage from "@/pages/projects-page";
import TasksPage from "@/pages/tasks-page";
import PartnersPage from "@/pages/partners-page";
import ContactsPage from "@/pages/contacts-page";
import CalendarPage from "@/pages/calendar-page";
import GlobalCalendarPage from "@/pages/global-calendar-page";
import TimesheetPage from "@/pages/timesheet-page";
import TimesheetsPage from "@/pages/timesheets-page";
import MessagesPage from "@/pages/messages-page";
import ProposalsPage from "@/pages/proposals-page";
import RateAgreementsPage from "@/pages/rate-agreements-page";
import HumanResourcesPage from "@/pages/human-resources-page";
import SalesOrdersPage from "@/pages/sales-orders-page";
import ProjectAssignmentsPage from "@/pages/project-assignments-page";
import ProjectMilestonesPage from "@/pages/project-milestones-page";
import PurchaseOrdersPage from "@/pages/purchase-orders-page";
import SapSystemsPage from "@/pages/sap-systems-page";
import SapTransportPage from "@/pages/sap-transport-page";
import { SystemCredentialsPage } from "@/pages/system-credentials-page";
import VPNConnectionsPage from "@/pages/vpn-connections-page";
import EmailAccountsPage from "@/pages/email-accounts-page";
import AccountPage from "@/pages/account-page";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={OrganizationsPage} />
      <ProtectedRoute path="/organizations" component={OrganizationsPage} />
      <ProtectedRoute path="/projects" component={ProjectsPage} />
      <ProtectedRoute path="/projects/new" component={ProjectsPage} />
      <ProtectedRoute path="/projects/:id/edit" component={ProjectsPage} />
      <ProtectedRoute path="/tasks" component={TasksPage} />
      <ProtectedRoute path="/tasks/new" component={TasksPage} />
      <ProtectedRoute path="/tasks/:id/edit" component={TasksPage} />
      <ProtectedRoute path="/partners" component={PartnersPage} />
      <ProtectedRoute path="/partners/new" component={PartnersPage} />
      <ProtectedRoute path="/partners/:id/edit" component={PartnersPage} />
      <ProtectedRoute path="/contacts" component={ContactsPage} />
      <ProtectedRoute path="/calendar" component={CalendarPage} />
      <ProtectedRoute path="/planning-calendar" component={GlobalCalendarPage} />
      <ProtectedRoute path="/timesheet" component={TimesheetPage} />
      <ProtectedRoute path="/timesheets" component={TimesheetsPage} />
      <ProtectedRoute path="/messages" component={MessagesPage} />
      <ProtectedRoute path="/proposals" component={ProposalsPage} />
      <ProtectedRoute path="/rate-agreements" component={RateAgreementsPage} />
      <ProtectedRoute path="/human-resources" component={HumanResourcesPage} />
      <ProtectedRoute path="/sales-orders" component={SalesOrdersPage} />
      <ProtectedRoute path="/project-assignments" component={ProjectAssignmentsPage} />
      <ProtectedRoute path="/project-milestones" component={ProjectMilestonesPage} />
      <ProtectedRoute path="/purchase-orders" component={PurchaseOrdersPage} />
      <ProtectedRoute path="/sap-systems" component={SapSystemsPage} />
      <ProtectedRoute path="/sap-systems/new" component={SapSystemsPage} />
      <ProtectedRoute path="/sap-systems/:id/edit" component={SapSystemsPage} />
      <ProtectedRoute path="/sap-transport" component={SapTransportPage} />
      <ProtectedRoute path="/vpn-connections" component={VPNConnectionsPage} />
      <ProtectedRoute path="/vpn-connections/new" component={VPNConnectionsPage} />
      <ProtectedRoute path="/vpn-connections/:id/edit" component={VPNConnectionsPage} />
      <ProtectedRoute path="/system-credentials" component={SystemCredentialsPage} />
      <ProtectedRoute path="/system-credentials/new" component={SystemCredentialsPage} />
      <ProtectedRoute path="/system-credentials/:id/edit" component={SystemCredentialsPage} />
      <ProtectedRoute path="/email-accounts" component={EmailAccountsPage} />
      <ProtectedRoute path="/email-accounts/new" component={EmailAccountsPage} />
      <ProtectedRoute path="/email-accounts/:id/edit" component={EmailAccountsPage} />
      <ProtectedRoute path="/account" component={AccountPage} />
      <ProtectedRoute path="/account/settings" component={AccountPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/login" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <OrganizationProvider>
            <I18nProvider>
              <TooltipProvider>
                <Toaster />
                <Router />
              </TooltipProvider>
            </I18nProvider>
          </OrganizationProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
