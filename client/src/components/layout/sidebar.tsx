import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Code, BarChart3, FolderOpen, CheckSquare, Handshake, Building, Calendar, Clock, User, LogOut, FolderTree, Mail, DollarSign, Users, FileText, Server, Key, Shield, Wifi, Radar, Plus, Minus, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import newLogo from "@assets/thu solo logo_1757017376100.jpg";
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
const getDefaultNavigation = (t: any) => [
  { id: "1", name: t("nav.projects"), href: "/projects", icon: FolderOpen, testId: "nav-projects" },
  { id: "2", name: t("nav.tasks"), href: "/tasks", icon: CheckSquare, testId: "nav-tasks" },
  { id: "3", name: t("nav.partners"), href: "/partners", icon: Handshake, testId: "nav-partners" },
  { id: "4", name: t("nav.salesOrders"), href: "/sales-orders", icon: FileText, testId: "nav-sales-orders" },
  { id: "5", name: t("nav.rateAgreements"), href: "/rate-agreements", icon: DollarSign, testId: "nav-rate-agreements" },
  { id: "6", name: t("nav.humanResources"), href: "/human-resources", icon: Users, testId: "nav-human-resources" },
];

// Systems group
const getDefaultSystemsItems = (t: any) => [
  { id: "s1", name: t("nav.sapSystems"), href: "/sap-systems", icon: Server, testId: "nav-sap-systems" },
  { id: "s2", name: t("nav.vpnConnections"), href: "/vpn-connections", icon: Wifi, testId: "nav-vpn-connections" },
  { id: "s3", name: t("nav.systemCredentials"), href: "/system-credentials", icon: Key, testId: "nav-system-credentials" },
];

const getDefaultTimeManagementItems = (t: any) => [
  { id: "t1", name: t("nav.timeEntries"), href: "/timesheet", icon: Clock, testId: "nav-timesheet" },
  { id: "t2", name: t("nav.timesheets"), href: "/timesheets", icon: Clock, testId: "nav-timesheets" },
];

// Parent sections
const getDefaultParentItems = (t: any) => [
  { id: "p1", name: t("nav.systems"), icon: Shield, testId: "nav-systems", type: "systems" },
  { id: "p2", name: t("nav.timeManagement"), icon: Clock, testId: "nav-time-management", type: "timeManagement" },
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
        "w-full p-2 rounded-md group flex items-center space-x-4 cursor-pointer transition-colors sidebar-nav-item",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground"
      )}
      data-testid={item.testId}
      {...attributes}
      onClick={() => window.location.href = item.href}
    >
      <GripVertical 
        className="h-6 w-6 opacity-80 group-hover:opacity-100 cursor-grab text-muted-foreground flex-shrink-0" 
        {...listeners} 
      />
      <div className="flex items-center px-3 py-2 rounded-full nav-box transition-colors flex-1" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', minWidth: '240px', maxWidth: '240px' }}>
        <Icon className="h-5 w-5 flex-shrink-0 mr-3" style={{ color: 'rgba(59, 130, 246, 0.9)' }} />
        <span className="text-base font-medium flex-1" style={{ color: 'rgba(59, 130, 246, 0.9)' }}>{item.name}</span>
        <div className="ml-2 w-6 h-6 opacity-0" />
      </div>
    </div>
  );
}

// Sortable Parent Item Component (with expand/collapse button)
function SortableParentItem({ item, children, isOpen, onToggle }: { item: any; children: React.ReactNode; isOpen: boolean; onToggle: () => void }) {
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
    <div className="space-y-1">
      <div 
        ref={setNodeRef} 
        style={style} 
        className={cn(
          "w-full p-2 rounded-md group flex items-center space-x-3 cursor-pointer transition-colors sidebar-nav-item",
          "text-muted-foreground"
        )}
        data-testid={item.testId}
        {...attributes}
      >
        <GripVertical 
          className="h-6 w-6 opacity-80 group-hover:opacity-100 cursor-grab text-muted-foreground flex-shrink-0" 
          {...listeners} 
        />
        <div className="flex items-center px-3 py-2 rounded-full nav-box transition-colors flex-1" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', minWidth: '240px', maxWidth: '240px' }}>
          <Icon className="h-6 w-6 flex-shrink-0 mr-3" style={{ color: 'rgba(59, 130, 246, 0.9)' }} />
          <span className="text-base font-medium flex-1" style={{ color: 'rgba(59, 130, 246, 0.9)' }}>{item.name}</span>
          <button 
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="ml-2 w-6 h-6 rounded-full border border-current hover:bg-white/20 transition-colors flex items-center justify-center"
            style={{ borderColor: 'rgba(59, 130, 246, 0.9)', color: 'rgba(59, 130, 246, 0.9)' }}
          >
            {isOpen ? (
              <Minus className="h-3 w-3" style={{ color: 'rgba(59, 130, 246, 0.9)' }} />
            ) : (
              <Plus className="h-3 w-3" style={{ color: 'rgba(59, 130, 246, 0.9)' }} />
            )}
          </button>
        </div>
      </div>
      {isOpen && children}
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
        "w-full p-2 rounded-md group flex items-center space-x-4 cursor-pointer transition-colors ml-4 sidebar-nav-item",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground"
      )}
      data-testid={item.testId}
      {...attributes}
      onClick={() => window.location.href = item.href}
    >
      <GripVertical 
        className="h-6 w-6 opacity-80 group-hover:opacity-100 cursor-grab text-muted-foreground flex-shrink-0" 
        {...listeners} 
      />
      <div className="flex items-center px-3 py-1 rounded-full nav-box transition-colors flex-1" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', minWidth: '220px', maxWidth: '220px' }}>
        <Icon className="h-5 w-5 flex-shrink-0 mr-2" style={{ color: 'rgba(59, 130, 246, 0.9)' }} />
        <span className="text-sm font-medium flex-1" style={{ color: 'rgba(59, 130, 246, 0.9)' }}>{item.name}</span>
        <div className="ml-2 w-6 h-6 opacity-0" />
      </div>
    </div>
  );
}

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const { t } = useTranslation();
  const [navigation, setNavigation] = useState(() => {
    const defaultNav = getDefaultNavigation(t);
    const saved = localStorage.getItem('sidebar-main-order');
    if (saved) {
      try {
        const order = JSON.parse(saved);
        return order.map((id: string) => defaultNav.find(item => item.id === id)).filter(Boolean);
      } catch {}
    }
    return defaultNav;
  });
  const [systemsItems, setSystemsItems] = useState(() => {
    const defaultSystems = getDefaultSystemsItems(t);
    const saved = localStorage.getItem('sidebar-systems-order');
    if (saved) {
      try {
        const order = JSON.parse(saved);
        return order.map((id: string) => defaultSystems.find(item => item.id === id)).filter(Boolean);
      } catch {}
    }
    return defaultSystems;
  });
  const [timeManagementItems, setTimeManagementItems] = useState(() => {
    const defaultTime = getDefaultTimeManagementItems(t);
    const saved = localStorage.getItem('sidebar-time-order');
    if (saved) {
      try {
        const order = JSON.parse(saved);
        return order.map((id: string) => defaultTime.find(item => item.id === id)).filter(Boolean);
      } catch {}
    }
    return defaultTime;
  });
  const [parentItems, setParentItems] = useState(() => {
    const defaultParent = getDefaultParentItems(t);
    const saved = localStorage.getItem('sidebar-parent-order');
    if (saved) {
      try {
        const order = JSON.parse(saved);
        return order.map((id: string) => defaultParent.find(item => item.id === id)).filter(Boolean);
      } catch {}
    }
    return defaultParent;
  });
  const [isTimeManagementOpen, setIsTimeManagementOpen] = useState(false);
  const [isSystemsOpen, setIsSystemsOpen] = useState(false);

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
            src={newLogo}
            alt="App Logo"
            fallbackType="logo"
            size="custom"
            containerClassName="w-64 h-44"
            className="object-contain"
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
        
        {/* Parent Sections (Systems & Time Management) */}
        <div>
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => handleDragEnd(event, parentItems, setParentItems, 'sidebar-parent-order')}
          >
            <SortableContext items={parentItems.map((item: any) => item.id)} strategy={verticalListSortingStrategy}>
              {parentItems.map((item: any) => {
                const isSystemsItem = item.type === 'systems';
                const isTimeItem = item.type === 'timeManagement';
                const isOpen = isSystemsItem ? isSystemsOpen : (isTimeItem ? isTimeManagementOpen : false);
                
                return (
                  <div key={item.id}>
                    <SortableParentItem
                      item={item}
                      isOpen={isOpen}
                      onToggle={() => isSystemsItem ? setIsSystemsOpen(!isSystemsOpen) : (isTimeItem ? setIsTimeManagementOpen(!isTimeManagementOpen) : null)}
                      children={
                        isOpen && (
                          <div className="space-y-1">
                            <DndContext 
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragEnd={(event) => isSystemsItem ? handleDragEnd(event, systemsItems, setSystemsItems, 'sidebar-systems-order') : handleDragEnd(event, timeManagementItems, setTimeManagementItems, 'sidebar-time-order')}
                            >
                              <SortableContext items={(isSystemsItem ? systemsItems : timeManagementItems).map((item: any) => item.id)} strategy={verticalListSortingStrategy}>
                                {(isSystemsItem ? systemsItems : timeManagementItems).map((subItem: any) => {
                                  const isActive = location === subItem.href;
                                  return (
                                    <SortableSubNavItem key={subItem.id} item={subItem} isActive={isActive} />
                                  );
                                })}
                              </SortableContext>
                            </DndContext>
                          </div>
                        )
                      }
                    />
                  </div>
                );
              })}
            </SortableContext>
          </DndContext>
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
