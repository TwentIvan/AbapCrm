import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Code, BarChart3, FolderOpen, CheckSquare, Handshake, Building, Calendar, Clock, User, LogOut, FolderTree, Mail, DollarSign, Users, FileText, Server, Key, Shield, Wifi, Radar, ChevronRight, ChevronDown, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import hubUpLogo from "@assets/generated_images/hub_up_logo.png";
import ImageContainer from "@/components/ui/image-container";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Main navigation (Organizations già rimosso dalla lista principale)
const defaultNavigation = [
  { id: "1", name: "Projects", href: "/projects", icon: FolderOpen, testId: "nav-projects" },
  { id: "2", name: "Tasks", href: "/tasks", icon: CheckSquare, testId: "nav-tasks" },
  { id: "3", name: "Partners", href: "/partners", icon: Handshake, testId: "nav-partners" },
  { id: "4", name: "Sales Orders", href: "/sales-orders", icon: FileText, testId: "nav-sales-orders" },
  { id: "5", name: "Rate Agreements", href: "/rate-agreements", icon: DollarSign, testId: "nav-rate-agreements" },
  { id: "6", name: "Human Resources", href: "/human-resources", icon: Users, testId: "nav-human-resources" },
];

// Systems group
const defaultSystemsItems = [
  { id: "s1", name: "SAP Systems", href: "/sap-systems", icon: Server, testId: "nav-sap-systems" },
  { id: "s2", name: "VPN Connections", href: "/vpn-connections", icon: Wifi, testId: "nav-vpn-connections" },
  { id: "s3", name: "System Credentials", href: "/system-credentials", icon: Key, testId: "nav-system-credentials" },
];

const defaultTimeManagementItems = [
  { id: "t1", name: "Time Entries", href: "/timesheet", icon: Clock, testId: "nav-timesheet" },
  { id: "t2", name: "Timesheets", href: "/timesheets", icon: Clock, testId: "nav-timesheets" },
];

// Sortable Navigation Item Component
function SortableNavItem({ item, isActive }: { item: any; isActive: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = item.icon;

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={cn(
        "w-full p-2 rounded-md group flex items-center space-x-4 cursor-pointer transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
      data-testid={item.testId}
      {...attributes}
      onClick={() => window.location.href = item.href}
    >
      <GripVertical 
        className="h-6 w-6 opacity-80 group-hover:opacity-100 cursor-grab text-muted-foreground flex-shrink-0" 
        {...listeners} 
      />
      <Icon className="h-6 w-6 flex-shrink-0" />
      <span className="text-base font-medium">{item.name}</span>
    </div>
  );
}

// Sortable Sub-Navigation Item Component (smaller)
function SortableSubNavItem({ item, isActive }: { item: any; isActive: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = item.icon;

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={cn(
        "w-full p-2 rounded-md group flex items-center space-x-4 cursor-pointer transition-colors ml-4",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
      data-testid={item.testId}
      {...attributes}
      onClick={() => window.location.href = item.href}
    >
      <GripVertical 
        className="h-5 w-5 opacity-80 group-hover:opacity-100 cursor-grab text-muted-foreground flex-shrink-0" 
        {...listeners} 
      />
      <Icon className="h-5 w-5 flex-shrink-0" />
      <span className="text-sm">{item.name}</span>
    </div>
  );
}

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [navigation, setNavigation] = useState(() => {
    const saved = localStorage.getItem('sidebar-main-order');
    if (saved) {
      try {
        const order = JSON.parse(saved);
        return order.map((id: string) => defaultNavigation.find(item => item.id === id)).filter(Boolean);
      } catch {}
    }
    return defaultNavigation;
  });
  const [systemsItems, setSystemsItems] = useState(() => {
    const saved = localStorage.getItem('sidebar-systems-order');
    if (saved) {
      try {
        const order = JSON.parse(saved);
        return order.map((id: string) => defaultSystemsItems.find(item => item.id === id)).filter(Boolean);
      } catch {}
    }
    return defaultSystemsItems;
  });
  const [timeManagementItems, setTimeManagementItems] = useState(() => {
    const saved = localStorage.getItem('sidebar-time-order');
    if (saved) {
      try {
        const order = JSON.parse(saved);
        return order.map((id: string) => defaultTimeManagementItems.find(item => item.id === id)).filter(Boolean);
      } catch {}
    }
    return defaultTimeManagementItems;
  });
  const [isTimeManagementOpen, setIsTimeManagementOpen] = useState(
    defaultTimeManagementItems.some(item => location === item.href)
  );
  const [isSystemsOpen, setIsSystemsOpen] = useState(
    defaultSystemsItems.some(item => location === item.href)
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent, items: any[], setItems: any, storageKey: string) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex(item => item.id === active.id);
      const newIndex = items.findIndex(item => item.id === over.id);
      const newItems = arrayMove(items, oldIndex, newIndex);
      setItems(newItems);
      
      // Save order to localStorage
      localStorage.setItem(storageKey, JSON.stringify(newItems.map(item => item.id)));
    }
  }

  return (
    <aside className="w-80 bg-card border-r border-border flex flex-col">
      {/* Logo and Brand */}
      <div className="p-6 border-b border-border">
        <div className="flex justify-center">
          <ImageContainer
            src={hubUpLogo}
            alt="The Hub Up"
            fallbackType="logo"
            size="custom"
            containerClassName="w-64 h-44"
            data-testid="img-app-logo"
          />
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-2">
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => handleDragEnd(event, navigation, setNavigation, 'sidebar-main-order')}
        >
          <SortableContext items={navigation.map((item: any) => item.id)} strategy={verticalListSortingStrategy}>
            {navigation.map((item: any) => {
              const isActive = location === item.href;
              return (
                <SortableNavItem key={item.id} item={item} isActive={isActive} />
              );
            })}
          </SortableContext>
        </DndContext>
        
        {/* Systems Section */}
        <div className="space-y-1">
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start space-x-4 h-auto p-0",
              "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => setIsSystemsOpen(!isSystemsOpen)}
            data-testid="nav-systems"
          >
            <div className="w-full p-2 rounded-md flex items-center space-x-4 cursor-pointer">
              <GripVertical className="h-6 w-6 opacity-80 hover:opacity-100 cursor-grab text-muted-foreground flex-shrink-0" style={{ width: '1.5rem', height: '1.5rem' }} />
              <Shield className="h-6 w-6" style={{ width: '1.5rem', height: '1.5rem' }} />
              <span className="text-base font-medium">Systems</span>
              {isSystemsOpen ? (
                <ChevronDown className="h-6 w-6 ml-auto" />
              ) : (
                <ChevronRight className="h-6 w-6 ml-auto" />
              )}
            </div>
          </Button>
          
          {isSystemsOpen && (
            <div className="space-y-1">
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => handleDragEnd(event, systemsItems, setSystemsItems, 'sidebar-systems-order')}
              >
                <SortableContext items={systemsItems.map((item: any) => item.id)} strategy={verticalListSortingStrategy}>
                  {systemsItems.map((item: any) => {
                    const isActive = location === item.href;
                    return (
                      <SortableSubNavItem key={item.id} item={item} isActive={isActive} />
                    );
                  })}
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>

        {/* Time Management Section */}
        <div className="space-y-1">
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start space-x-4 h-auto p-0",
              "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => setIsTimeManagementOpen(!isTimeManagementOpen)}
            data-testid="nav-time-management"
          >
            <div className="w-full p-2 rounded-md flex items-center space-x-4 cursor-pointer">
              <GripVertical className="h-6 w-6 opacity-80 hover:opacity-100 cursor-grab text-muted-foreground flex-shrink-0" style={{ width: '1.5rem', height: '1.5rem' }} />
              <Clock className="h-6 w-6" style={{ width: '1.5rem', height: '1.5rem' }} />
              <span className="text-base font-medium">Time Management</span>
              {isTimeManagementOpen ? (
                <ChevronDown className="h-6 w-6 ml-auto" />
              ) : (
                <ChevronRight className="h-6 w-6 ml-auto" />
              )}
            </div>
          </Button>
          
          {isTimeManagementOpen && (
            <div className="space-y-1">
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => handleDragEnd(event, timeManagementItems, setTimeManagementItems, 'sidebar-time-order')}
              >
                <SortableContext items={timeManagementItems.map((item: any) => item.id)} strategy={verticalListSortingStrategy}>
                  {timeManagementItems.map((item: any) => {
                    const isActive = location === item.href;
                    return (
                      <SortableSubNavItem key={item.id} item={item} isActive={isActive} />
                    );
                  })}
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center space-x-3 p-3 rounded-md hover:bg-accent transition-colors">
          <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate" data-testid="text-user-name">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-muted-foreground truncate" data-testid="text-user-email">
              {user?.email}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logoutMutation.mutate()}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
