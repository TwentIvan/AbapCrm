import { 
  users, projects, tasks, partners, deals, calendarEvents,
  type User, type InsertUser,
  type Project, type InsertProject,
  type Task, type InsertTask,
  type Partner, type InsertPartner,
  type Deal, type InsertDeal,
  type CalendarEvent, type InsertCalendarEvent
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

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

  sessionStore: session.SessionStore;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.SessionStore;

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
    const updateData = { ...task, updatedAt: new Date() };
    if (task.status === 'completed' && !task.completedAt) {
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
    const updateData = { ...deal, updatedAt: new Date() };
    if ((deal.stage === 'won' || deal.stage === 'lost') && !deal.actualCloseDate) {
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
}

export const storage = new DatabaseStorage();
