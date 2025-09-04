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
    <div ref={setNodeRef} style={style} {...attributes}>
      <Link href={item.href}>
        <Button
          variant={isActive ? "default" : "ghost"}
          className={cn(
            "w-full justify-start space-x-3 group",
            isActive
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
          data-testid={item.testId}
        >
          <div className="flex items-center space-x-3 flex-1">
            <GripVertical className="h-5 w-5 opacity-60 group-hover:opacity-100 cursor-grab text-muted-foreground" {...listeners} />
            <Icon className="h-6 w-6" />
            <span>{item.name}</span>
          </div>
        </Button>
      </Link>
    </div>
  );
}

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [navigation, setNavigation] = useState(defaultNavigation);
  const [systemsItems, setSystemsItems] = useState(defaultSystemsItems);
  const [timeManagementItems, setTimeManagementItems] = useState(defaultTimeManagementItems);
  const [isTimeManagementOpen, setIsTimeManagementOpen] = useState(
    defaultTimeManagementItems.some(item => location === item.href)
  );
  const [isSystemsOpen, setIsSystemsOpen] = useState(
    defaultSystemsItems.some(item => location === item.href)
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent, items: any[], setItems: any) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex(item => item.id === active.id);
      const newIndex = items.findIndex(item => item.id === over.id);
      setItems(arrayMove(items, oldIndex, newIndex));
    }
  }

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
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
          onDragEnd={(event) => handleDragEnd(event, navigation, setNavigation)}
        >
          <SortableContext items={navigation.map(item => item.id)} strategy={verticalListSortingStrategy}>
            {navigation.map((item) => {
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
              "w-full justify-start space-x-3",
              "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => setIsSystemsOpen(!isSystemsOpen)}
            data-testid="nav-systems"
          >
            <Shield className="h-6 w-6" />
            <span>Systems</span>
            {isSystemsOpen ? (
              <ChevronDown className="h-4 w-4 ml-auto" />
            ) : (
              <ChevronRight className="h-4 w-4 ml-auto" />
            )}
          </Button>
          
          {isSystemsOpen && (
            <div className="ml-6 space-y-1">
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => handleDragEnd(event, systemsItems, setSystemsItems)}
              >
                <SortableContext items={systemsItems.map(item => item.id)} strategy={verticalListSortingStrategy}>
                  {systemsItems.map((item) => {
                    const isActive = location === item.href;
                    return (
                      <SortableNavItem key={item.id} item={item} isActive={isActive} />
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
              "w-full justify-start space-x-3",
              "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => setIsTimeManagementOpen(!isTimeManagementOpen)}
            data-testid="nav-time-management"
          >
            <Clock className="h-6 w-6" />
            <span>Time Management</span>
            {isTimeManagementOpen ? (
              <ChevronDown className="h-4 w-4 ml-auto" />
            ) : (
              <ChevronRight className="h-4 w-4 ml-auto" />
            )}
          </Button>
          
          {isTimeManagementOpen && (
            <div className="ml-6 space-y-1">
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => handleDragEnd(event, timeManagementItems, setTimeManagementItems)}
              >
                <SortableContext items={timeManagementItems.map(item => item.id)} strategy={verticalListSortingStrategy}>
                  {timeManagementItems.map((item) => {
                    const isActive = location === item.href;
                    return (
                      <SortableNavItem key={item.id} item={item} isActive={isActive} />
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
