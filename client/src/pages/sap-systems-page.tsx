import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTableLayout } from "@/lib/user-preferences";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, createBadgeColumn, createTextColumn } from "@/components/ui/data-table";
import { LayoutManager } from "@/components/ui/layout-manager";
import { TableConfiguration } from "@/components/ui/table-configuration";
import { Server, Building, MoreHorizontal, Grid3X3, List, Edit, Trash2, Key, Wifi, Upload } from "lucide-react";
import { SapSystem } from "@shared/schema";
import SapSystemForm from "../components/forms/sap-system-form";
import SapLandscapeImport from "../components/forms/sap-landscape-import";

const landscapeColors = {
  development: "bg-blue-100 text-blue-800",
  test: "bg-yellow-100 text-yellow-800",
  production: "bg-red-100 text-red-800",
};

const landscapeLabels = {
  development: "Development",
  test: "Test",
  production: "Production",
};

export default function SapSystemsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedSystem, setSelectedSystem] = useState<SapSystem | null>(null);
  const [selectedSystems, setSelectedSystems] = useState<SapSystem[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [editingLayout, setEditingLayout] = useState<any>(null);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use the table layout hook for persistent preferences
  const { 
    layout, 
    currentLayoutName,
    savedLayouts,
    updateLayout, 
    saveLayoutAs,
    loadLayout,
    renameLayout,
    deleteLayout,
    updateExistingLayout,
  } = useTableLayout('sap-systems');
  const viewMode = layout.viewMode;

  const { data: systems, isLoading } = useQuery<SapSystem[]>({
    queryKey: ["/api/sap-systems"],
    queryFn: async () => {
      const res = await fetch("/api/sap-systems", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch SAP systems');
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (systemId: string) => {
      const response = await fetch(`/api/sap-systems/${systemId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to delete SAP system');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sap-systems"] });
      toast({
        title: "SAP System Deleted",
        description: "The SAP system has been successfully deleted.",
      });
      setShowDeleteDialog(false);
      setSelectedSystem(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Unable to delete the SAP system.",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (systemIds: string[]) => {
      const promises = systemIds.map(id => 
        fetch(`/api/sap-systems/${id}`, {
          method: 'DELETE',
          credentials: 'include'
        })
      );
      const responses = await Promise.all(promises);
      
      // Check if all deletions were successful
      const failed = responses.filter(res => !res.ok);
      if (failed.length > 0) {
        throw new Error(`Failed to delete ${failed.length} SAP system(s)`);
      }
      return responses;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sap-systems"] });
      toast({
        title: "SAP Systems Deleted",
        description: `${selectedSystems.length} SAP systems deleted successfully.`,
      });
      setSelectedSystems([]);
      setShowBulkDeleteDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Unable to delete selected SAP systems.",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (system: SapSystem) => {
    setSelectedSystem(system);
    setShowEditDialog(true);
  };

  const handleDelete = (system: SapSystem) => {
    setSelectedSystem(system);
    setShowDeleteDialog(true);
  };

  const handleFormClose = () => {
    setShowCreateDialog(false);
    setShowEditDialog(false);
    setSelectedSystem(null);
  };

  // Define columns for the table
  const columns = [
    {
      accessorKey: "name",
      header: "System Name",
      cell: ({ row }: any) => row.original.name,
    },
    {
      accessorKey: "systemNumber",
      header: "System Number",
      cell: ({ row }: any) => row.original.systemNumber,
    },
    {
      accessorKey: "serverHost",
      header: "Server Host",
      cell: ({ row }: any) => row.original.serverHost,
    },
    {
      accessorKey: "landscape",
      header: "Landscape",
      cell: ({ row }: any) => {
        const system = row.original;
        const landscapeValue = landscapeLabels[system.landscape as keyof typeof landscapeLabels] || system.landscape;
        const colorClass = landscapeColors[system.landscape as keyof typeof landscapeColors] || "bg-gray-100 text-gray-800";
        return (
          <Badge className={colorClass}>
            {landscapeValue}
          </Badge>
        );
      },
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }: any) => row.original.description || "—",
    },
    {
      accessorKey: "actions",
      header: "Actions",
      cell: ({ row }: any) => {
        const system = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" data-testid={`dropdown-sap-system-${system.id}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleEdit(system)} data-testid={`edit-sap-system-${system.id}`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDelete(system)} data-testid={`delete-sap-system-${system.id}`}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  // Grid view for card layout
  const renderGrid = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {systems?.map((system) => (
        <Card key={system.id} className="h-fit" data-testid={`card-sap-system-${system.id}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Server className="h-5 w-5" />
              {system.name}
            </CardTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" data-testid={`dropdown-sap-system-${system.id}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEdit(system)} data-testid={`edit-sap-system-${system.id}`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDelete(system)} data-testid={`delete-sap-system-${system.id}`}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">System Number:</span>
                <Badge variant="outline" data-testid={`text-system-number-${system.id}`}>{system.systemNumber}</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Landscape:</span>
                <Badge 
                  className={landscapeColors[system.landscape as keyof typeof landscapeColors] || "bg-gray-100 text-gray-800"}
                  data-testid={`text-landscape-${system.id}`}
                >
                  {landscapeLabels[system.landscape as keyof typeof landscapeLabels] || system.landscape}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Server Host:</span>
                <span className="text-sm text-gray-600" data-testid={`text-server-host-${system.id}`}>
                  {system.serverHost}
                </span>
              </div>
              
              {system.description && (
                <div className="pt-2">
                  <span className="text-sm font-medium">Description:</span>
                  <p className="text-sm text-gray-600 mt-1" data-testid={`text-description-${system.id}`}>
                    {system.description}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderTable = () => (
    <DataTable
      data={systems || []}
      columns={columns}
      enableSelection={true}
      onSelectionChange={(rows) => setSelectedSystems(rows as SapSystem[])}
      searchKey="name"
      searchPlaceholder="Search SAP systems..."
      tableId="sap-systems"
      data-testid="table-sap-systems"
    />
  );

  if (isLoading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header 
            title="SAP Systems" 
            subtitle="Manage your SAP system configurations and connections"
            onNewClick={() => setShowCreateDialog(true)}
          />
          <main className="flex-1 overflow-y-auto p-6">
            <div className="space-y-6">
              <Skeleton className="h-8 w-48" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-48" />
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title="SAP Systems" 
          subtitle="Manage your SAP system configurations and connections"
          onNewClick={() => setShowCreateDialog(true)}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">SAP Systems</h1>
                <p className="text-gray-600">Manage your SAP system configurations and connections</p>
              </div>
              
              <div className="flex items-center gap-3">
                {selectedSystems.length > 0 && (
                  <Button 
                    variant="destructive" 
                    onClick={() => setShowBulkDeleteDialog(true)}
                    data-testid="button-bulk-delete"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Selected ({selectedSystems.length})
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  onClick={() => setShowConfigDialog(true)}
                  data-testid="button-table-config"
                  disabled
                >
                  <Grid3X3 className="mr-2 h-4 w-4" />
                  Configure (Coming Soon)
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={() => updateLayout({ viewMode: viewMode === 'list' ? 'cards' : 'list' })}
                  data-testid="button-toggle-view"
                >
                  {viewMode === 'cards' ? <List className="mr-2 h-4 w-4" /> : <Grid3X3 className="mr-2 h-4 w-4" />}
                  {viewMode === 'cards' ? 'List View' : 'Card View'}
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={() => setShowImportDialog(true)} 
                  data-testid="button-import-xml"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Import from XML
                </Button>
                
                <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-sap-system">
                  <Server className="mr-2 h-4 w-4" />
                  Add SAP System
                </Button>
              </div>
            </div>

            {/* Layout Manager - Simplified for now */}
            <div className="text-sm text-gray-500 mb-4">
              Current layout: {currentLayoutName || 'Default'}
            </div>

            {viewMode === 'cards' ? renderGrid() : renderTable()}
          </div>
        </main>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog || showEditDialog} onOpenChange={() => handleFormClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {showEditDialog ? "Edit SAP System" : "Add New SAP System"}
            </DialogTitle>
            <DialogDescription>
              {showEditDialog 
                ? "Update the SAP system configuration and connection details."
                : "Create a new SAP system configuration for your environment."
              }
            </DialogDescription>
          </DialogHeader>
          <SapSystemForm
            system={selectedSystem}
            onSuccess={handleFormClose}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SAP System</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedSystem?.name}"? This action cannot be undone.
              All associated credentials and transport requests will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedSystem && deleteMutation.mutate(selectedSystem.id)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected SAP Systems</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedSystems.length} selected SAP systems? This action cannot be undone.
              All associated credentials and transport requests will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(selectedSystems.map(s => s.id))}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-bulk-delete"
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Table Configuration Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Table Configuration</DialogTitle>
            <DialogDescription>
              Customize your table layout and save different configurations.
            </DialogDescription>
          </DialogHeader>
          {/* Table Configuration - Simplified for now */}
          <div className="p-4">
            <p>Table configuration will be available soon.</p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowConfigDialog(false)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import from XML Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import SAP Systems from XML</DialogTitle>
            <DialogDescription>
              Upload and import SAP system configurations from a SAPUILandscape.xml file.
            </DialogDescription>
          </DialogHeader>
          <SapLandscapeImport
            onSuccess={() => setShowImportDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}