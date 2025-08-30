import { 
  users, projects, tasks, partners, deals, calendarEvents, timeEntries, planningWindows, messages, comments, emailConfigs,
  timeNormalizationConfigs, salesOrders, salesOrderItems,
  type User, type InsertUser,
  type Project, type InsertProject,
  type Task, type InsertTask,
  type Partner, type InsertPartner,
  type Deal, type InsertDeal,
  type CalendarEvent, type InsertCalendarEvent,
  type PlanningWindow, type InsertPlanningWindow,
  type TimeEntry, type InsertTimeEntry,
  type Message, type InsertMessage,
  type Comment, type InsertComment,
  type EmailConfig, type InsertEmailConfig,
  type TimeNormalizationConfig, type InsertTimeNormalizationConfig,
  type SalesOrder, type InsertSalesOrder,
  type SalesOrderItem, type InsertSalesOrderItem
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { sql } from "drizzle-orm";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Projects
  getProjects(userId: string): Promise<Project[]>;
  getProject(id: string, userId: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>, userId: string): Promise<Project | undefined>;
  deleteProject(id: string, userId: string): Promise<boolean>;

  // Tasks
  getTasks(userId: string): Promise<Task[]>;
  getTasksByProject(projectId: string, userId: string): Promise<Task[]>;
  getTask(id: string, userId: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, task: Partial<InsertTask>, userId: string): Promise<Task | undefined>;
  deleteTask(id: string, userId: string): Promise<boolean>;

  // Partners
  getPartners(userId: string): Promise<Partner[]>;
  getPartner(id: string, userId: string): Promise<Partner | undefined>;
  createPartner(partner: InsertPartner): Promise<Partner>;
  updatePartner(id: string, partner: Partial<InsertPartner>, userId: string): Promise<Partner | undefined>;
  deletePartner(id: string, userId: string): Promise<boolean>;

  // Deals
  getDeals(userId: string): Promise<Deal[]>;
  getDeal(id: string, userId: string): Promise<Deal | undefined>;
  createDeal(deal: InsertDeal): Promise<Deal>;
  updateDeal(id: string, deal: Partial<InsertDeal>, userId: string): Promise<Deal | undefined>;
  deleteDeal(id: string, userId: string): Promise<boolean>;

  // Calendar Events
  getCalendarEvents(userId: string): Promise<CalendarEvent[]>;
  getCalendarEvent(id: string, userId: string): Promise<CalendarEvent | undefined>;
  createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  updateCalendarEvent(id: string, event: Partial<InsertCalendarEvent>, userId: string): Promise<CalendarEvent | undefined>;
  deleteCalendarEvent(id: string, userId: string): Promise<boolean>;

  // Planning Windows
  getAllPlanningWindowsForUser(userId: string): Promise<(PlanningWindow & { project: Project })[]>;
  getPlanningWindows(projectId: string, userId: string): Promise<PlanningWindow[]>;
  getPlanningWindow(id: string, userId: string): Promise<PlanningWindow | undefined>;
  createPlanningWindow(window: InsertPlanningWindow): Promise<PlanningWindow>;
  updatePlanningWindow(id: string, window: Partial<InsertPlanningWindow>, userId: string): Promise<PlanningWindow | undefined>;
  deletePlanningWindow(id: string, userId: string): Promise<boolean>;

  // Time Entries
  getTimeEntries(userId: string): Promise<TimeEntry[]>;
  getTimeEntriesByTask(taskId: string, userId: string): Promise<TimeEntry[]>;
  getTimeEntry(id: string, userId: string): Promise<TimeEntry | undefined>;
  createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry>;
  updateTimeEntry(id: string, entry: Partial<InsertTimeEntry>, userId: string): Promise<TimeEntry | undefined>;
  deleteTimeEntry(id: string, userId: string): Promise<boolean>;
  stopTimeEntry(id: string, userId: string): Promise<TimeEntry | undefined>;
  getRunningTimeEntry(userId: string): Promise<TimeEntry | undefined>;
  
  // Time Normalization Configs
  getTimeNormalizationConfigs(userId: string): Promise<TimeNormalizationConfig[]>;
  getTimeNormalizationConfig(id: string, userId: string): Promise<TimeNormalizationConfig | undefined>;
  createTimeNormalizationConfig(config: InsertTimeNormalizationConfig): Promise<TimeNormalizationConfig>;
  updateTimeNormalizationConfig(id: string, config: Partial<InsertTimeNormalizationConfig>, userId: string): Promise<TimeNormalizationConfig | undefined>;
  deleteTimeNormalizationConfig(id: string, userId: string): Promise<boolean>;
  getDefaultTimeNormalizationConfig(userId: string): Promise<TimeNormalizationConfig | undefined>;
  
  // Sales Orders
  getSalesOrders(userId: string): Promise<SalesOrder[]>;
  getSalesOrder(id: string, userId: string): Promise<SalesOrder | undefined>;
  createSalesOrder(order: InsertSalesOrder): Promise<SalesOrder>;
  updateSalesOrder(id: string, order: Partial<InsertSalesOrder>, userId: string): Promise<SalesOrder | undefined>;
  deleteSalesOrder(id: string, userId: string): Promise<boolean>;
  
  // Sales Order Items
  getSalesOrderItems(salesOrderId: string, userId: string): Promise<SalesOrderItem[]>;
  getSalesOrderItem(id: string, userId: string): Promise<SalesOrderItem | undefined>;
  createSalesOrderItem(item: InsertSalesOrderItem): Promise<SalesOrderItem>;
  updateSalesOrderItem(id: string, item: Partial<InsertSalesOrderItem>, userId: string): Promise<SalesOrderItem | undefined>;
  deleteSalesOrderItem(id: string, userId: string): Promise<boolean>;
  getAllRunningTimeEntries(userId: string): Promise<TimeEntry[]>;

  // Messages
  getMessages(userId: string): Promise<Message[]>;
  getMessage(id: string, userId: string): Promise<Message | undefined>;
  getMessageByMessageId(messageId: string, userId: string): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: string, message: Partial<InsertMessage>, userId: string): Promise<Message | undefined>;
  deleteMessage(id: string, userId: string): Promise<boolean>;
  getUnreadMessages(userId: string): Promise<Message[]>;
  markMessageAsRead(id: string, userId: string): Promise<Message | undefined>;

  // Comments
  getComments(userId: string): Promise<Comment[]>;
  getCommentsByProject(projectId: string, userId: string): Promise<Comment[]>;
  getCommentsByTask(taskId: string, userId: string): Promise<Comment[]>;
  getCommentsByMessage(messageId: string, userId: string): Promise<Comment[]>;
  getComment(id: string, userId: string): Promise<Comment | undefined>;
  createComment(comment: InsertComment): Promise<Comment>;
  updateComment(id: string, comment: Partial<InsertComment>, userId: string): Promise<Comment | undefined>;
  deleteComment(id: string, userId: string): Promise<boolean>;

  // Email Configs
  getEmailConfigs(userId: string): Promise<EmailConfig[]>;
  getEmailConfig(id: string, userId: string): Promise<EmailConfig | undefined>;
  getActiveEmailConfig(userId: string): Promise<EmailConfig | undefined>;
  createEmailConfig(config: InsertEmailConfig): Promise<EmailConfig>;
  updateEmailConfig(id: string, config: Partial<InsertEmailConfig>, userId: string): Promise<EmailConfig | undefined>;
  deleteEmailConfig(id: string, userId: string): Promise<boolean>;
  deactivateAllEmailConfigs(userId: string): Promise<void>;

  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Projects
  async getProjects(userId: string): Promise<Project[]> {
    return await db.select().from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.updatedAt));
  }

  async getProject(id: string, userId: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));
    return project || undefined;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [newProject] = await db
      .insert(projects)
      .values(project)
      .returning();
    return newProject;
  }

  async updateProject(id: string, project: Partial<InsertProject>, userId: string): Promise<Project | undefined> {
    const [updatedProject] = await db
      .update(projects)
      .set({ ...project, updatedAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning();
    return updatedProject || undefined;
  }

  async deleteProject(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Tasks
  async getTasks(userId: string): Promise<Task[]> {
    return await db.select().from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(desc(tasks.updatedAt));
  }

  async getTasksByProject(projectId: string, userId: string): Promise<Task[]> {
    return await db.select().from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.userId, userId)))
      .orderBy(asc(tasks.createdAt));
  }

  async getTask(id: string, userId: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    return task || undefined;
  }

  async createTask(task: InsertTask): Promise<Task> {
    const [newTask] = await db
      .insert(tasks)
      .values(task)
      .returning();
    return newTask;
  }

  async updateTask(id: string, task: Partial<InsertTask>, userId: string): Promise<Task | undefined> {
    const updateData: any = { ...task, updatedAt: new Date() };
    if (task.status === 'completed') {
      updateData.completedAt = new Date();
    }
    
    const [updatedTask] = await db
      .update(tasks)
      .set(updateData)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();
    return updatedTask || undefined;
  }

  async deleteTask(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Partners
  async getPartners(userId: string): Promise<Partner[]> {
    return await db.select().from(partners)
      .where(eq(partners.userId, userId))
      .orderBy(desc(partners.updatedAt));
  }

  async getPartner(id: string, userId: string): Promise<Partner | undefined> {
    const [partner] = await db.select().from(partners)
      .where(and(eq(partners.id, id), eq(partners.userId, userId)));
    return partner || undefined;
  }

  async createPartner(partner: InsertPartner): Promise<Partner> {
    const [newPartner] = await db
      .insert(partners)
      .values(partner)
      .returning();
    return newPartner;
  }

  async updatePartner(id: string, partner: Partial<InsertPartner>, userId: string): Promise<Partner | undefined> {
    const [updatedPartner] = await db
      .update(partners)
      .set({ ...partner, updatedAt: new Date() })
      .where(and(eq(partners.id, id), eq(partners.userId, userId)))
      .returning();
    return updatedPartner || undefined;
  }

  async deletePartner(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(partners)
      .where(and(eq(partners.id, id), eq(partners.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Deals
  async getDeals(userId: string): Promise<Deal[]> {
    return await db.select().from(deals)
      .where(eq(deals.userId, userId))
      .orderBy(desc(deals.updatedAt));
  }

  async getDeal(id: string, userId: string): Promise<Deal | undefined> {
    const [deal] = await db.select().from(deals)
      .where(and(eq(deals.id, id), eq(deals.userId, userId)));
    return deal || undefined;
  }

  async createDeal(deal: InsertDeal): Promise<Deal> {
    const [newDeal] = await db
      .insert(deals)
      .values(deal)
      .returning();
    return newDeal;
  }

  async updateDeal(id: string, deal: Partial<InsertDeal>, userId: string): Promise<Deal | undefined> {
    const updateData: any = { ...deal, updatedAt: new Date() };
    if (deal.stage === 'won' || deal.stage === 'lost') {
      updateData.actualCloseDate = new Date();
    }

    const [updatedDeal] = await db
      .update(deals)
      .set(updateData)
      .where(and(eq(deals.id, id), eq(deals.userId, userId)))
      .returning();
    return updatedDeal || undefined;
  }

  async deleteDeal(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(deals)
      .where(and(eq(deals.id, id), eq(deals.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Calendar Events
  async getCalendarEvents(userId: string): Promise<CalendarEvent[]> {
    return await db.select().from(calendarEvents)
      .where(eq(calendarEvents.userId, userId))
      .orderBy(asc(calendarEvents.startTime));
  }

  async getCalendarEvent(id: string, userId: string): Promise<CalendarEvent | undefined> {
    const [event] = await db.select().from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)));
    return event || undefined;
  }

  async createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent> {
    const [newEvent] = await db
      .insert(calendarEvents)
      .values(event)
      .returning();
    return newEvent;
  }

  async updateCalendarEvent(id: string, event: Partial<InsertCalendarEvent>, userId: string): Promise<CalendarEvent | undefined> {
    const [updatedEvent] = await db
      .update(calendarEvents)
      .set({ ...event, updatedAt: new Date() })
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
      .returning();
    return updatedEvent || undefined;
  }

  async deleteCalendarEvent(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Planning Windows
  async getAllPlanningWindowsForUser(userId: string): Promise<(PlanningWindow & { project: Project })[]> {
    const result = await db
      .select()
      .from(planningWindows)
      .innerJoin(projects, eq(projects.id, planningWindows.projectId))
      .where(eq(projects.userId, userId))
      .orderBy(asc(planningWindows.startDate));
    
    return result.map(row => ({
      ...row.planning_windows,
      project: row.projects
    }));
  }

  async getPlanningWindows(projectId: string, userId: string): Promise<PlanningWindow[]> {
    // Verify project belongs to user first
    const project = await this.getProject(projectId, userId);
    if (!project) return [];
    
    return await db.select().from(planningWindows)
      .where(eq(planningWindows.projectId, projectId))
      .orderBy(asc(planningWindows.startDate));
  }

  async getPlanningWindow(id: string, userId: string): Promise<PlanningWindow | undefined> {
    const [window] = await db
      .select()
      .from(planningWindows)
      .innerJoin(projects, eq(projects.id, planningWindows.projectId))
      .where(and(eq(planningWindows.id, id), eq(projects.userId, userId)));
    return window?.planning_windows || undefined;
  }

  async createPlanningWindow(window: InsertPlanningWindow): Promise<PlanningWindow> {
    // Transform the data to match database schema
    const insertData = {
      ...window,
      excludedDates: window.excludedDates ? window.excludedDates.map(date => new Date(date)) : null,
    };
    const [newWindow] = await db
      .insert(planningWindows)
      .values(insertData)
      .returning();
    return newWindow;
  }

  async updatePlanningWindow(id: string, window: Partial<InsertPlanningWindow>, userId: string): Promise<PlanningWindow | undefined> {
    // Verify ownership first
    const existingWindow = await this.getPlanningWindow(id, userId);
    if (!existingWindow) return undefined;
    
    // Transform the data to match database schema
    const updateData = {
      ...window,
      excludedDates: window.excludedDates ? window.excludedDates.map(date => new Date(date)) : undefined,
      updatedAt: new Date()
    };
    const [updated] = await db
      .update(planningWindows)
      .set(updateData)
      .where(eq(planningWindows.id, id))
      .returning();
    return updated || undefined;
  }

  async deletePlanningWindow(id: string, userId: string): Promise<boolean> {
    // Verify ownership first
    const existingWindow = await this.getPlanningWindow(id, userId);
    if (!existingWindow) return false;
    
    const result = await db
      .delete(planningWindows)
      .where(eq(planningWindows.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Time Entries
  async getTimeEntries(userId: string): Promise<TimeEntry[]> {
    return await db
      .select()
      .from(timeEntries)
      .where(eq(timeEntries.userId, userId))
      .orderBy(desc(timeEntries.startTime));
  }

  async getTimeEntriesByTask(taskId: string, userId: string): Promise<TimeEntry[]> {
    return await db
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.taskId, taskId), eq(timeEntries.userId, userId)))
      .orderBy(desc(timeEntries.startTime));
  }

  async getTimeEntry(id: string, userId: string): Promise<TimeEntry | undefined> {
    const [entry] = await db
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)));
    return entry || undefined;
  }

  async createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry> {
    const [newEntry] = await db
      .insert(timeEntries)
      .values(entry)
      .returning();
    return newEntry;
  }

  async updateTimeEntry(id: string, entry: Partial<InsertTimeEntry>, userId: string): Promise<TimeEntry | undefined> {
    const [updated] = await db
      .update(timeEntries)
      .set({ ...entry, updatedAt: new Date() })
      .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteTimeEntry(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(timeEntries)
      .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async stopTimeEntry(id: string, userId: string): Promise<TimeEntry | undefined> {
    const now = new Date();
    const [updated] = await db
      .update(timeEntries)
      .set({ 
        endTime: now,
        isRunning: false,
        duration: sql`EXTRACT(EPOCH FROM (${now}::timestamp - start_time)) / 60`,
        updatedAt: now
      })
      .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async getRunningTimeEntry(userId: string): Promise<TimeEntry | undefined> {
    const [entry] = await db
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.userId, userId), eq(timeEntries.isRunning, true)));
    return entry || undefined;
  }

  async getAllRunningTimeEntries(userId: string): Promise<TimeEntry[]> {
    return await db
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.userId, userId), eq(timeEntries.isRunning, true)))
      .orderBy(desc(timeEntries.startTime));
  }

  // Time Normalization Configs
  async getTimeNormalizationConfigs(userId: string): Promise<TimeNormalizationConfig[]> {
    return await db
      .select()
      .from(timeNormalizationConfigs)
      .where(eq(timeNormalizationConfigs.userId, userId))
      .orderBy(asc(timeNormalizationConfigs.minMinutes));
  }

  async getTimeNormalizationConfig(id: string, userId: string): Promise<TimeNormalizationConfig | undefined> {
    const [config] = await db
      .select()
      .from(timeNormalizationConfigs)
      .where(and(eq(timeNormalizationConfigs.id, id), eq(timeNormalizationConfigs.userId, userId)));
    return config || undefined;
  }

  async createTimeNormalizationConfig(config: InsertTimeNormalizationConfig): Promise<TimeNormalizationConfig> {
    const [newConfig] = await db
      .insert(timeNormalizationConfigs)
      .values(config)
      .returning();
    return newConfig;
  }

  async updateTimeNormalizationConfig(id: string, config: Partial<InsertTimeNormalizationConfig>, userId: string): Promise<TimeNormalizationConfig | undefined> {
    const [updated] = await db
      .update(timeNormalizationConfigs)
      .set({ ...config, updatedAt: new Date() })
      .where(and(eq(timeNormalizationConfigs.id, id), eq(timeNormalizationConfigs.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteTimeNormalizationConfig(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(timeNormalizationConfigs)
      .where(and(eq(timeNormalizationConfigs.id, id), eq(timeNormalizationConfigs.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getDefaultTimeNormalizationConfig(userId: string): Promise<TimeNormalizationConfig | undefined> {
    const [config] = await db
      .select()
      .from(timeNormalizationConfigs)
      .where(and(eq(timeNormalizationConfigs.userId, userId), eq(timeNormalizationConfigs.isDefault, true)));
    return config || undefined;
  }

  // Sales Orders
  async getSalesOrders(userId: string): Promise<SalesOrder[]> {
    return await db
      .select()
      .from(salesOrders)
      .where(eq(salesOrders.userId, userId))
      .orderBy(desc(salesOrders.issueDate));
  }

  async getSalesOrder(id: string, userId: string): Promise<SalesOrder | undefined> {
    const [order] = await db
      .select()
      .from(salesOrders)
      .where(and(eq(salesOrders.id, id), eq(salesOrders.userId, userId)));
    return order || undefined;
  }

  async createSalesOrder(order: InsertSalesOrder): Promise<SalesOrder> {
    // Generate order number
    const year = new Date().getFullYear();
    const count = await db
      .select({ count: sql<number>`count(*)` })
      .from(salesOrders)
      .where(and(
        eq(salesOrders.userId, order.userId),
        sql`EXTRACT(YEAR FROM issue_date) = ${year}`
      ));
    
    const orderNumber = `OV-${year}-${String((count[0]?.count || 0) + 1).padStart(3, '0')}`;
    
    const [newOrder] = await db
      .insert(salesOrders)
      .values({ ...order, orderNumber })
      .returning();
    return newOrder;
  }

  async updateSalesOrder(id: string, order: Partial<InsertSalesOrder>, userId: string): Promise<SalesOrder | undefined> {
    const [updated] = await db
      .update(salesOrders)
      .set({ ...order, updatedAt: new Date() })
      .where(and(eq(salesOrders.id, id), eq(salesOrders.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteSalesOrder(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(salesOrders)
      .where(and(eq(salesOrders.id, id), eq(salesOrders.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Sales Order Items
  async getSalesOrderItems(salesOrderId: string, userId: string): Promise<SalesOrderItem[]> {
    // Verify ownership through sales order
    const order = await this.getSalesOrder(salesOrderId, userId);
    if (!order) return [];
    
    return await db
      .select()
      .from(salesOrderItems)
      .where(eq(salesOrderItems.salesOrderId, salesOrderId))
      .orderBy(asc(salesOrderItems.createdAt));
  }

  async getSalesOrderItem(id: string, userId: string): Promise<SalesOrderItem | undefined> {
    const [item] = await db
      .select()
      .from(salesOrderItems)
      .innerJoin(salesOrders, eq(salesOrders.id, salesOrderItems.salesOrderId))
      .where(and(eq(salesOrderItems.id, id), eq(salesOrders.userId, userId)));
    return item?.sales_order_items || undefined;
  }

  async createSalesOrderItem(item: InsertSalesOrderItem): Promise<SalesOrderItem> {
    const [newItem] = await db
      .insert(salesOrderItems)
      .values(item)
      .returning();
    return newItem;
  }

  async updateSalesOrderItem(id: string, item: Partial<InsertSalesOrderItem>, userId: string): Promise<SalesOrderItem | undefined> {
    // Verify ownership through sales order
    const existingItem = await this.getSalesOrderItem(id, userId);
    if (!existingItem) return undefined;
    
    const [updated] = await db
      .update(salesOrderItems)
      .set({ ...item, updatedAt: new Date() })
      .where(eq(salesOrderItems.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteSalesOrderItem(id: string, userId: string): Promise<boolean> {
    // Verify ownership through sales order
    const existingItem = await this.getSalesOrderItem(id, userId);
    if (!existingItem) return false;
    
    const result = await db
      .delete(salesOrderItems)
      .where(eq(salesOrderItems.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Messages
  async getMessages(userId: string): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.userId, userId))
      .orderBy(desc(messages.receivedAt));
  }

  async getMessage(id: string, userId: string): Promise<Message | undefined> {
    const [message] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.id, id), eq(messages.userId, userId)));
    return message || undefined;
  }

  async getMessageByMessageId(messageId: string, userId: string): Promise<Message | undefined> {
    const [message] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.messageId, messageId), eq(messages.userId, userId)));
    return message || undefined;
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db
      .insert(messages)
      .values(message)
      .returning();
    return newMessage;
  }

  async updateMessage(id: string, message: Partial<InsertMessage>, userId: string): Promise<Message | undefined> {
    const [updated] = await db
      .update(messages)
      .set({ ...message, updatedAt: new Date() })
      .where(and(eq(messages.id, id), eq(messages.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteMessage(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(messages)
      .where(and(eq(messages.id, id), eq(messages.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getUnreadMessages(userId: string): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(and(eq(messages.userId, userId), eq(messages.status, 'unread')))
      .orderBy(desc(messages.receivedAt));
  }

  async markMessageAsRead(id: string, userId: string): Promise<Message | undefined> {
    const [updated] = await db
      .update(messages)
      .set({ status: 'read', updatedAt: new Date() })
      .where(and(eq(messages.id, id), eq(messages.userId, userId)))
      .returning();
    return updated || undefined;
  }

  // Comments
  async getComments(userId: string): Promise<Comment[]> {
    return await db
      .select()
      .from(comments)
      .where(eq(comments.userId, userId))
      .orderBy(desc(comments.createdAt));
  }

  async getCommentsByProject(projectId: string, userId: string): Promise<Comment[]> {
    return await db
      .select()
      .from(comments)
      .where(and(eq(comments.projectId, projectId), eq(comments.userId, userId)))
      .orderBy(asc(comments.createdAt));
  }

  async getCommentsByTask(taskId: string, userId: string): Promise<Comment[]> {
    return await db
      .select()
      .from(comments)
      .where(and(eq(comments.taskId, taskId), eq(comments.userId, userId)))
      .orderBy(asc(comments.createdAt));
  }

  async getCommentsByMessage(messageId: string, userId: string): Promise<Comment[]> {
    return await db
      .select()
      .from(comments)
      .where(and(eq(comments.messageId, messageId), eq(comments.userId, userId)))
      .orderBy(asc(comments.createdAt));
  }

  async getComment(id: string, userId: string): Promise<Comment | undefined> {
    const [comment] = await db
      .select()
      .from(comments)
      .where(and(eq(comments.id, id), eq(comments.userId, userId)));
    return comment || undefined;
  }

  async createComment(comment: InsertComment): Promise<Comment> {
    const [newComment] = await db
      .insert(comments)
      .values(comment)
      .returning();
    return newComment;
  }

  async updateComment(id: string, comment: Partial<InsertComment>, userId: string): Promise<Comment | undefined> {
    const [updated] = await db
      .update(comments)
      .set({ ...comment, updatedAt: new Date() })
      .where(and(eq(comments.id, id), eq(comments.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteComment(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(comments)
      .where(and(eq(comments.id, id), eq(comments.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Email Configs
  async getEmailConfigs(userId: string): Promise<EmailConfig[]> {
    return await db
      .select()
      .from(emailConfigs)
      .where(eq(emailConfigs.userId, userId))
      .orderBy(desc(emailConfigs.updatedAt));
  }

  async getEmailConfig(id: string, userId: string): Promise<EmailConfig | undefined> {
    const [config] = await db
      .select()
      .from(emailConfigs)
      .where(and(eq(emailConfigs.id, id), eq(emailConfigs.userId, userId)));
    return config || undefined;
  }

  async getActiveEmailConfig(userId: string): Promise<EmailConfig | undefined> {
    const [config] = await db
      .select()
      .from(emailConfigs)
      .where(and(eq(emailConfigs.userId, userId), eq(emailConfigs.isActive, true)))
      .orderBy(desc(emailConfigs.updatedAt));
    return config || undefined;
  }

  async createEmailConfig(config: InsertEmailConfig): Promise<EmailConfig> {
    const [newConfig] = await db
      .insert(emailConfigs)
      .values(config)
      .returning();
    return newConfig;
  }

  async updateEmailConfig(id: string, config: Partial<InsertEmailConfig>, userId: string): Promise<EmailConfig | undefined> {
    const [updated] = await db
      .update(emailConfigs)
      .set({ ...config, updatedAt: new Date() })
      .where(and(eq(emailConfigs.id, id), eq(emailConfigs.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteEmailConfig(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(emailConfigs)
      .where(and(eq(emailConfigs.id, id), eq(emailConfigs.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async deactivateAllEmailConfigs(userId: string): Promise<void> {
    await db
      .update(emailConfigs)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(emailConfigs.userId, userId));
  }
}

export const storage = new DatabaseStorage();
