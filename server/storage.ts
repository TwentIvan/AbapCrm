import { 
  users, projects, tasks, partners, deals, calendarEvents, timeEntries, planningWindows, messages, comments, emailConfigs,
  timeNormalizationConfigs, salesOrders, salesOrderItems, timesheets, rateAgreements, humanResources,
  sapSystems, sapSystemCredentials, vpnConnections, vpnCredentials, transportRequests, interventionDocuments, systemCredentials,
  vpnSoftware, vpnSystems, discoveredVpnSoftware, discoveredVpnConfigurations, organizations, userOrganizations, organizationInvitations,
  type User, type InsertUser,
  type Organization, type InsertOrganization,
  type UserOrganization, type InsertUserOrganization,
  type OrganizationInvitation, type InsertOrganizationInvitation,
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
  type SalesOrderItem, type InsertSalesOrderItem,
  type Timesheet, type InsertTimesheet,
  type RateAgreement, type InsertRateAgreement,
  type HumanResource, type InsertHumanResource,
  type SapSystem, type InsertSapSystem,
  type SapSystemCredentials, type InsertSapSystemCredentials,
  type VpnConnection, type InsertVpnConnection,
  type VpnCredentials, type InsertVpnCredentials,
  type TransportRequest, type InsertTransportRequest,
  type InterventionDocument, type InsertInterventionDocument,
  type SystemCredentials, type InsertSystemCredentials,
  type VpnSoftware, type InsertVpnSoftware,
  type VpnSystems, type InsertVpnSystems,
  type DiscoveredVpnSoftware, type InsertDiscoveredVpnSoftware,
  type DiscoveredVpnConfiguration, type InsertDiscoveredVpnConfiguration
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, isNotNull } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { sql } from "drizzle-orm";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // Organizations
  getOrganizations(userId: string): Promise<any[]>;
  getOrganization(id: string): Promise<Organization | undefined>;
  createOrganization(organization: InsertOrganization): Promise<Organization>;
  updateOrganization(id: string, organization: Partial<InsertOrganization>): Promise<Organization | undefined>;
  deleteOrganization(id: string): Promise<boolean>;
  
  // User-Organization relationships
  getUserOrganizations(userId: string): Promise<any[]>;
  addUserToOrganization(userOrganization: InsertUserOrganization): Promise<UserOrganization>;
  removeUserFromOrganization(userId: string, organizationId: string): Promise<boolean>;
  
  // Organization Invitations
  createInvitation(invitation: InsertOrganizationInvitation): Promise<OrganizationInvitation>;
  getInvitationsByEmail(email: string): Promise<OrganizationInvitation[]>;
  getUserInvitations(email: string): Promise<any[]>;
  getInvitationByToken(token: string): Promise<OrganizationInvitation | undefined>;
  updateInvitationStatus(token: string, status: 'accepted' | 'declined'): Promise<OrganizationInvitation | undefined>;
  acceptInvitation(token: string, userId: string, userEmail: string): Promise<any>;
  
  // Users
  getUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, userData: Partial<InsertUser>): Promise<User | undefined>;

  // Projects
  getProjects(userId: string, organizationId: string): Promise<Project[]>;
  getProject(id: string, userId: string, organizationId: string): Promise<Project | undefined>;
  createProject(project: InsertProject & { organizationId: string }): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>, userId: string, organizationId: string): Promise<Project | undefined>;
  deleteProject(id: string, userId: string, organizationId: string): Promise<boolean>;

  // Tasks
  getTasks(userId: string, organizationId: string): Promise<Task[]>;
  getTasksByProject(projectId: string, userId: string, organizationId: string): Promise<Task[]>;
  getTask(id: string, userId: string, organizationId: string): Promise<Task | undefined>;
  getTaskConnectionInfo(taskId: string, userId: string): Promise<any>;
  createTask(task: InsertTask & { organizationId: string }): Promise<Task>;
  updateTask(id: string, task: Partial<InsertTask>, userId: string, organizationId: string): Promise<Task | undefined>;
  deleteTask(id: string, userId: string, organizationId: string): Promise<boolean>;

  // Partners
  getPartners(userId: string, organizationId: string): Promise<Partner[]>;
  getPartner(id: string, userId: string, organizationId: string): Promise<Partner | undefined>;
  createPartner(partner: InsertPartner & { organizationId: string }): Promise<Partner>;
  updatePartner(id: string, partner: Partial<InsertPartner>, userId: string, organizationId: string): Promise<Partner | undefined>;
  deletePartner(id: string, userId: string, organizationId: string): Promise<boolean>;

  // Deals
  getDeals(userId: string, organizationId: string): Promise<Deal[]>;
  getDeal(id: string, userId: string, organizationId: string): Promise<Deal | undefined>;
  createDeal(deal: InsertDeal & { organizationId: string }): Promise<Deal>;
  updateDeal(id: string, deal: Partial<InsertDeal>, userId: string, organizationId: string): Promise<Deal | undefined>;
  deleteDeal(id: string, userId: string, organizationId: string): Promise<boolean>;

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

  // Timesheets
  getTimesheets(userId: string): Promise<Timesheet[]>;
  getTimesheet(id: string, userId: string): Promise<Timesheet | undefined>;
  createTimesheet(timesheet: InsertTimesheet): Promise<Timesheet>;
  updateTimesheet(id: string, timesheet: Partial<InsertTimesheet>, userId: string): Promise<Timesheet | undefined>;
  deleteTimesheet(id: string, userId: string): Promise<boolean>;

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
  
  // Rate Agreements
  getRateAgreements(userId: string): Promise<RateAgreement[]>;
  getRateAgreement(id: string, userId: string): Promise<RateAgreement | undefined>;
  createRateAgreement(agreement: InsertRateAgreement): Promise<RateAgreement>;
  updateRateAgreement(id: string, agreement: Partial<InsertRateAgreement>, userId: string): Promise<RateAgreement | undefined>;
  deleteRateAgreement(id: string, userId: string): Promise<boolean>;
  getActiveRateAgreements(userId: string): Promise<RateAgreement[]>;
  resolveRateForContext(userId: string, context: { partnerId?: string; projectId?: string; taskId?: string; taskType?: string; humanResourceId?: string }): Promise<RateAgreement | undefined>;

  // Human Resources
  getHumanResources(userId: string): Promise<HumanResource[]>;
  getHumanResource(id: string, userId: string): Promise<HumanResource | undefined>;
  createHumanResource(resource: InsertHumanResource): Promise<HumanResource>;
  updateHumanResource(id: string, resource: Partial<InsertHumanResource>, userId: string): Promise<HumanResource | undefined>;
  deleteHumanResource(id: string, userId: string): Promise<boolean>;
  getHumanResourceByLinkedUser(userId: string, linkedUserId: string): Promise<HumanResource | undefined>;

  // SAP Systems
  getSapSystems(userId: string): Promise<SapSystem[]>;
  getSapSystemsByPartner(partnerId: string, userId: string): Promise<SapSystem[]>;
  getSapSystem(id: string, userId: string): Promise<SapSystem | undefined>;
  createSapSystem(system: InsertSapSystem): Promise<SapSystem>;
  updateSapSystem(id: string, system: Partial<InsertSapSystem>, userId: string): Promise<SapSystem | undefined>;
  deleteSapSystem(id: string, userId: string): Promise<boolean>;

  // SAP System Credentials
  getSapSystemCredentials(sapSystemId: string, userId: string): Promise<SapSystemCredentials[]>;
  getSapSystemCredential(id: string, userId: string): Promise<SapSystemCredentials | undefined>;
  createSapSystemCredential(credential: InsertSapSystemCredentials): Promise<SapSystemCredentials>;
  updateSapSystemCredential(id: string, credential: Partial<InsertSapSystemCredentials>, userId: string): Promise<SapSystemCredentials | undefined>;
  deleteSapSystemCredential(id: string, userId: string): Promise<boolean>;
  getActiveSapSystemCredentials(sapSystemId: string, userId: string): Promise<SapSystemCredentials[]>;

  // VPN Connections
  getVpnConnections(userId: string): Promise<VpnConnection[]>;
  getVpnConnectionsByPartner(partnerId: string, userId: string): Promise<VpnConnection[]>;
  getVpnConnection(id: string, userId: string): Promise<VpnConnection | undefined>;
  createVpnConnection(connection: InsertVpnConnection, userId: string): Promise<VpnConnection>;
  updateVpnConnection(id: string, connection: Partial<InsertVpnConnection>, userId: string): Promise<VpnConnection | undefined>;
  deleteVpnConnection(id: string, userId: string): Promise<boolean>;

  // VPN Credentials
  getVpnCredentials(vpnConnectionId: string, userId: string): Promise<VpnCredentials[]>;
  getVpnCredential(id: string, userId: string): Promise<VpnCredentials | undefined>;
  createVpnCredential(credential: InsertVpnCredentials): Promise<VpnCredentials>;
  updateVpnCredential(id: string, credential: Partial<InsertVpnCredentials>, userId: string): Promise<VpnCredentials | undefined>;
  deleteVpnCredential(id: string, userId: string): Promise<boolean>;
  getActiveVpnCredentials(vpnConnectionId: string, userId: string): Promise<VpnCredentials[]>;

  // System Credentials (unified SAP + VPN)
  getSystemCredentials(userId: string): Promise<SystemCredentials[]>;
  getSystemCredential(id: string, userId: string): Promise<SystemCredentials | undefined>;
  getSystemCredentialsBySystem(systemId: string, systemType: "sap" | "vpn", userId: string): Promise<SystemCredentials[]>;
  createSystemCredential(credential: InsertSystemCredentials): Promise<SystemCredentials>;
  updateSystemCredential(id: string, credential: Partial<InsertSystemCredentials>, userId: string): Promise<SystemCredentials | undefined>;
  deleteSystemCredential(id: string, userId: string): Promise<boolean>;

  // Transport Requests
  getTransportRequests(userId: string): Promise<TransportRequest[]>;
  getTransportRequestsBySapSystem(sapSystemId: string, userId: string): Promise<TransportRequest[]>;
  getTransportRequestsByProject(projectId: string, userId: string): Promise<TransportRequest[]>;
  getTransportRequest(id: string, userId: string): Promise<TransportRequest | undefined>;
  createTransportRequest(request: InsertTransportRequest): Promise<TransportRequest>;
  updateTransportRequest(id: string, request: Partial<InsertTransportRequest>, userId: string): Promise<TransportRequest | undefined>;
  deleteTransportRequest(id: string, userId: string): Promise<boolean>;
  getTransportRequestByNumber(requestNumber: string, userId: string): Promise<TransportRequest | undefined>;

  // Intervention Documents
  getInterventionDocuments(userId: string): Promise<InterventionDocument[]>;
  getInterventionDocumentsByProject(projectId: string, userId: string): Promise<InterventionDocument[]>;
  getInterventionDocumentsByTransportRequest(transportRequestId: string, userId: string): Promise<InterventionDocument[]>;
  getInterventionDocument(id: string, userId: string): Promise<InterventionDocument | undefined>;
  createInterventionDocument(document: InsertInterventionDocument): Promise<InterventionDocument>;
  updateInterventionDocument(id: string, document: Partial<InsertInterventionDocument>, userId: string): Promise<InterventionDocument | undefined>;
  deleteInterventionDocument(id: string, userId: string): Promise<boolean>;
  getInterventionDocumentsByStatus(status: string, userId: string): Promise<InterventionDocument[]>;

  // VPN Software (Master Data)
  getVpnSoftware(): Promise<VpnSoftware[]>;
  getVpnSoftwareById(id: string): Promise<VpnSoftware | undefined>;
  createVpnSoftware(software: InsertVpnSoftware): Promise<VpnSoftware>;
  updateVpnSoftware(id: string, software: Partial<InsertVpnSoftware>): Promise<VpnSoftware | undefined>;
  deleteVpnSoftware(id: string): Promise<boolean>;

  // VPN Systems
  getVpnSystems(userId: string): Promise<VpnSystems[]>;
  getVpnSystemsByPartner(partnerId: string, userId: string): Promise<VpnSystems[]>;
  getVpnSystem(id: string, userId: string): Promise<VpnSystems | undefined>;
  createVpnSystem(system: InsertVpnSystems): Promise<VpnSystems>;
  updateVpnSystem(id: string, system: Partial<InsertVpnSystems>, userId: string): Promise<VpnSystems | undefined>;
  deleteVpnSystem(id: string, userId: string): Promise<boolean>;

  // Discovery VPN Software - Pre-caricamento risultati discovery
  getDiscoveredVpnSoftware(userId: string): Promise<DiscoveredVpnSoftware[]>;
  getDiscoveredVpnSoftwareById(id: string, userId: string): Promise<DiscoveredVpnSoftware | undefined>;
  createDiscoveredVpnSoftware(software: InsertDiscoveredVpnSoftware): Promise<DiscoveredVpnSoftware>;
  updateDiscoveredVpnSoftware(id: string, software: Partial<InsertDiscoveredVpnSoftware>, userId: string): Promise<DiscoveredVpnSoftware | undefined>;
  deleteDiscoveredVpnSoftware(id: string, userId: string): Promise<boolean>;
  clearDiscoveredVpnSoftware(userId: string): Promise<boolean>; // Per rifare discovery completo

  // Discovery VPN Configurations - Configurazioni trovate per ogni software
  getDiscoveredVpnConfigurations(userId: string): Promise<DiscoveredVpnConfiguration[]>;
  getDiscoveredVpnConfigurationsBySoftware(discoveredSoftwareId: string, userId: string): Promise<DiscoveredVpnConfiguration[]>;
  getDiscoveredVpnConfigurationById(id: string, userId: string): Promise<DiscoveredVpnConfiguration | undefined>;
  createDiscoveredVpnConfiguration(config: InsertDiscoveredVpnConfiguration): Promise<DiscoveredVpnConfiguration>;
  updateDiscoveredVpnConfiguration(id: string, config: Partial<InsertDiscoveredVpnConfiguration>, userId: string): Promise<DiscoveredVpnConfiguration | undefined>;
  deleteDiscoveredVpnConfiguration(id: string, userId: string): Promise<boolean>;

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

  async getUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(asc(users.firstName));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    
    // Create default "Personal" organization for new user
    const [personalOrg] = await db
      .insert(organizations)
      .values({
        name: "Personal",
        description: "Organizzazione personale di " + (insertUser.firstName || insertUser.username),
        isActive: true
      })
      .returning();
    
    // Add user as admin of their personal organization
    await db
      .insert(userOrganizations)
      .values({
        userId: user.id,
        organizationId: personalOrg.id,
        role: "admin"
      });
    
    return user;
  }

  async updateUser(id: string, userData: Partial<InsertUser>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(userData)
      .where(eq(users.id, id))
      .returning();
    return updatedUser || undefined;
  }

  // Organizations
  async getOrganizations(userId: string): Promise<any[]> {
    const result = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        description: organizations.description,
        website: organizations.website,
        address: organizations.address,
        city: organizations.city,
        postalCode: organizations.postalCode,
        country: organizations.country,
        vatNumber: organizations.vatNumber,
        fiscalCode: organizations.fiscalCode,
        logoUrl: organizations.logoUrl,
        settings: organizations.settings,
        isActive: organizations.isActive,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
        userRole: userOrganizations.role,
      })
      .from(organizations)
      .innerJoin(userOrganizations, eq(organizations.id, userOrganizations.organizationId))
      .where(and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.isActive, true),
        eq(organizations.isActive, true)
      ))
      .orderBy(desc(organizations.updatedAt));
    
    return result;
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id));
    return organization || undefined;
  }

  async createOrganization(organization: InsertOrganization): Promise<Organization> {
    const [newOrganization] = await db
      .insert(organizations)
      .values(organization)
      .returning();
    return newOrganization;
  }

  async updateOrganization(id: string, organization: Partial<InsertOrganization>): Promise<Organization | undefined> {
    const [updatedOrganization] = await db
      .update(organizations)
      .set({ ...organization, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    return updatedOrganization || undefined;
  }

  async deleteOrganization(id: string): Promise<boolean> {
    try {
      // First, remove all user-organization relationships
      await db
        .delete(userOrganizations)
        .where(eq(userOrganizations.organizationId, id));
      
      // Then delete the organization
      const result = await db
        .delete(organizations)
        .where(eq(organizations.id, id));
      
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error("Error deleting organization:", error);
      return false;
    }
  }

  // User-Organization relationships
  async getUserOrganizations(userId: string): Promise<any[]> {
    const userOrgs = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        description: organizations.description,
        userRole: userOrganizations.role,
        createdAt: userOrganizations.createdAt,
      })
      .from(userOrganizations)
      .leftJoin(organizations, eq(userOrganizations.organizationId, organizations.id))
      .where(and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.isActive, true),
        eq(organizations.isActive, true)
      ))
      .orderBy(desc(userOrganizations.createdAt));
    
    return userOrgs;
  }

  async addUserToOrganization(userOrganization: InsertUserOrganization): Promise<UserOrganization> {
    const [newUserOrganization] = await db
      .insert(userOrganizations)
      .values(userOrganization)
      .returning();
    return newUserOrganization;
  }

  async removeUserFromOrganization(userId: string, organizationId: string): Promise<boolean> {
    const result = await db
      .update(userOrganizations)
      .set({ isActive: false })
      .where(and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.organizationId, organizationId)
      ));
    return (result.rowCount || 0) > 0;
  }

  // Organization Invitations
  async createInvitation(invitation: InsertOrganizationInvitation): Promise<OrganizationInvitation> {
    const [newInvitation] = await db
      .insert(organizationInvitations)
      .values(invitation)
      .returning();
    return newInvitation;
  }

  async getInvitationsByEmail(email: string): Promise<OrganizationInvitation[]> {
    return await db
      .select()
      .from(organizationInvitations)
      .where(and(
        eq(organizationInvitations.invitedEmail, email),
        eq(organizationInvitations.status, "pending")
      ))
      .orderBy(desc(organizationInvitations.createdAt));
  }

  async getInvitationByToken(token: string): Promise<OrganizationInvitation | undefined> {
    const [invitation] = await db
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.token, token));
    return invitation || undefined;
  }

  async updateInvitationStatus(token: string, status: 'accepted' | 'declined'): Promise<OrganizationInvitation | undefined> {
    const updateData: any = { 
      status, 
      updatedAt: new Date() 
    };
    
    if (status === 'accepted') {
      updateData.acceptedAt = new Date();
    } else if (status === 'declined') {
      updateData.declinedAt = new Date();
    }

    const [updatedInvitation] = await db
      .update(organizationInvitations)
      .set(updateData)
      .where(eq(organizationInvitations.token, token))
      .returning();
    return updatedInvitation || undefined;
  }

  async getUserInvitations(email: string): Promise<any[]> {
    const invitations = await db
      .select({
        id: organizationInvitations.id,
        token: organizationInvitations.token,
        role: organizationInvitations.role,
        message: organizationInvitations.message,
        organizationName: organizations.name,
        createdAt: organizationInvitations.createdAt,
      })
      .from(organizationInvitations)
      .leftJoin(organizations, eq(organizationInvitations.organizationId, organizations.id))
      .where(and(
        eq(organizationInvitations.invitedEmail, email),
        eq(organizationInvitations.status, "pending")
      ))
      .orderBy(desc(organizationInvitations.createdAt));
    
    return invitations;
  }

  async acceptInvitation(token: string, userId: string, userEmail: string): Promise<any> {
    const invitation = await this.getInvitationByToken(token);
    if (!invitation) {
      throw new Error("Invitation not found");
    }
    
    if (invitation.invitedEmail !== userEmail) {
      throw new Error("Email does not match invitation");
    }
    
    if (invitation.status !== "pending") {
      throw new Error("Invitation already processed");
    }
    
    // Accept the invitation
    await this.updateInvitationStatus(token, 'accepted');
    
    // Add user to organization
    await this.addUserToOrganization({
      userId,
      organizationId: invitation.organizationId,
      role: invitation.role,
      isActive: true,
    });
    
    return { success: true, organizationId: invitation.organizationId };
  }

  // Projects
  async getProjects(userId: string, organizationId: string): Promise<Project[]> {
    return await db.select().from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.organizationId, organizationId)))
      .orderBy(desc(projects.updatedAt));
  }

  async getProject(id: string, userId: string, organizationId: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId), eq(projects.organizationId, organizationId)));
    return project || undefined;
  }

  async createProject(project: InsertProject & { organizationId: string }): Promise<Project> {
    const [newProject] = await db
      .insert(projects)
      .values(project)
      .returning();
    return newProject;
  }

  async updateProject(id: string, project: Partial<InsertProject>, userId: string, organizationId: string): Promise<Project | undefined> {
    const [updatedProject] = await db
      .update(projects)
      .set({ ...project, updatedAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.userId, userId), eq(projects.organizationId, organizationId)))
      .returning();
    return updatedProject || undefined;
  }

  async deleteProject(id: string, userId: string, organizationId: string): Promise<boolean> {
    const result = await db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId), eq(projects.organizationId, organizationId)));
    return (result.rowCount || 0) > 0;
  }

  // Tasks
  async getTasks(userId: string, organizationId: string): Promise<Task[]> {
    const result = await db.select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      taskType: tasks.taskType,
      projectId: tasks.projectId,
      parentTaskId: tasks.parentTaskId,
      userId: tasks.userId,
      assignedTo: tasks.assignedTo,
      sapSystemId: tasks.sapSystemId,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      estimatedEffort: tasks.estimatedEffort,
      remainingEffort: tasks.remainingEffort,
      completionPercentage: tasks.completionPercentage,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      projectName: projects.name,
    }).from(tasks)
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(eq(tasks.userId, userId), eq(tasks.organizationId, organizationId)))
      .orderBy(desc(tasks.updatedAt));
    
    return result as any[];
  }

  async getTasksByProject(projectId: string, userId: string, organizationId: string): Promise<Task[]> {
    return await db.select().from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.userId, userId), eq(tasks.organizationId, organizationId)))
      .orderBy(asc(tasks.createdAt));
  }

  async getTask(id: string, userId: string, organizationId: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId), eq(tasks.organizationId, organizationId)));
    return task || undefined;
  }

  async getTaskConnectionInfo(taskId: string, userId: string): Promise<any> {
    const [result] = await db
      .select({
        // Task info
        taskId: tasks.id,
        taskTitle: tasks.title,
        taskDescription: tasks.description,
        taskStatus: tasks.status,
        
        // SAP System info
        sapSystemId: sapSystems.id,
        sapSystemName: sapSystems.name,
        sapSystemDescription: sapSystems.description,
        sapSystemType: sapSystems.systemType,
        sapServerHost: sapSystems.serverHost,
        sapSystemNumber: sapSystems.systemNumber,
        sapApplicationServerPort: sapSystems.applicationServerPort,
        sapMessageServerPort: sapSystems.messageServerPort,
        sapReleaseVersion: sapSystems.sapReleaseVersion,
        sapKernelVersion: sapSystems.kernelVersion,
        sapLandscape: sapSystems.landscape,
        
        // VPN Connection info
        vpnConnectionId: vpnConnections.id,
        vpnConnectionName: vpnConnections.name,
        vpnConnectionType: vpnConnections.connectionType,
        vpnServerHost: vpnConnections.serverHost,
        vpnServerPort: vpnConnections.serverPort,
        vpnProtocol: vpnConnections.protocol,
        vpnConfigFileContent: vpnConnections.configFileContent,
        vpnAllowedIpRanges: vpnConnections.allowedIpRanges,
        vpnDnsServers: vpnConnections.dnsServers,
        
        // VPN Software info
        vpnSoftwareId: vpnSoftware.id,
        vpnSoftwareName: vpnSoftware.name,
        vpnSoftwareVendor: vpnSoftware.vendor,
        vpnSoftwareVersion: vpnSoftware.version,
        vpnSoftwareIconUrl: vpnSoftware.iconUrl,
        vpnSoftwareDownloadUrl: vpnSoftware.downloadUrl,
        vpnSoftwareDocumentationUrl: vpnSoftware.documentationUrl,
        vpnSupportedPlatforms: vpnSoftware.supportedPlatforms,
        
        // Partner info
        partnerId: partners.id,
        partnerName: partners.name,
        partnerCompany: partners.company,
        partnerEmail: partners.email,
      })
      .from(tasks)
      .leftJoin(sapSystems, eq(tasks.sapSystemId, sapSystems.id))
      .leftJoin(vpnConnections, eq(sapSystems.vpnConnectionId, vpnConnections.id))
      .leftJoin(vpnSoftware, eq(tasks.id, tasks.id)) // Remove invalid join - vpnConnections doesn't have vpnSoftwareId
      .leftJoin(partners, eq(sapSystems.partnerId, partners.id))
      .where(and(
        eq(tasks.id, taskId), 
        eq(tasks.userId, userId),
        isNotNull(tasks.sapSystemId) // Solo task con sistema SAP collegato
      ));

    if (!result) {
      return null;
    }

    // Get SAP credentials for this system
    const credentials = await db
      .select({
        credentialId: sapSystemCredentials.id,
        username: sapSystemCredentials.username,
        password: sapSystemCredentials.password,
        description: sapSystemCredentials.description,
        userType: sapSystemCredentials.userType,
        authorizationProfile: sapSystemCredentials.authorizationProfile,
        validFrom: sapSystemCredentials.validFrom,
        validTo: sapSystemCredentials.validTo,
        isActive: sapSystemCredentials.isActive,
      })
      .from(sapSystemCredentials)
      .where(and(
        eq(sapSystemCredentials.sapSystemId, result.sapSystemId!),
        eq(sapSystemCredentials.userId, userId),
        eq(sapSystemCredentials.isActive, true)
      ));

    return {
      ...result,
      sapCredentials: credentials
    };
  }

  async createTask(task: InsertTask & { organizationId: string }): Promise<Task> {
    const [newTask] = await db
      .insert(tasks)
      .values(task)
      .returning();
    return newTask;
  }

  async updateTask(id: string, task: Partial<InsertTask>, userId: string, organizationId: string): Promise<Task | undefined> {
    const updateData: any = { ...task, updatedAt: new Date() };
    if (task.status === 'completed') {
      updateData.completedAt = new Date();
    }
    
    const [updatedTask] = await db
      .update(tasks)
      .set(updateData)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId), eq(tasks.organizationId, organizationId)))
      .returning();
    return updatedTask || undefined;
  }

  async deleteTask(id: string, userId: string, organizationId: string): Promise<boolean> {
    const result = await db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId), eq(tasks.organizationId, organizationId)));
    return (result.rowCount || 0) > 0;
  }

  // Partners
  async getPartners(userId: string, organizationId: string): Promise<Partner[]> {
    return await db.select().from(partners)
      .where(and(eq(partners.userId, userId), eq(partners.organizationId, organizationId)))
      .orderBy(desc(partners.updatedAt));
  }

  async getPartner(id: string, userId: string, organizationId: string): Promise<Partner | undefined> {
    const [partner] = await db.select().from(partners)
      .where(and(eq(partners.id, id), eq(partners.userId, userId), eq(partners.organizationId, organizationId)));
    return partner || undefined;
  }

  async createPartner(partner: InsertPartner & { organizationId: string }): Promise<Partner> {
    const [newPartner] = await db
      .insert(partners)
      .values(partner)
      .returning();
    return newPartner;
  }

  async updatePartner(id: string, partner: Partial<InsertPartner>, userId: string, organizationId: string): Promise<Partner | undefined> {
    const [updatedPartner] = await db
      .update(partners)
      .set({ ...partner, updatedAt: new Date() })
      .where(and(eq(partners.id, id), eq(partners.userId, userId), eq(partners.organizationId, organizationId)))
      .returning();
    return updatedPartner || undefined;
  }

  async deletePartner(id: string, userId: string, organizationId: string): Promise<boolean> {
    const result = await db
      .delete(partners)
      .where(and(eq(partners.id, id), eq(partners.userId, userId), eq(partners.organizationId, organizationId)));
    return (result.rowCount || 0) > 0;
  }

  // Deals
  async getDeals(userId: string, organizationId: string): Promise<Deal[]> {
    return await db.select().from(deals)
      .where(and(eq(deals.userId, userId), eq(deals.organizationId, organizationId)))
      .orderBy(desc(deals.updatedAt));
  }

  async getDeal(id: string, userId: string, organizationId: string): Promise<Deal | undefined> {
    const [deal] = await db.select().from(deals)
      .where(and(eq(deals.id, id), eq(deals.userId, userId), eq(deals.organizationId, organizationId)));
    return deal || undefined;
  }

  async createDeal(deal: InsertDeal & { organizationId: string }): Promise<Deal> {
    const [newDeal] = await db
      .insert(deals)
      .values(deal)
      .returning();
    return newDeal;
  }

  async updateDeal(id: string, deal: Partial<InsertDeal>, userId: string, organizationId: string): Promise<Deal | undefined> {
    const updateData: any = { ...deal, updatedAt: new Date() };
    if (deal.stage === 'won' || deal.stage === 'lost') {
      updateData.actualCloseDate = new Date();
    }

    const [updatedDeal] = await db
      .update(deals)
      .set(updateData)
      .where(and(eq(deals.id, id), eq(deals.userId, userId), eq(deals.organizationId, organizationId)))
      .returning();
    return updatedDeal || undefined;
  }

  async deleteDeal(id: string, userId: string, organizationId: string): Promise<boolean> {
    const result = await db
      .delete(deals)
      .where(and(eq(deals.id, id), eq(deals.userId, userId), eq(deals.organizationId, organizationId)));
    return (result.rowCount || 0) > 0;
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
    return (result.rowCount || 0) > 0;
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
    // Verify project exists - since planning windows are not organization-specific
    // we'll just check if the project exists and belongs to user
    const [projectCheck] = await db.select().from(projects).where(
      and(eq(projects.id, projectId), eq(projects.userId, userId))
    );
    if (!projectCheck) return [];
    
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
    return (result.rowCount || 0) > 0;
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
    return (result.rowCount || 0) > 0;
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
    return (result.rowCount || 0) > 0;
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
    return (result.rowCount || 0) > 0;
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
    return (result.rowCount || 0) > 0;
  }

  // Timesheets
  async getTimesheets(userId: string): Promise<Timesheet[]> {
    return await db
      .select()
      .from(timesheets)
      .where(eq(timesheets.userId, userId))
      .orderBy(desc(timesheets.createdAt));
  }

  async getTimesheet(id: string, userId: string): Promise<Timesheet | undefined> {
    const [timesheet] = await db
      .select()
      .from(timesheets)
      .where(and(eq(timesheets.id, id), eq(timesheets.userId, userId)));
    return timesheet || undefined;
  }

  async createTimesheet(timesheet: InsertTimesheet): Promise<Timesheet> {
    const [newTimesheet] = await db
      .insert(timesheets)
      .values(timesheet)
      .returning();
    return newTimesheet;
  }

  async updateTimesheet(id: string, timesheet: Partial<InsertTimesheet>, userId: string): Promise<Timesheet | undefined> {
    const [updated] = await db
      .update(timesheets)
      .set({ ...timesheet, updatedAt: new Date() })
      .where(and(eq(timesheets.id, id), eq(timesheets.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteTimesheet(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(timesheets)
      .where(and(eq(timesheets.id, id), eq(timesheets.userId, userId)));
    return (result.rowCount || 0) > 0;
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
    return (result.rowCount || 0) > 0;
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
    return (result.rowCount || 0) > 0;
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
    return (result.rowCount || 0) > 0;
  }

  async deactivateAllEmailConfigs(userId: string): Promise<void> {
    await db
      .update(emailConfigs)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(emailConfigs.userId, userId));
  }

  // Rate Agreements
  async getRateAgreements(userId: string): Promise<RateAgreement[]> {
    return await db
      .select()
      .from(rateAgreements)
      .where(eq(rateAgreements.userId, userId))
      .orderBy(desc(rateAgreements.priority), desc(rateAgreements.updatedAt));
  }

  async getRateAgreement(id: string, userId: string): Promise<RateAgreement | undefined> {
    const [agreement] = await db
      .select()
      .from(rateAgreements)
      .where(and(eq(rateAgreements.id, id), eq(rateAgreements.userId, userId)));
    return agreement || undefined;
  }

  async createRateAgreement(agreement: InsertRateAgreement): Promise<RateAgreement> {
    const [newAgreement] = await db
      .insert(rateAgreements)
      .values(agreement)
      .returning();
    return newAgreement;
  }

  async updateRateAgreement(id: string, agreement: Partial<InsertRateAgreement>, userId: string): Promise<RateAgreement | undefined> {
    const [updated] = await db
      .update(rateAgreements)
      .set({ ...agreement, updatedAt: new Date() })
      .where(and(eq(rateAgreements.id, id), eq(rateAgreements.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteRateAgreement(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(rateAgreements)
      .where(and(eq(rateAgreements.id, id), eq(rateAgreements.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  async getActiveRateAgreements(userId: string): Promise<RateAgreement[]> {
    const now = new Date();
    return await db
      .select()
      .from(rateAgreements)
      .where(
        and(
          eq(rateAgreements.userId, userId),
          eq(rateAgreements.isActive, true),
          sql`${rateAgreements.validFrom} <= ${now}`,
          sql`(${rateAgreements.validTo} IS NULL OR ${rateAgreements.validTo} >= ${now})`
        )
      )
      .orderBy(desc(rateAgreements.priority));
  }

  async resolveRateForContext(
    userId: string, 
    context: { partnerId?: string; projectId?: string; taskId?: string; taskType?: string; humanResourceId?: string }
  ): Promise<RateAgreement | undefined> {
    const activeAgreements = await this.getActiveRateAgreements(userId);
    
    // Ordina per priorità e numero di campi matchanti (più specifico = priorità maggiore)
    let bestMatch: RateAgreement | undefined;
    let bestMatchScore = 0;

    for (const agreement of activeAgreements) {
      try {
        const groupingValues = JSON.parse(agreement.groupingValues);
        let matchScore = 0;
        let allFieldsMatch = true;

        // Verifica se tutti i campi dell'accordo corrispondono al contesto
        for (const field of agreement.groupingFields) {
          const expectedValue = groupingValues[field];
          const contextValue = context[field as keyof typeof context];

          if (expectedValue && contextValue === expectedValue) {
            matchScore++;
          } else if (expectedValue) {
            // Campo richiesto ma non match
            allFieldsMatch = false;
            break;
          }
        }

        // Se tutti i campi matchano e il punteggio è migliore, aggiorna il best match
        if (allFieldsMatch && matchScore > bestMatchScore) {
          bestMatch = agreement;
          bestMatchScore = matchScore;
        }
      } catch (error) {
        console.error('Error parsing groupingValues for agreement:', agreement.id, error);
      }
    }

    return bestMatch;
  }

  // Human Resources
  async getHumanResources(userId: string): Promise<HumanResource[]> {
    return await db.select().from(humanResources)
      .where(eq(humanResources.userId, userId))
      .orderBy(desc(humanResources.createdAt));
  }

  async getHumanResource(id: string, userId: string): Promise<HumanResource | undefined> {
    const [resource] = await db.select().from(humanResources)
      .where(and(eq(humanResources.id, id), eq(humanResources.userId, userId)));
    return resource || undefined;
  }

  async createHumanResource(resource: InsertHumanResource): Promise<HumanResource> {
    const [newResource] = await db
      .insert(humanResources)
      .values(resource)
      .returning();
    return newResource;
  }

  async updateHumanResource(id: string, resource: Partial<InsertHumanResource>, userId: string): Promise<HumanResource | undefined> {
    const [updatedResource] = await db
      .update(humanResources)
      .set({ ...resource, updatedAt: new Date() })
      .where(and(eq(humanResources.id, id), eq(humanResources.userId, userId)))
      .returning();
    return updatedResource || undefined;
  }

  async deleteHumanResource(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(humanResources)
      .where(and(eq(humanResources.id, id), eq(humanResources.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  async getHumanResourceByLinkedUser(userId: string, linkedUserId: string): Promise<HumanResource | undefined> {
    const [resource] = await db.select().from(humanResources)
      .where(and(
        eq(humanResources.userId, userId),
        eq(humanResources.linkedUserId, linkedUserId)
      ));
    return resource || undefined;
  }

  // SAP Systems
  async getSapSystems(userId: string): Promise<SapSystem[]> {
    return await db.select({
      id: sapSystems.id,
      userId: sapSystems.userId,
      organizationId: sapSystems.organizationId,
      partnerId: sapSystems.partnerId,
      projectId: sapSystems.projectId,
      name: sapSystems.name,
      description: sapSystems.description,
      systemType: sapSystems.systemType,
      status: sapSystems.status,
      serverHost: sapSystems.serverHost,
      systemNumber: sapSystems.systemNumber,
      applicationServerPort: sapSystems.applicationServerPort,
      messageServerPort: sapSystems.messageServerPort,
      landscape: sapSystems.landscape,
      sapReleaseVersion: sapSystems.sapReleaseVersion,
      kernelVersion: sapSystems.kernelVersion,
      notes: sapSystems.notes,
      isActive: sapSystems.isActive,
      vpnConnectionId: sapSystems.vpnConnectionId,
      createdAt: sapSystems.createdAt,
      updatedAt: sapSystems.updatedAt,
      partner: {
        id: partners.id,
        name: partners.name,
        company: partners.company,
        type: partners.type,
      }
    })
    .from(sapSystems)
    .leftJoin(partners, eq(sapSystems.partnerId, partners.id))
    .where(eq(sapSystems.userId, userId))
    .orderBy(desc(sapSystems.createdAt));
  }

  async getSapSystemsByPartner(partnerId: string, userId: string): Promise<SapSystem[]> {
    return await db.select().from(sapSystems)
      .where(and(
        eq(sapSystems.partnerId, partnerId),
        eq(sapSystems.userId, userId)
      ))
      .orderBy(desc(sapSystems.createdAt));
  }

  async getSapSystem(id: string, userId: string): Promise<SapSystem | undefined> {
    const [system] = await db.select().from(sapSystems)
      .where(and(eq(sapSystems.id, id), eq(sapSystems.userId, userId)));
    return system || undefined;
  }

  async createSapSystem(system: InsertSapSystem): Promise<SapSystem> {
    const [newSystem] = await db
      .insert(sapSystems)
      .values(system)
      .returning();
    return newSystem;
  }

  async updateSapSystem(id: string, system: Partial<InsertSapSystem>, userId: string): Promise<SapSystem | undefined> {
    const [updatedSystem] = await db
      .update(sapSystems)
      .set({ ...system, updatedAt: new Date() })
      .where(and(eq(sapSystems.id, id), eq(sapSystems.userId, userId)))
      .returning();
    return updatedSystem || undefined;
  }

  async deleteSapSystem(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(sapSystems)
      .where(and(eq(sapSystems.id, id), eq(sapSystems.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  // SAP System Credentials
  async getSapSystemCredentials(sapSystemId: string, userId: string): Promise<SapSystemCredentials[]> {
    return await db.select().from(sapSystemCredentials)
      .where(and(
        eq(sapSystemCredentials.sapSystemId, sapSystemId),
        eq(sapSystemCredentials.userId, userId)
      ))
      .orderBy(desc(sapSystemCredentials.createdAt));
  }

  async getSapSystemCredential(id: string, userId: string): Promise<SapSystemCredentials | undefined> {
    const [credential] = await db.select().from(sapSystemCredentials)
      .where(and(eq(sapSystemCredentials.id, id), eq(sapSystemCredentials.userId, userId)));
    return credential || undefined;
  }

  async createSapSystemCredential(credential: InsertSapSystemCredentials): Promise<SapSystemCredentials> {
    const [newCredential] = await db
      .insert(sapSystemCredentials)
      .values(credential)
      .returning();
    return newCredential;
  }

  async updateSapSystemCredential(id: string, credential: Partial<InsertSapSystemCredentials>, userId: string): Promise<SapSystemCredentials | undefined> {
    const [updatedCredential] = await db
      .update(sapSystemCredentials)
      .set({ ...credential, updatedAt: new Date() })
      .where(and(eq(sapSystemCredentials.id, id), eq(sapSystemCredentials.userId, userId)))
      .returning();
    return updatedCredential || undefined;
  }

  async deleteSapSystemCredential(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(sapSystemCredentials)
      .where(and(eq(sapSystemCredentials.id, id), eq(sapSystemCredentials.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  async getActiveSapSystemCredentials(sapSystemId: string, userId: string): Promise<SapSystemCredentials[]> {
    return await db.select().from(sapSystemCredentials)
      .where(and(
        eq(sapSystemCredentials.sapSystemId, sapSystemId),
        eq(sapSystemCredentials.userId, userId),
        eq(sapSystemCredentials.isActive, true)
      ))
      .orderBy(desc(sapSystemCredentials.createdAt));
  }

  // VPN Connections
  async getVpnConnections(userId: string): Promise<VpnConnection[]> {
    return await db.select().from(vpnConnections)
      .where(eq(vpnConnections.userId, userId))
      .orderBy(desc(vpnConnections.createdAt));
  }

  async getVpnConnectionsByPartner(partnerId: string, userId: string): Promise<VpnConnection[]> {
    return await db.select().from(vpnConnections)
      .where(and(
        eq(vpnConnections.partnerId, partnerId),
        eq(vpnConnections.userId, userId)
      ))
      .orderBy(desc(vpnConnections.createdAt));
  }

  async getVpnConnection(id: string, userId: string): Promise<VpnConnection | undefined> {
    const [connection] = await db.select().from(vpnConnections)
      .where(and(eq(vpnConnections.id, id), eq(vpnConnections.userId, userId)));
    return connection || undefined;
  }

  async createVpnConnection(connection: InsertVpnConnection, userId: string): Promise<VpnConnection> {
    const [newConnection] = await db
      .insert(vpnConnections)
      .values([{ ...connection, userId }])
      .returning();
    return newConnection;
  }

  async updateVpnConnection(id: string, connection: Partial<InsertVpnConnection>, userId: string): Promise<VpnConnection | undefined> {
    const [updatedConnection] = await db
      .update(vpnConnections)
      .set({ ...connection, updatedAt: new Date() })
      .where(and(eq(vpnConnections.id, id), eq(vpnConnections.userId, userId)))
      .returning();
    return updatedConnection || undefined;
  }

  async deleteVpnConnection(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(vpnConnections)
      .where(and(eq(vpnConnections.id, id), eq(vpnConnections.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  // VPN Credentials
  async getVpnCredentials(vpnConnectionId: string, userId: string): Promise<VpnCredentials[]> {
    return await db.select().from(vpnCredentials)
      .where(and(
        eq(vpnCredentials.vpnConnectionId, vpnConnectionId),
        eq(vpnCredentials.userId, userId)
      ))
      .orderBy(desc(vpnCredentials.createdAt));
  }

  async getVpnCredential(id: string, userId: string): Promise<VpnCredentials | undefined> {
    const [credential] = await db.select().from(vpnCredentials)
      .where(and(eq(vpnCredentials.id, id), eq(vpnCredentials.userId, userId)));
    return credential || undefined;
  }

  async createVpnCredential(credential: InsertVpnCredentials): Promise<VpnCredentials> {
    const [newCredential] = await db
      .insert(vpnCredentials)
      .values(credential)
      .returning();
    return newCredential;
  }

  async updateVpnCredential(id: string, credential: Partial<InsertVpnCredentials>, userId: string): Promise<VpnCredentials | undefined> {
    const [updatedCredential] = await db
      .update(vpnCredentials)
      .set({ ...credential, updatedAt: new Date() })
      .where(and(eq(vpnCredentials.id, id), eq(vpnCredentials.userId, userId)))
      .returning();
    return updatedCredential || undefined;
  }

  async deleteVpnCredential(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(vpnCredentials)
      .where(and(eq(vpnCredentials.id, id), eq(vpnCredentials.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  async getActiveVpnCredentials(vpnConnectionId: string, userId: string): Promise<VpnCredentials[]> {
    return await db.select().from(vpnCredentials)
      .where(and(
        eq(vpnCredentials.vpnConnectionId, vpnConnectionId),
        eq(vpnCredentials.userId, userId),
        eq(vpnCredentials.isActive, true)
      ))
      .orderBy(desc(vpnCredentials.createdAt));
  }

  // Transport Requests
  async getTransportRequests(userId: string): Promise<TransportRequest[]> {
    return await db.select().from(transportRequests)
      .where(eq(transportRequests.userId, userId))
      .orderBy(desc(transportRequests.createdAt));
  }

  async getTransportRequestsBySapSystem(sapSystemId: string, userId: string): Promise<TransportRequest[]> {
    return await db.select().from(transportRequests)
      .where(and(
        eq(transportRequests.sapSystemId, sapSystemId),
        eq(transportRequests.userId, userId)
      ))
      .orderBy(desc(transportRequests.createdAt));
  }

  async getTransportRequestsByProject(projectId: string, userId: string): Promise<TransportRequest[]> {
    return await db.select().from(transportRequests)
      .where(and(
        eq(transportRequests.projectId, projectId),
        eq(transportRequests.userId, userId)
      ))
      .orderBy(desc(transportRequests.createdAt));
  }

  async getTransportRequest(id: string, userId: string): Promise<TransportRequest | undefined> {
    const [request] = await db.select().from(transportRequests)
      .where(and(eq(transportRequests.id, id), eq(transportRequests.userId, userId)));
    return request || undefined;
  }

  async createTransportRequest(request: InsertTransportRequest): Promise<TransportRequest> {
    const [newRequest] = await db
      .insert(transportRequests)
      .values(request)
      .returning();
    return newRequest;
  }

  async updateTransportRequest(id: string, request: Partial<InsertTransportRequest>, userId: string): Promise<TransportRequest | undefined> {
    const [updatedRequest] = await db
      .update(transportRequests)
      .set({ ...request, updatedAt: new Date() })
      .where(and(eq(transportRequests.id, id), eq(transportRequests.userId, userId)))
      .returning();
    return updatedRequest || undefined;
  }

  async deleteTransportRequest(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(transportRequests)
      .where(and(eq(transportRequests.id, id), eq(transportRequests.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  async getTransportRequestByNumber(requestNumber: string, userId: string): Promise<TransportRequest | undefined> {
    const [request] = await db.select().from(transportRequests)
      .where(and(
        eq(transportRequests.requestNumber, requestNumber),
        eq(transportRequests.userId, userId)
      ));
    return request || undefined;
  }

  // Intervention Documents
  async getInterventionDocuments(userId: string): Promise<InterventionDocument[]> {
    return await db.select().from(interventionDocuments)
      .where(eq(interventionDocuments.userId, userId))
      .orderBy(desc(interventionDocuments.createdAt));
  }

  async getInterventionDocumentsByProject(projectId: string, userId: string): Promise<InterventionDocument[]> {
    return await db.select().from(interventionDocuments)
      .where(and(
        eq(interventionDocuments.projectId, projectId),
        eq(interventionDocuments.userId, userId)
      ))
      .orderBy(desc(interventionDocuments.createdAt));
  }

  async getInterventionDocumentsByTransportRequest(transportRequestId: string, userId: string): Promise<InterventionDocument[]> {
    return await db.select().from(interventionDocuments)
      .where(and(
        eq(interventionDocuments.transportRequestId, transportRequestId),
        eq(interventionDocuments.userId, userId)
      ))
      .orderBy(desc(interventionDocuments.createdAt));
  }

  async getInterventionDocument(id: string, userId: string): Promise<InterventionDocument | undefined> {
    const [document] = await db.select().from(interventionDocuments)
      .where(and(eq(interventionDocuments.id, id), eq(interventionDocuments.userId, userId)));
    return document || undefined;
  }

  async createInterventionDocument(document: InsertInterventionDocument): Promise<InterventionDocument> {
    const [newDocument] = await db
      .insert(interventionDocuments)
      .values(document)
      .returning();
    return newDocument;
  }

  async updateInterventionDocument(id: string, document: Partial<InsertInterventionDocument>, userId: string): Promise<InterventionDocument | undefined> {
    const [updatedDocument] = await db
      .update(interventionDocuments)
      .set({ ...document, updatedAt: new Date() })
      .where(and(eq(interventionDocuments.id, id), eq(interventionDocuments.userId, userId)))
      .returning();
    return updatedDocument || undefined;
  }

  async deleteInterventionDocument(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(interventionDocuments)
      .where(and(eq(interventionDocuments.id, id), eq(interventionDocuments.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  async getInterventionDocumentsByStatus(status: string, userId: string): Promise<InterventionDocument[]> {
    return await db.select().from(interventionDocuments)
      .where(and(
        eq(interventionDocuments.status, status as any),
        eq(interventionDocuments.userId, userId)
      ))
      .orderBy(desc(interventionDocuments.createdAt));
  }

  // System Credentials (unified SAP + VPN)
  async getSystemCredentials(userId: string): Promise<SystemCredentials[]> {
    return await db.select().from(systemCredentials)
      .where(eq(systemCredentials.userId, userId))
      .orderBy(desc(systemCredentials.createdAt));
  }

  async getSystemCredential(id: string, userId: string): Promise<SystemCredentials | undefined> {
    const [credential] = await db.select().from(systemCredentials)
      .where(and(
        eq(systemCredentials.id, id),
        eq(systemCredentials.userId, userId)
      ));
    return credential || undefined;
  }

  async getSystemCredentialsBySystem(systemId: string, systemType: "sap" | "vpn", userId: string): Promise<SystemCredentials[]> {
    return await db.select().from(systemCredentials)
      .where(and(
        eq(systemCredentials.systemId, systemId),
        eq(systemCredentials.systemType, systemType),
        eq(systemCredentials.userId, userId)
      ))
      .orderBy(desc(systemCredentials.createdAt));
  }

  async createSystemCredential(credential: InsertSystemCredentials): Promise<SystemCredentials> {
    const [newCredential] = await db
      .insert(systemCredentials)
      .values(credential)
      .returning();
    return newCredential;
  }

  async updateSystemCredential(id: string, credential: Partial<InsertSystemCredentials>, userId: string): Promise<SystemCredentials | undefined> {
    const [updated] = await db
      .update(systemCredentials)
      .set({ ...credential, updatedAt: new Date() })
      .where(and(
        eq(systemCredentials.id, id),
        eq(systemCredentials.userId, userId)
      ))
      .returning();
    return updated || undefined;
  }

  async deleteSystemCredential(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(systemCredentials)
      .where(and(
        eq(systemCredentials.id, id),
        eq(systemCredentials.userId, userId)
      ));
    return (result.rowCount || 0) > 0;
  }

  // VPN Software (Master Data) 
  async getVpnSoftware(): Promise<VpnSoftware[]> {
    return await db.select().from(vpnSoftware)
      .where(eq(vpnSoftware.isActive, true))
      .orderBy(asc(vpnSoftware.vendor), asc(vpnSoftware.name));
  }

  async getVpnSoftwareById(id: string): Promise<VpnSoftware | undefined> {
    const [software] = await db.select().from(vpnSoftware)
      .where(eq(vpnSoftware.id, id));
    return software || undefined;
  }

  async createVpnSoftware(insertSoftware: InsertVpnSoftware): Promise<VpnSoftware> {
    const [software] = await db
      .insert(vpnSoftware)
      .values(insertSoftware)
      .returning();
    return software;
  }

  async updateVpnSoftware(id: string, softwareData: Partial<InsertVpnSoftware>): Promise<VpnSoftware | undefined> {
    const [software] = await db
      .update(vpnSoftware)
      .set(softwareData)
      .where(eq(vpnSoftware.id, id))
      .returning();
    return software || undefined;
  }

  async deleteVpnSoftware(id: string): Promise<boolean> {
    const result = await db
      .delete(vpnSoftware)
      .where(eq(vpnSoftware.id, id));
    return (result.rowCount || 0) > 0;
  }

  // VPN Systems
  async getVpnSystems(userId: string): Promise<VpnSystems[]> {
    return await db.select({
      id: vpnSystems.id,
      name: vpnSystems.name,
      serverHost: vpnSystems.serverHost,
      serverPort: vpnSystems.serverPort,
      status: vpnSystems.status,
      description: vpnSystems.description,
      partnerId: vpnSystems.partnerId,
      vpnSoftwareId: vpnSystems.vpnSoftwareId,
      userId: vpnSystems.userId,
      username: vpnSystems.username,
      connectionProfile: vpnSystems.connectionProfile,
      configNotes: vpnSystems.configNotes,
      autoStart: vpnSystems.autoStart,
      notes: vpnSystems.notes,
      createdAt: vpnSystems.createdAt,
      updatedAt: vpnSystems.updatedAt,
      lastConnected: vpnSystems.lastConnected,
      partner: {
        id: partners.id,
        name: partners.name,
        company: partners.company
      },
      vpnSoftware: {
        id: vpnSoftware.id,
        name: vpnSoftware.name,
        vendor: vpnSoftware.vendor,
        iconUrl: vpnSoftware.iconUrl
      }
    })
    .from(vpnSystems)
    .leftJoin(partners, eq(vpnSystems.partnerId, partners.id))
    .leftJoin(vpnSoftware, eq(vpnSystems.vpnSoftwareId, vpnSoftware.id))
    .where(eq(vpnSystems.userId, userId))
    .orderBy(desc(vpnSystems.createdAt));
  }

  async getVpnSystemsByPartner(partnerId: string, userId: string): Promise<VpnSystems[]> {
    return await db.select().from(vpnSystems)
      .where(and(eq(vpnSystems.partnerId, partnerId), eq(vpnSystems.userId, userId)))
      .orderBy(desc(vpnSystems.createdAt));
  }

  async getVpnSystem(id: string, userId: string): Promise<VpnSystems | undefined> {
    const [system] = await db.select().from(vpnSystems)
      .where(and(eq(vpnSystems.id, id), eq(vpnSystems.userId, userId)));
    return system || undefined;
  }

  async createVpnSystem(insertSystem: InsertVpnSystems): Promise<VpnSystems> {
    const [system] = await db
      .insert(vpnSystems)
      .values(insertSystem)
      .returning();
    return system;
  }

  async updateVpnSystem(id: string, systemData: Partial<InsertVpnSystems>, userId: string): Promise<VpnSystems | undefined> {
    const [system] = await db
      .update(vpnSystems)
      .set(systemData)
      .where(and(eq(vpnSystems.id, id), eq(vpnSystems.userId, userId)))
      .returning();
    return system || undefined;
  }

  async deleteVpnSystem(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(vpnSystems)
      .where(and(eq(vpnSystems.id, id), eq(vpnSystems.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  // Discovery VPN Software Methods
  async getDiscoveredVpnSoftware(userId: string): Promise<DiscoveredVpnSoftware[]> {
    return await db.select().from(discoveredVpnSoftware)
      .where(eq(discoveredVpnSoftware.userId, userId));
  }

  async getDiscoveredVpnSoftwareById(id: string, userId: string): Promise<DiscoveredVpnSoftware | undefined> {
    const [software] = await db.select().from(discoveredVpnSoftware)
      .where(and(eq(discoveredVpnSoftware.id, id), eq(discoveredVpnSoftware.userId, userId)));
    return software || undefined;
  }

  async createDiscoveredVpnSoftware(software: InsertDiscoveredVpnSoftware): Promise<DiscoveredVpnSoftware> {
    const [newSoftware] = await db
      .insert(discoveredVpnSoftware)
      .values(software)
      .returning();
    return newSoftware;
  }

  async updateDiscoveredVpnSoftware(id: string, software: Partial<InsertDiscoveredVpnSoftware>, userId: string): Promise<DiscoveredVpnSoftware | undefined> {
    const [updatedSoftware] = await db
      .update(discoveredVpnSoftware)
      .set({ ...software, updatedAt: new Date() })
      .where(and(eq(discoveredVpnSoftware.id, id), eq(discoveredVpnSoftware.userId, userId)))
      .returning();
    return updatedSoftware || undefined;
  }

  async deleteDiscoveredVpnSoftware(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(discoveredVpnSoftware)
      .where(and(eq(discoveredVpnSoftware.id, id), eq(discoveredVpnSoftware.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  async clearDiscoveredVpnSoftware(userId: string): Promise<boolean> {
    const result = await db
      .delete(discoveredVpnSoftware)
      .where(eq(discoveredVpnSoftware.userId, userId));
    return (result.rowCount || 0) >= 0; // Allow zero rows as success
  }

  // Discovery VPN Configurations Methods
  async getDiscoveredVpnConfigurations(userId: string): Promise<DiscoveredVpnConfiguration[]> {
    return await db.select().from(discoveredVpnConfigurations)
      .where(eq(discoveredVpnConfigurations.userId, userId));
  }

  async getDiscoveredVpnConfigurationsBySoftware(discoveredSoftwareId: string, userId: string): Promise<DiscoveredVpnConfiguration[]> {
    return await db.select().from(discoveredVpnConfigurations)
      .where(and(
        eq(discoveredVpnConfigurations.discoveredSoftwareId, discoveredSoftwareId),
        eq(discoveredVpnConfigurations.userId, userId)
      ));
  }

  async getDiscoveredVpnConfigurationById(id: string, userId: string): Promise<DiscoveredVpnConfiguration | undefined> {
    const [config] = await db.select().from(discoveredVpnConfigurations)
      .where(and(eq(discoveredVpnConfigurations.id, id), eq(discoveredVpnConfigurations.userId, userId)));
    return config || undefined;
  }

  async createDiscoveredVpnConfiguration(config: InsertDiscoveredVpnConfiguration): Promise<DiscoveredVpnConfiguration> {
    const [newConfig] = await db
      .insert(discoveredVpnConfigurations)
      .values(config)
      .returning();
    return newConfig;
  }

  async updateDiscoveredVpnConfiguration(id: string, config: Partial<InsertDiscoveredVpnConfiguration>, userId: string): Promise<DiscoveredVpnConfiguration | undefined> {
    const [updatedConfig] = await db
      .update(discoveredVpnConfigurations)
      .set({ ...config, updatedAt: new Date() })
      .where(and(eq(discoveredVpnConfigurations.id, id), eq(discoveredVpnConfigurations.userId, userId)))
      .returning();
    return updatedConfig || undefined;
  }

  async deleteDiscoveredVpnConfiguration(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(discoveredVpnConfigurations)
      .where(and(eq(discoveredVpnConfigurations.id, id), eq(discoveredVpnConfigurations.userId, userId)));
    return (result.rowCount || 0) > 0;
  }
}

export const storage = new DatabaseStorage();
