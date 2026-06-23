import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar as CalendarIcon, Clock, MapPin, User } from "lucide-react";
import { CalendarEvent } from "@shared/schema";

const typeColors = {
  meeting: "bg-primary/10 text-primary",
  call: "bg-success/10 text-success",
  deadline: "bg-destructive/10 text-destructive",
  reminder: "bg-warning/10 text-warning",
  other: "bg-muted text-foreground",
};

const typeLabels = {
  meeting: "Meeting",
  call: "Call",
  deadline: "Deadline", 
  reminder: "Reminder",
  other: "Other",
};

export default function CalendarPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data: events, isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar-events"],
    queryFn: async () => {
      const res = await fetch("/api/calendar-events", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch calendar events');
      return res.json();
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const upcomingEvents = events?.filter(event => {
    const eventDate = new Date(event.startTime);
    return eventDate >= today;
  }).slice(0, 10) || [];

  const todayEvents = events?.filter(event => {
    const eventDate = new Date(event.startTime);
    eventDate.setHours(0, 0, 0, 0);
    return eventDate.getTime() === today.getTime();
  }) || [];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Calendar" 
          subtitle="Manage your schedule and appointments"
          onNewClick={() => setShowCreateDialog(true)}
        />
        
        <div className="p-6 space-y-6">
          {/* Today's Events */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CalendarIcon className="h-5 w-5" />
                <span>Today's Events</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {todayEvents.length === 0 ? (
                <p className="text-muted-foreground text-center py-4" data-testid="text-no-events-today">
                  No events scheduled for today
                </p>
              ) : (
                <div className="space-y-3">
                  {todayEvents.map((event) => (
                    <div 
                      key={event.id} 
                      className="flex items-center justify-between p-3 border border-border rounded-lg"
                      data-testid={`card-today-event-${event.id}`}
                    >
                      <div className="flex items-center space-x-3">
                        <Badge className={typeColors[event.type]} data-testid={`badge-event-type-${event.id}`}>
                          {typeLabels[event.type]}
                        </Badge>
                        <div>
                          <h4 className="font-medium text-foreground" data-testid={`text-event-title-${event.id}`}>
                            {event.title}
                          </h4>
                          {event.description && (
                            <p className="text-sm text-muted-foreground" data-testid={`text-event-description-${event.id}`}>
                              {event.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        {event.isAllDay ? (
                          <span data-testid={`text-event-time-${event.id}`}>All Day</span>
                        ) : (
                          <span data-testid={`text-event-time-${event.id}`}>
                            {new Date(event.startTime).toLocaleTimeString([], { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : events?.length === 0 ? (
            <div className="text-center py-12">
              <CalendarIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No events yet</h3>
              <p className="text-muted-foreground mb-4">Create your first calendar event to get started</p>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-event">
                Create Event
              </Button>
            </div>
          ) : (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Upcoming Events</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {upcomingEvents.map((event) => (
                  <Card key={event.id} className="transition-shadow" data-testid={`card-event-${event.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg" data-testid={`text-event-title-${event.id}`}>
                            {event.title}
                          </CardTitle>
                          <Badge 
                            className={typeColors[event.type]}
                            data-testid={`badge-event-type-${event.id}`}
                          >
                            {typeLabels[event.type]}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-3">
                      {event.description && (
                        <p className="text-sm text-muted-foreground" data-testid={`text-event-description-${event.id}`}>
                          {event.description}
                        </p>
                      )}
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center space-x-2 text-muted-foreground">
                          <CalendarIcon className="h-4 w-4" />
                          <span data-testid={`text-event-date-${event.id}`}>
                            {new Date(event.startTime).toLocaleDateString()}
                          </span>
                        </div>
                        
                        {!event.isAllDay && (
                          <div className="flex items-center space-x-2 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span data-testid={`text-event-time-range-${event.id}`}>
                              {new Date(event.startTime).toLocaleTimeString([], { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })} - {new Date(event.endTime).toLocaleTimeString([], { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </span>
                          </div>
                        )}
                        
                        {event.location && (
                          <div className="flex items-center space-x-2 text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span data-testid={`text-event-location-${event.id}`}>{event.location}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Event</DialogTitle>
          </DialogHeader>
          {/* Note: CalendarEventForm would go here, similar to other forms */}
          <div className="p-4 text-center text-muted-foreground">
            Calendar event form coming soon...
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
