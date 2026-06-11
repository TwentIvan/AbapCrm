/**
 * EventBus - Lightweight in-process pub/sub event bus for domain events
 * 
 * Supports workflow triggers and other event-driven automations.
 * Events are type-safe and include full context for conditional evaluation.
 */

// ========================================
// Event Type Definitions
// ========================================

export type EventType = 
  | "entity.created"
  | "entity.updated"
  | "entity.deleted"
  | "field.changed"
  | "ai_budget"
  | "ai_approval";

export interface EventContext {
  // Entity information
  entityKey: string; // "projects", "tasks", "partners", etc.
  recordId: string; // UUID of the record
  
  // User and organization context
  userId: string;
  organizationId: string;
  
  // Record data
  record?: Record<string, any>; // Current record values
  oldRecord?: Record<string, any>; // Previous record values (for updates)
  
  // Field-specific (for field.changed events)
  changedFields?: string[]; // List of field keys that changed
  fieldChanges?: Record<string, { oldValue: any; newValue: any }>; // Detailed field changes
  
  // Additional metadata
  timestamp: Date;
  userAgent?: string;
  ipAddress?: string;
}

export interface DomainEvent {
  type: EventType;
  context: EventContext;
}

// ========================================
// Event Handler Type
// ========================================

export type EventHandler = (event: DomainEvent) => Promise<void> | void;

export interface EventSubscription {
  id: string;
  eventType: EventType | "*"; // "*" for all events
  handler: EventHandler;
  filter?: (event: DomainEvent) => boolean; // Optional filter function
}

// ========================================
// EventBus Class
// ========================================

class EventBusClass {
  private subscriptions: Map<string, EventSubscription> = new Map();
  private subscriptionCounter = 0;
  
  /**
   * Subscribe to events
   */
  on(
    eventType: EventType | "*",
    handler: EventHandler,
    filter?: (event: DomainEvent) => boolean
  ): string {
    const id = `sub_${++this.subscriptionCounter}`;
    const subscription: EventSubscription = {
      id,
      eventType,
      handler,
      filter,
    };
    
    this.subscriptions.set(id, subscription);
    console.log(`[EventBus] Registered handler for ${eventType} (${id})`);
    
    return id;
  }
  
  /**
   * Unsubscribe from events
   */
  off(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      this.subscriptions.delete(subscriptionId);
      console.log(`[EventBus] Unregistered handler (${subscriptionId})`);
    }
  }
  
  /**
   * Emit an event to all matching subscribers
   * Executes handlers asynchronously in the background
   */
  async emit(type: EventType, context: EventContext): Promise<void> {
    const event: DomainEvent = { type, context };
    
    console.log(`[EventBus] Emitting ${type} for ${context.entityKey}:${context.recordId}`);
    
    // Get matching subscriptions
    const matchingSubscriptions = Array.from(this.subscriptions.values()).filter(
      (sub) => {
        // Match event type
        if (sub.eventType !== "*" && sub.eventType !== type) {
          return false;
        }
        
        // Apply filter if provided
        if (sub.filter && !sub.filter(event)) {
          return false;
        }
        
        return true;
      }
    );
    
    if (matchingSubscriptions.length === 0) {
      console.log(`[EventBus] No handlers for ${type}`);
      return;
    }
    
    console.log(`[EventBus] Executing ${matchingSubscriptions.length} handler(s) for ${type}`);
    
    // Execute all handlers in parallel (background execution)
    // Use Promise.allSettled to prevent one failure from affecting others
    const results = await Promise.allSettled(
      matchingSubscriptions.map(async (sub) => {
        try {
          await sub.handler(event);
          console.log(`[EventBus] ✓ Handler ${sub.id} completed successfully`);
        } catch (error) {
          console.error(`[EventBus] ✗ Handler ${sub.id} failed:`, error);
          throw error; // Re-throw to be caught by Promise.allSettled
        }
      })
    );
    
    // Log any failures
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      console.error(`[EventBus] ${failures.length} handler(s) failed`);
    }
  }
  
  /**
   * Get all active subscriptions (for debugging)
   */
  getSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values());
  }
  
  /**
   * Clear all subscriptions (for testing)
   */
  clear(): void {
    this.subscriptions.clear();
    this.subscriptionCounter = 0;
    console.log("[EventBus] All subscriptions cleared");
  }
}

// ========================================
// Singleton Instance
// ========================================

export const EventBus = new EventBusClass();

// ========================================
// Helper Functions for Common Events
// ========================================

/**
 * Emit entity.created event
 */
export async function emitEntityCreated(
  entityKey: string,
  recordId: string,
  record: Record<string, any>,
  userId: string,
  organizationId: string,
  metadata?: { userAgent?: string; ipAddress?: string }
): Promise<void> {
  await EventBus.emit("entity.created", {
    entityKey,
    recordId,
    record,
    userId,
    organizationId,
    timestamp: new Date(),
    userAgent: metadata?.userAgent,
    ipAddress: metadata?.ipAddress,
  });
}

/**
 * Emit entity.updated event
 */
export async function emitEntityUpdated(
  entityKey: string,
  recordId: string,
  record: Record<string, any>,
  oldRecord: Record<string, any>,
  userId: string,
  organizationId: string,
  metadata?: { userAgent?: string; ipAddress?: string }
): Promise<void> {
  // Calculate changed fields
  const changedFields: string[] = [];
  const fieldChanges: Record<string, { oldValue: any; newValue: any }> = {};
  
  for (const [key, newValue] of Object.entries(record)) {
    const oldValue = oldRecord[key];
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changedFields.push(key);
      fieldChanges[key] = { oldValue, newValue };
    }
  }
  
  await EventBus.emit("entity.updated", {
    entityKey,
    recordId,
    record,
    oldRecord,
    changedFields,
    fieldChanges,
    userId,
    organizationId,
    timestamp: new Date(),
    userAgent: metadata?.userAgent,
    ipAddress: metadata?.ipAddress,
  });
  
  // Also emit field.changed events for each changed field
  if (changedFields.length > 0) {
    await EventBus.emit("field.changed", {
      entityKey,
      recordId,
      record,
      oldRecord,
      changedFields,
      fieldChanges,
      userId,
      organizationId,
      timestamp: new Date(),
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
    });
  }
}

/**
 * Emit entity.deleted event
 */
export async function emitEntityDeleted(
  entityKey: string,
  recordId: string,
  oldRecord: Record<string, any>,
  userId: string,
  organizationId: string,
  metadata?: { userAgent?: string; ipAddress?: string }
): Promise<void> {
  await EventBus.emit("entity.deleted", {
    entityKey,
    recordId,
    oldRecord,
    userId,
    organizationId,
    timestamp: new Date(),
    userAgent: metadata?.userAgent,
    ipAddress: metadata?.ipAddress,
  });
}
