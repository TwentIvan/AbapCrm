import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, createBadgeColumn, createTextColumn } from "@/components/ui/data-table";
import { Edit, FileText, Euro, Calendar, Building } from "lucide-react";
import { SalesOrder, Partner } from "@shared/schema";

const statusColors = {
  draft: "bg-gray-100 text-gray-800",
  sent: "bg-blue-100 text-blue-800", 
  accepted: "bg-green-100 text-green-800",
  invoiced: "bg-purple-100 text-purple-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function SalesOrdersPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingOrder, setEditingOrder] = useState<SalesOrder | null>(null);
  
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: salesOrders, isLoading } = useQuery<SalesOrder[]>({
    queryKey: ["/api/sales-orders"],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch("/api/sales-orders", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch sales orders');
      return res.json();
    },
  });

  const { data: partners } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch("/api/partners", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch partners');
      return res.json();
    },
  });

  const clients = partners?.filter(partner => partner.type === "client") || [];

  const handleEditOrder = (order: SalesOrder) => {
    setEditingOrder(order);
    setShowEditDialog(true);
  };

  const handleCloseEditDialog = () => {
    setShowEditDialog(false);
    setEditingOrder(null);
  };


  // Define table columns
  const tableColumns = [
    {
      accessorKey: 'orderNumber',
      header: 'Order Number',
      cell: ({ row }: any) => (
        <div className="font-mono text-sm" data-testid={`text-order-number-${row.original.id}`}>
          {row.original.orderNumber}
        </div>
      ),
    },
    {
      accessorKey: 'partnerId',
      header: 'Client',
      cell: ({ row }: any) => {
        const order = row.original;
        const client = clients.find(c => c.id === order.partnerId);
        return client ? (
          <div className="flex items-center gap-2">
            <Building className="h-4 w-4 text-muted-foreground" />
            <span data-testid={`text-order-client-${order.id}`}>{client.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">Unknown Client</span>
        );
      },
    },
    createBadgeColumn('status', 'Status', statusColors),
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }: any) => (
        <div className="flex items-center gap-1 font-medium">
          <Euro className="h-4 w-4 text-muted-foreground" />
          <span data-testid={`text-order-total-${row.original.id}`}>
            €{parseFloat(row.original.total).toFixed(2)}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'issueDate',
      header: 'Issue Date',
      cell: ({ row }: any) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span data-testid={`text-order-date-${row.original.id}`}>
            {new Date(row.original.issueDate).toLocaleDateString()}
          </span>
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }: any) => {
        const order = row.original;
        return (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEditOrder(order)}
              data-testid={`button-edit-order-${order.id}`}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid={`button-view-order-${order.id}`}
            >
              <FileText className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  if (isLoading) {
    return <div>Loading sales orders...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header
        title="Sales Orders"
        subtitle="Manage your sales orders and invoices"
        onNewClick={() => setShowCreateDialog(true)}
      />
      
      <main className="container mx-auto px-6 py-8">
        <DataTable
          data={salesOrders || []}
          columns={tableColumns}
          tableId="sales-orders"
        />
      </main>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Sales Order</DialogTitle>
            <DialogDescription>
              Create a new sales order from timesheet entries.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4">
            <p className="text-sm text-muted-foreground">
              Sales order creation from timesheet entries will be implemented here.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={handleCloseEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Sales Order</DialogTitle>
            <DialogDescription>
              Edit the details of this sales order.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4">
            <p className="text-sm text-muted-foreground">
              Sales order editing will be implemented here.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}