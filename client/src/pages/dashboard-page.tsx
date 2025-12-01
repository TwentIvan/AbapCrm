import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getQueryFn } from "@/lib/queryClient";
import { useOrganization } from "@/contexts/organization-context";
import { 
  FolderKanban, 
  CheckSquare, 
  Users, 
  Handshake,
  Calendar,
  FileText,
  TrendingUp,
  Clock
} from "lucide-react";
import { Link } from "wouter";

interface DashboardStats {
  projects: number;
  tasks: number;
  partners: number;
  deals: number;
  pendingTasks: number;
  activeProjects: number;
}

export default function DashboardPage() {
  const { currentOrganization, currentOrganizationId } = useOrganization();

  const { data: projects } = useQuery<any[]>({
    queryKey: ["/api/projects", { orgId: currentOrganizationId }],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: tasks } = useQuery<any[]>({
    queryKey: ["/api/tasks", { orgId: currentOrganizationId }],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: partners } = useQuery<any[]>({
    queryKey: ["/api/partners", { orgId: currentOrganizationId }],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const { data: deals } = useQuery<any[]>({
    queryKey: ["/api/deals", { orgId: currentOrganizationId }],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
  });

  const stats: DashboardStats = {
    projects: projects?.length || 0,
    tasks: tasks?.length || 0,
    partners: partners?.length || 0,
    deals: deals?.length || 0,
    pendingTasks: tasks?.filter((t: any) => t.status === "pending" || t.status === "in_progress")?.length || 0,
    activeProjects: projects?.filter((p: any) => p.status === "active" || p.status === "in_progress")?.length || 0,
  };

  const quickLinks = [
    { title: "Progetti", icon: FolderKanban, href: "/projects", count: stats.projects, color: "text-blue-500" },
    { title: "Task", icon: CheckSquare, href: "/tasks", count: stats.tasks, color: "text-green-500" },
    { title: "Partner", icon: Users, href: "/partners", count: stats.partners, color: "text-purple-500" },
    { title: "Deals", icon: Handshake, href: "/deals", count: stats.deals, color: "text-orange-500" },
    { title: "Calendario", icon: Calendar, href: "/calendar", count: null, color: "text-red-500" },
    { title: "Preventivi", icon: FileText, href: "/quotes", count: null, color: "text-teal-500" },
  ];

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <Header 
          title="Dashboard"
          subtitle={`Benvenuto in ${currentOrganization?.name || "THE HUB UP"}`}
        />
        <main 
          className="p-6 space-y-6 overflow-auto h-[calc(100vh-80px)]"
          style={{ 
            borderTop: '2px solid rgba(30, 64, 175, 0.3)',
            borderLeft: '2px solid rgba(30, 64, 175, 0.3)',
            borderRight: '2px solid rgba(30, 64, 175, 0.3)'
          }}
        >
          {/* Welcome Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground" data-testid="text-welcome">
              Ciao! Ecco un riepilogo della tua attività
            </h2>
            <p className="text-muted-foreground mt-1">
              Organizzazione attuale: <span className="font-medium">{currentOrganization?.name}</span>
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card data-testid="card-active-projects">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Progetti Attivi</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeProjects}</div>
                <p className="text-xs text-muted-foreground">su {stats.projects} totali</p>
              </CardContent>
            </Card>

            <Card data-testid="card-pending-tasks">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Task in Corso</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.pendingTasks}</div>
                <p className="text-xs text-muted-foreground">su {stats.tasks} totali</p>
              </CardContent>
            </Card>

            <Card data-testid="card-partners">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Partner</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.partners}</div>
                <p className="text-xs text-muted-foreground">collaboratori</p>
              </CardContent>
            </Card>

            <Card data-testid="card-deals">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Deals</CardTitle>
                <Handshake className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.deals}</div>
                <p className="text-xs text-muted-foreground">opportunità</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Links */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-4">Accesso Rapido</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {quickLinks.map((link) => (
                <Link key={link.href} href={link.href}>
                  <Card className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/50" data-testid={`link-${link.title.toLowerCase()}`}>
                    <CardContent className="flex flex-col items-center justify-center p-6">
                      <link.icon className={`h-8 w-8 ${link.color} mb-2`} />
                      <span className="font-medium text-sm">{link.title}</span>
                      {link.count !== null && (
                        <span className="text-xs text-muted-foreground mt-1">{link.count} elementi</span>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
