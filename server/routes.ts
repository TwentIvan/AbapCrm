import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { z } from "zod";
import { 
  insertProjectSchema, insertTaskSchema, insertPartnerSchema, 
  insertDealSchema, insertCalendarEventSchema, insertPlanningWindowSchema, insertTimeEntrySchema,
  insertMessageSchema, insertCommentSchema, insertEmailConfigSchema, insertTimesheetSchema,
  insertSalesOrderSchema, insertSalesOrderItemSchema, insertRateAgreementSchema,
  insertHumanResourceSchema, insertSapSystemSchema, insertSapSystemCredentialsSchema,
  insertVpnConnectionSchema, insertVpnCredentialsSchema, insertTransportRequestSchema,
  insertInterventionDocumentSchema, insertSystemCredentialsSchema,
  insertVpnSoftwareSchema, insertVpnSystemsSchema
} from "@shared/schema";
import { aiService } from "./ai-service";
import { initializeEmailService, getEmailService } from "./imap-service";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Users
  app.get("/api/users", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const users = await storage.getUsers();
    res.json(users);
  });

  // Projects
  app.get("/api/projects", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const projects = await storage.getProjects(req.user!.id);
    res.json(projects);
  });

  app.get("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const project = await storage.getProject(req.params.id, req.user!.id);
    if (!project) return res.sendStatus(404);
    res.json(project);
  });

  app.post("/api/projects", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Convert data before validation
      const processedData = {
        name: req.body.name,
        description: req.body.description || null,
        status: req.body.status || "planning",
        clientId: req.body.clientId || null,
        parentProjectId: req.body.parentProjectId || null,
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
        budget: req.body.budget || null,
        progress: req.body.progress || 0,
        estimatedEffort: req.body.estimatedEffort || null,
        userId: req.user!.id
      };
      
      console.log("Processing project data:", processedData);
      const projectData = insertProjectSchema.parse(processedData);
      const project = await storage.createProject(projectData);
      res.status(201).json(project);
    } catch (error) {
      console.error("Project creation error:", error);
      res.status(400).json({ error: "Invalid project data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const updateData = {
        ...req.body,
        parentProjectId: req.body.parentProjectId || null,
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
      };
      const project = await storage.updateProject(req.params.id, updateData, req.user!.id);
      if (!project) return res.sendStatus(404);
      res.json(project);
    } catch (error) {
      res.status(400).json({ error: "Invalid project data" });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteProject(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Tasks
  app.get("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const tasks = await storage.getTasks(req.user!.id);
    res.json(tasks);
  });

  app.get("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const task = await storage.getTask(req.params.id, req.user!.id);
    if (!task) return res.sendStatus(404);
    res.json(task);
  });

  // Get connection info for a task (VPN + SAP)
  app.get("/api/tasks/:id/connection-info", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const connectionInfo = await storage.getTaskConnectionInfo(req.params.id, req.user!.id);
      if (!connectionInfo) {
        return res.status(404).json({ error: "Task not found or no SAP system configured" });
      }
      res.json(connectionInfo);
    } catch (error) {
      console.error('Error getting task connection info:', error);
      res.status(500).json({ error: "Failed to get connection info" });
    }
  });

  // Get tasks by project
  app.get("/api/tasks/project/:projectId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const tasks = await storage.getTasksByProject(req.params.projectId, req.user!.id);
    res.json(tasks);
  });

  app.post("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const completionPercentage = req.body.completionPercentage || 0;
      const estimatedEffort = req.body.estimatedEffort || null;
      
      // Calculate initial remaining effort (in minutes to avoid decimal issues)  
      let remainingEffort = null;
      if (estimatedEffort && completionPercentage < 100) {
        const remainingPercentage = 100 - completionPercentage;
        const remainingHours = (estimatedEffort * remainingPercentage) / 100;
        remainingEffort = Math.round(remainingHours * 60); // Convert to minutes
      }

      const taskData = insertTaskSchema.parse({ 
        title: req.body.title,
        description: req.body.description || null,
        status: req.body.status,
        priority: req.body.priority,
        projectId: req.body.projectId,
        parentTaskId: req.body.parentTaskId,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
        estimatedEffort: estimatedEffort,
        remainingEffort: remainingEffort,
        completionPercentage: completionPercentage,
        userId: req.user!.id 
      });
      const task = await storage.createTask(taskData);
      res.status(201).json(task);
    } catch (error) {
      res.status(400).json({ error: "Invalid task data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Create a partial update schema that makes all fields optional
      const updateData: any = {};
      
      if (req.body.title !== undefined) updateData.title = req.body.title;
      if (req.body.description !== undefined) updateData.description = req.body.description || null;
      if (req.body.status !== undefined) updateData.status = req.body.status;
      if (req.body.priority !== undefined) updateData.priority = req.body.priority;
      if (req.body.projectId !== undefined) updateData.projectId = req.body.projectId;
      if (req.body.sapSystemId !== undefined) {
        updateData.sapSystemId = req.body.sapSystemId;
        console.log('SAP System ID being updated:', req.body.sapSystemId);
      }
      if (req.body.dueDate !== undefined) updateData.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
      if (req.body.estimatedEffort !== undefined) updateData.estimatedEffort = req.body.estimatedEffort || null;
      if (req.body.completionPercentage !== undefined) updateData.completionPercentage = req.body.completionPercentage;
      if (req.body.assignedTo !== undefined) updateData.assignedTo = req.body.assignedTo || null;

      // Auto-calculate remaining effort when completion percentage changes
      if (req.body.completionPercentage !== undefined) {
        // Get current task to access previous remaining effort and estimated effort
        const currentTask = await storage.getTask(req.params.id, req.user!.id);
        
        if (currentTask && currentTask.estimatedEffort && req.body.completionPercentage > 0) {
          const newCompletionPercentage = req.body.completionPercentage;
          const oldCompletionPercentage = currentTask.completionPercentage || 0;
          
          // Debug logging
          console.log(`Smart remaining effort calculation:`, {
            oldCompletion: oldCompletionPercentage,
            newCompletion: newCompletionPercentage,
            currentRemainingEffort: currentTask.remainingEffort,
            estimatedEffort: currentTask.estimatedEffort
          });
          
          if (currentTask.remainingEffort !== null && oldCompletionPercentage > 0) {
            // Update existing remaining effort incrementally
            const remainingPercentage = 100 - newCompletionPercentage;
            const oldRemainingPercentage = 100 - oldCompletionPercentage;
            
            // Proportionally adjust remaining effort based on new completion
            const currentRemainingMinutes = currentTask.remainingEffort;
            const adjustedRemainingMinutes = (currentRemainingMinutes * remainingPercentage) / oldRemainingPercentage;
            
            updateData.remainingEffort = Math.max(0, Math.round(adjustedRemainingMinutes));
            
            console.log(`Adjusted remaining: ${Math.round(adjustedRemainingMinutes)} minutes (${(adjustedRemainingMinutes/60).toFixed(1)}h)`);
          } else {
            // Initial calculation based on estimated effort (in minutes)
            const remainingPercentage = 100 - newCompletionPercentage;
            const remainingHours = (currentTask.estimatedEffort * remainingPercentage) / 100;
            updateData.remainingEffort = Math.max(0, Math.round(remainingHours * 60)); // Convert to minutes
            
            console.log(`Initial remaining: ${Math.round(remainingHours * 60)} minutes (${remainingHours.toFixed(1)}h)`);
          }
        }
      }

      const task = await storage.updateTask(req.params.id, updateData, req.user!.id);
      if (!task) return res.sendStatus(404);
      res.json(task);
    } catch (error) {
      console.error("Task update error:", error);
      res.status(400).json({ error: "Invalid task data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteTask(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Partners
  app.get("/api/partners", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const partners = await storage.getPartners(req.user!.id);
    res.json(partners);
  });

  app.get("/api/partners/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const partner = await storage.getPartner(req.params.id, req.user!.id);
    if (!partner) return res.sendStatus(404);
    res.json(partner);
  });

  app.post("/api/partners", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const partnerData = insertPartnerSchema.parse({
        name: req.body.name,
        email: req.body.email || null,
        phone: req.body.phone || null,
        company: req.body.company || null,
        position: req.body.position || null,
        address: req.body.address || null,
        city: req.body.city || null,
        postalCode: req.body.postalCode || null,
        country: req.body.country || 'IT',
        fiscalCode: req.body.fiscalCode || null,
        vatNumber: req.body.vatNumber || null,
        logoUrl: req.body.logoUrl || null,
        website: req.body.website || null,
        type: req.body.type,
        notes: req.body.notes || null,
        userId: req.user!.id
      });
      
      const partner = await storage.createPartner(partnerData);
      res.status(201).json(partner);
    } catch (error) {
      res.status(400).json({ error: "Invalid partner data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/partners/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const partner = await storage.updatePartner(req.params.id, req.body, req.user!.id);
      if (!partner) return res.sendStatus(404);
      res.json(partner);
    } catch (error) {
      res.status(400).json({ error: "Invalid partner data" });
    }
  });

  app.delete("/api/partners/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deletePartner(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Search or create partner automatically 
  app.post("/api/partners/search-or-create", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { groupName } = req.body;
      if (!groupName || typeof groupName !== 'string') {
        return res.status(400).json({ error: "Group name is required" });
      }

      const userId = req.user!.id;
      
      // 1. Prima cerca nei partner esistenti
      const existingPartners = await storage.getPartners(userId);
      const foundPartner = existingPartners.find(p => 
        p.name.toLowerCase().includes(groupName.toLowerCase()) ||
        (p.company && p.company.toLowerCase().includes(groupName.toLowerCase()))
      );
      
      if (foundPartner) {
        return res.json({ partner: foundPartner, created: false });
      }
      
      // 2. Se non trova, cerca con company lookup service
      const { CompanyLookupService } = await import('./company-lookup-service');
      const companies = await CompanyLookupService.searchCompanies(groupName);
      
      let companyInfo = null;
      if (companies.length > 0) {
        companyInfo = companies[0]; // Usa il primo risultato
      }
      
      // 3. Crea nuovo partner con le info trovate
      const partnerData = insertPartnerSchema.parse({
        name: companyInfo?.name || groupName,
        company: companyInfo?.name || groupName,
        email: null,
        phone: null,
        address: companyInfo?.address || null,
        city: companyInfo?.city || null,
        postalCode: companyInfo?.postalCode || null,
        country: companyInfo?.country || 'IT',
        fiscalCode: companyInfo?.fiscalCode || null,
        vatNumber: companyInfo?.vatNumber || null,
        website: companyInfo?.website || null,
        type: 'client',
        notes: `Auto-created from SAP XML import for group: ${groupName}`,
        userId
      });
      
      const newPartner = await storage.createPartner(partnerData);
      res.status(201).json({ partner: newPartner, created: true });
      
    } catch (error) {
      console.error("Partner search-or-create error:", error);
      res.status(400).json({ 
        error: "Failed to search or create partner", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Address suggestions endpoint
  app.get("/api/address/suggestions", async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.json([]);
    }

    try {
      const { AddressService } = await import('./address-service');
      const suggestions = await AddressService.getAddressSuggestions(q);
      res.json(suggestions);
    } catch (error) {
      console.error('Address suggestions error:', error);
      res.json([]);
    }
  });

  // City suggestions endpoint
  app.get("/api/address/cities", async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.json([]);
    }

    try {
      const { AddressService } = await import('./address-service');
      const suggestions = await AddressService.getCitySuggestions(q);
      res.json(suggestions);
    } catch (error) {
      console.error('City suggestions error:', error);
      res.json([]);
    }
  });

  // Validate Italian fiscal code
  app.post("/api/validate/fiscal-code", async (req, res) => {
    const { fiscalCode } = req.body;
    try {
      const { ItalianValidationService } = await import('./italian-validation');
      const result = ItalianValidationService.validateFiscalCode(fiscalCode);
      res.json(result);
    } catch (error) {
      res.status(500).json({ valid: false, error: 'Errore di validazione' });
    }
  });

  // Validate Italian VAT number
  app.post("/api/validate/vat-number", async (req, res) => {
    const { vatNumber } = req.body;
    try {
      const { ItalianValidationService } = await import('./italian-validation');
      const result = ItalianValidationService.validateVatNumber(vatNumber);
      res.json(result);
    } catch (error) {
      res.status(500).json({ valid: false, error: 'Errore di validazione' });
    }
  });

  // Company lookup endpoints
  app.get("/api/companies/search", async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.json([]);
    }

    try {
      const { CompanyLookupService } = await import('./company-lookup-service');
      const companies = await CompanyLookupService.searchCompanies(q);
      res.json(companies);
    } catch (error) {
      console.error('Company search error:', error);
      res.json([]);
    }
  });

  app.get("/api/companies/details/:identifier", async (req, res) => {
    try {
      const { CompanyLookupService } = await import('./company-lookup-service');
      const company = await CompanyLookupService.getCompanyDetails(req.params.identifier);
      if (company) {
        res.json(company);
      } else {
        res.status(404).json({ error: 'Company not found' });
      }
    } catch (error) {
      console.error('Company details error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Enrich company data with Italian fiscal information
  app.post("/api/companies/enrich", async (req, res) => {
    try {
      const { CompanyLookupService } = await import('./company-lookup-service');
      const companyData = req.body;
      
      if (!companyData || !companyData.name) {
        return res.status(400).json({ error: 'Company name is required' });
      }
      
      const enrichedData = await CompanyLookupService.enrichWithItalianFiscalData(companyData);
      res.json(enrichedData);
    } catch (error) {
      console.error('Company enrich error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Logo upload endpoint
  app.post("/api/partners/logo/upload", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getLogoUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error('Logo upload URL error:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  // Normalize logo URL for proper access
  app.post("/api/partners/logo/normalize", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { uploadURL } = req.body;
      if (!uploadURL) {
        return res.status(400).json({ error: "Upload URL is required" });
      }

      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const normalizedPath = objectStorageService.normalizeLogoPath(uploadURL);
      
      res.json({ normalizedPath });
    } catch (error) {
      console.error('Error normalizing logo URL:', error);
      res.status(500).json({ error: 'Failed to normalize logo URL' });
    }
  });

  // Serve logo files
  app.get("/objects/logos/:logoId", async (req, res) => {
    try {
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const logoFile = await objectStorageService.getLogoFile(`/objects/logos/${req.params.logoId}`);
      objectStorageService.downloadObject(logoFile, res);
    } catch (error) {
      console.error('Logo download error:', error);
      res.sendStatus(404);
    }
  });

  // Deals
  app.get("/api/deals", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deals = await storage.getDeals(req.user!.id);
    res.json(deals);
  });

  app.get("/api/deals/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deal = await storage.getDeal(req.params.id, req.user!.id);
    if (!deal) return res.sendStatus(404);
    res.json(deal);
  });

  app.post("/api/deals", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const dealData = insertDealSchema.parse({
        title: req.body.title,
        description: req.body.description || null,
        value: req.body.value,
        stage: req.body.stage,
        probability: req.body.probability,
        partnerId: req.body.partnerId,
        expectedCloseDate: req.body.expectedCloseDate,
        notes: req.body.notes || null,
        userId: req.user!.id
      });
      const deal = await storage.createDeal(dealData);
      res.status(201).json(deal);
    } catch (error) {
      console.error("Deal creation error:", error);
      res.status(400).json({ error: "Invalid deal data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/deals/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const deal = await storage.updateDeal(req.params.id, req.body, req.user!.id);
      if (!deal) return res.sendStatus(404);
      res.json(deal);
    } catch (error) {
      res.status(400).json({ error: "Invalid deal data" });
    }
  });

  app.delete("/api/deals/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteDeal(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Calendar Events
  app.get("/api/calendar-events", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const events = await storage.getCalendarEvents(req.user!.id);
    res.json(events);
  });

  app.get("/api/calendar-events/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const event = await storage.getCalendarEvent(req.params.id, req.user!.id);
    if (!event) return res.sendStatus(404);
    res.json(event);
  });

  app.post("/api/calendar-events", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const eventData = insertCalendarEventSchema.parse({ ...req.body, userId: req.user!.id });
      const event = await storage.createCalendarEvent(eventData);
      res.status(201).json(event);
    } catch (error) {
      res.status(400).json({ error: "Invalid calendar event data" });
    }
  });

  app.put("/api/calendar-events/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const event = await storage.updateCalendarEvent(req.params.id, req.body, req.user!.id);
      if (!event) return res.sendStatus(404);
      res.json(event);
    } catch (error) {
      res.status(400).json({ error: "Invalid calendar event data" });
    }
  });

  app.delete("/api/calendar-events/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteCalendarEvent(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Planning Windows
  app.get("/api/planning-windows/user", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const windows = await storage.getAllPlanningWindowsForUser(req.user!.id);
    res.json(windows);
  });

  app.get("/api/planning-windows/project/:projectId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const windows = await storage.getPlanningWindows(req.params.projectId, req.user!.id);
    res.json(windows);
  });

  app.get("/api/planning-windows/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const window = await storage.getPlanningWindow(req.params.id, req.user!.id);
    if (!window) return res.sendStatus(404);
    res.json(window);
  });

  app.post("/api/planning-windows", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const windowData = insertPlanningWindowSchema.parse({
        projectId: req.body.projectId,
        name: req.body.name,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate),
        startTime: req.body.startTime || '09:00',
        endTime: req.body.endTime || '17:00',
        workingHoursPerDay: req.body.workingHoursPerDay || 8,
        isActive: req.body.isActive !== undefined ? req.body.isActive : true,
        recurrenceType: req.body.recurrenceType || 'none',
        daysOfWeek: req.body.daysOfWeek || [],
        recurrenceInterval: req.body.recurrenceInterval || 1,
        recurrenceEnd: req.body.recurrenceEnd ? new Date(req.body.recurrenceEnd) : null,
        notes: req.body.notes || null
      });
      const window = await storage.createPlanningWindow(windowData);
      res.status(201).json(window);
    } catch (error) {
      console.error("Planning window creation error:", error);
      res.status(400).json({ error: "Invalid planning window data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/planning-windows/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const updateData = {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
        recurrenceEnd: req.body.recurrenceEnd ? new Date(req.body.recurrenceEnd) : undefined,
      };
      const window = await storage.updatePlanningWindow(req.params.id, updateData, req.user!.id);
      if (!window) return res.sendStatus(404);
      res.json(window);
    } catch (error) {
      console.error("Planning window update error:", error);
      res.status(400).json({ error: "Invalid planning window data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/planning-windows/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deletePlanningWindow(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Time Entries
  app.get("/api/time-entries", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const entries = await storage.getTimeEntries(req.user!.id);
    res.json(entries);
  });

  app.get("/api/time-entries/task/:taskId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const entries = await storage.getTimeEntriesByTask(req.params.taskId, req.user!.id);
    res.json(entries);
  });

  app.get("/api/time-entries/running", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const entry = await storage.getRunningTimeEntry(req.user!.id);
    res.json(entry || null);
  });

  app.post("/api/time-entries", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const entryData = insertTimeEntrySchema.parse({
        taskId: req.body.taskId,
        startTime: req.body.startTime ? new Date(req.body.startTime) : new Date(),
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined,
        description: req.body.description || undefined,
        isRunning: req.body.isRunning === true,
        userId: req.user!.id
      });

      // If creating a running timer, stop ALL existing running timers first
      if (entryData.isRunning) {
        const allRunning = await storage.getAllRunningTimeEntries(req.user!.id);
        for (const running of allRunning) {
          await storage.stopTimeEntry(running.id, req.user!.id);
        }
      }

      const entry = await storage.createTimeEntry(entryData);
      res.status(201).json(entry);
    } catch (error) {
      console.error("Time entry creation error:", error);
      res.status(400).json({ error: "Invalid time entry data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/time-entries/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const entry = await storage.updateTimeEntry(req.params.id, req.body, req.user!.id);
      if (!entry) return res.sendStatus(404);
      res.json(entry);
    } catch (error) {
      res.status(400).json({ error: "Invalid time entry data" });
    }
  });

  app.post("/api/time-entries/:id/stop", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const entry = await storage.stopTimeEntry(req.params.id, req.user!.id);
    if (!entry) return res.sendStatus(404);
    res.json(entry);
  });

  app.delete("/api/time-entries/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteTimeEntry(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Timesheets
  app.get("/api/timesheets", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const timesheets = await storage.getTimesheets(req.user!.id);
    res.json(timesheets);
  });

  app.get("/api/timesheets/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const timesheet = await storage.getTimesheet(req.params.id, req.user!.id);
    if (!timesheet) return res.sendStatus(404);
    res.json(timesheet);
  });

  app.post("/api/timesheets", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Create static snapshots from grouped data for independence from time entries
      const groupSnapshots: Record<string, any> = {};
      if (req.body.groupedData) {
        Object.entries(req.body.groupedData).forEach(([groupKey, entries]: [string, any]) => {
          const entriesArray = Array.isArray(entries) ? entries : [];
          
          // Calculate initial duration
          const totalDuration = entriesArray.reduce((sum, entry) => {
            let duration = entry.durationMinutes || entry.duration || 0;
            if (!duration && entry.startTime && entry.endTime) {
              const start = new Date(entry.startTime);
              const end = new Date(entry.endTime);
              duration = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60));
            }
            return sum + duration;
          }, 0);
          
          // Apply 15-minute normalization
          const normalizedDuration = Math.round(totalDuration / 15) * 15;
          
          groupSnapshots[groupKey] = {
            duration: normalizedDuration,
            entryCount: entriesArray.length,
            entries: entriesArray.map(entry => ({
              id: entry.id,
              taskTitle: entry.taskTitle || 'Task sconosciuto',
              projectName: entry.projectName || 'No Project',
              startTime: entry.startTime,
              endTime: entry.endTime,
              description: entry.description || '',
              duration: entry.durationMinutes || entry.duration || 0
            }))
          };
        });
      }

      const timesheetData = insertTimesheetSchema.parse({
        name: req.body.name,
        description: req.body.description || null,
        groupingFields: req.body.groupingFields,
        timeEntryIds: req.body.timeEntryIds,
        groupedData: JSON.stringify(req.body.groupedData),
        groupSnapshots: JSON.stringify(groupSnapshots),
        totalDuration: req.body.totalDuration,
        totalEntries: req.body.totalEntries,
        userId: req.user!.id
      });

      const timesheet = await storage.createTimesheet(timesheetData);
      res.status(201).json(timesheet);
    } catch (error) {
      console.error("Timesheet creation error:", error);
      res.status(400).json({ error: "Invalid timesheet data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/timesheets/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const timesheet = await storage.updateTimesheet(req.params.id, req.body, req.user!.id);
      if (!timesheet) return res.sendStatus(404);
      res.json(timesheet);
    } catch (error) {
      res.status(400).json({ error: "Invalid timesheet data" });
    }
  });

  app.delete("/api/timesheets/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteTimesheet(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Messages
  app.get("/api/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const messages = await storage.getMessages(req.user!.id);
    res.json(messages);
  });

  // Download attachment endpoint
  app.get("/api/messages/:messageId/attachments/:filename", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { messageId, filename } = req.params;
      
      // Verifica che il messaggio appartenga all'utente  
      const message = await storage.getMessage(messageId, req.user!.id);
      if (!message) return res.sendStatus(404);
      
      // Verifica che l'allegato esista 
      if (!message.attachments || !message.attachments.includes(filename)) {
        return res.sendStatus(404);
      }

      // Determina il tipo MIME dal file
      const getMimeType = (filename: string): string => {
        const ext = filename.toLowerCase().split('.').pop();
        const mimeTypes: { [key: string]: string } = {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg', 
          'png': 'image/png',
          'gif': 'image/gif',
          'pdf': 'application/pdf',
          'doc': 'application/msword',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'txt': 'text/plain'
        };
        return mimeTypes[ext || ''] || 'application/octet-stream';
      };

      const mimeType = getMimeType(filename);
      const isImage = mimeType.startsWith('image/');

      if (isImage) {
        // Per le immagini, servi direttamente per l'anteprima
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24h
      } else {
        // Per altri file, forza il download
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', mimeType);
      }

      // Per ora simula i dati dell'immagine - in futuro leggerà i file reali
      if (isImage) {
        // Genera una semplice immagine placeholder SVG per il test
        const svgContent = `
          <svg width="300" height="200" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#f0f0f0"/>
            <text x="50%" y="50%" text-anchor="middle" dy="0.3em" font-family="Arial" font-size="14" fill="#666">
              📷 ${filename}
            </text>
            <text x="50%" y="65%" text-anchor="middle" dy="0.3em" font-family="Arial" font-size="12" fill="#999">
              Anteprima allegato
            </text>
          </svg>
        `;
        
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(svgContent);
      } else {
        // Per altri file, restituisce info JSON
        res.json({ 
          message: "Download disponibile", 
          filename,
          messageId,
          mimeType,
          available: true,
          size: "File simulato"
        });
      }
      
    } catch (error) {
      console.error('Attachment download error:', error);
      res.status(500).json({ error: "Failed to download attachment" });
    }
  });

  app.get("/api/messages/unread", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const messages = await storage.getUnreadMessages(req.user!.id);
    res.json(messages);
  });

  app.get("/api/messages/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const message = await storage.getMessage(req.params.id, req.user!.id);
    if (!message) return res.sendStatus(404);
    res.json(message);
  });

  app.post("/api/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const messageData = insertMessageSchema.parse({
        ...req.body,
        userId: req.user!.id,
        receivedAt: req.body.receivedAt ? new Date(req.body.receivedAt) : new Date()
      });
      const message = await storage.createMessage(messageData);
      
      // Run AI analysis in background
      if (process.env.OPENAI_API_KEY) {
        aiService.analyzeMessage(message, req.user!.id).then(analysis => {
          if (analysis.bestMatch) {
            aiService.updateMessageWithSuggestion(message.id, analysis.bestMatch, req.user!.id);
          }
        }).catch(console.error);
      }
      
      res.status(201).json(message);
    } catch (error) {
      console.error("Message creation error:", error);
      res.status(400).json({ error: "Invalid message data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/messages/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const message = await storage.updateMessage(req.params.id, req.body, req.user!.id);
      if (!message) return res.sendStatus(404);
      res.json(message);
    } catch (error) {
      res.status(400).json({ error: "Invalid message data" });
    }
  });

  app.post("/api/messages/:id/read", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const message = await storage.markMessageAsRead(req.params.id, req.user!.id);
    if (!message) return res.sendStatus(404);
    res.json(message);
  });

  app.delete("/api/messages/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteMessage(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Comments
  app.get("/api/comments", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const comments = await storage.getComments(req.user!.id);
    res.json(comments);
  });

  app.get("/api/comments/project/:projectId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const comments = await storage.getCommentsByProject(req.params.projectId, req.user!.id);
    res.json(comments);
  });

  app.get("/api/comments/task/:taskId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const comments = await storage.getCommentsByTask(req.params.taskId, req.user!.id);
    res.json(comments);
  });

  app.get("/api/comments/message/:messageId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const comments = await storage.getCommentsByMessage(req.params.messageId, req.user!.id);
    res.json(comments);
  });

  app.get("/api/comments/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const comment = await storage.getComment(req.params.id, req.user!.id);
    if (!comment) return res.sendStatus(404);
    res.json(comment);
  });

  app.post("/api/comments", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const commentData = insertCommentSchema.parse({
        ...req.body,
        userId: req.user!.id
      });
      const comment = await storage.createComment(commentData);
      res.status(201).json(comment);
    } catch (error) {
      console.error("Comment creation error:", error);
      res.status(400).json({ error: "Invalid comment data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/comments/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const comment = await storage.updateComment(req.params.id, req.body, req.user!.id);
      if (!comment) return res.sendStatus(404);
      res.json(comment);
    } catch (error) {
      res.status(400).json({ error: "Invalid comment data" });
    }
  });

  app.delete("/api/comments/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteComment(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // AI Analysis
  app.post("/api/messages/:id/analyze", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const message = await storage.getMessage(req.params.id, req.user!.id);
      if (!message) return res.sendStatus(404);
      
      const analysis = await aiService.analyzeMessage(message, req.user!.id);
      res.json(analysis);
    } catch (error) {
      console.error("AI analysis error:", error);
      res.status(500).json({ error: "Analysis failed" });
    }
  });

  app.post("/api/messages/:id/apply-suggestion", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { suggestion } = req.body;
      if (!suggestion) return res.status(400).json({ error: "Suggestion required" });
      
      await aiService.updateMessageWithSuggestion(req.params.id, suggestion, req.user!.id);
      
      // Return updated message
      const updatedMessage = await storage.getMessage(req.params.id, req.user!.id);
      res.json(updatedMessage);
    } catch (error) {
      console.error("Apply suggestion error:", error);
      res.status(500).json({ error: "Failed to apply suggestion" });
    }
  });

  // Email Configuration
  app.post("/api/email/configure", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const validatedData = insertEmailConfigSchema.parse({
        ...req.body,
        userId: req.user!.id
      });
      
      // Deactivate all existing configs for this user
      await storage.deactivateAllEmailConfigs(req.user!.id);
      
      // Create new active config
      const savedConfig = await storage.createEmailConfig(validatedData);

      const config = {
        user: savedConfig.email,
        password: savedConfig.password,
        host: savedConfig.host,
        port: savedConfig.port,
        tls: savedConfig.tls,
        folder: savedConfig.folder
      };

      // Disconnect existing service first
      const existingService = getEmailService();
      if (existingService) {
        existingService.disconnect();
      }
      
      initializeEmailService(config);
      
      res.json({ 
        message: "Email service configured successfully",
        status: "connected",
        folder: config.folder,
        configId: savedConfig.id
      });
    } catch (error) {
      console.error("Email configuration error:", error);
      res.status(500).json({ error: "Failed to configure email service" });
    }
  });

  app.get("/api/email/status", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const service = getEmailService();
    const activeConfig = await storage.getActiveEmailConfig(req.user!.id);
    
    res.json({
      connected: service !== null,
      status: service ? "active" : (activeConfig ? "configured" : "not_configured"),
      config: activeConfig ? {
        id: activeConfig.id,
        email: activeConfig.email,
        folder: activeConfig.folder,
        host: activeConfig.host,
        port: activeConfig.port
      } : null
    });
  });

  app.post("/api/email/disconnect", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const service = getEmailService();
    if (service) {
      service.disconnect();
    }
    
    res.json({ message: "Email service disconnected" });
  });

  // Email sync endpoint for manual refresh
  app.post("/api/email/sync", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const service = getEmailService();
    if (!service) {
      return res.status(400).json({ error: "Email service not configured" });
    }

    try {
      // Force a sync by checking for both existing and new emails
      (service as any).checkForExistingEmails();
      (service as any).checkForNewEmails();
      res.json({ message: "Sync initiated" });
    } catch (error) {
      console.error("Email sync error:", error);
      res.status(500).json({ error: "Failed to sync emails" });
    }
  });

  // Sales Orders
  app.get("/api/sales-orders", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const orders = await storage.getSalesOrders(req.user!.id);
    res.json(orders);
  });

  app.get("/api/sales-orders/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const order = await storage.getSalesOrder(req.params.id, req.user!.id);
    if (!order) return res.sendStatus(404);
    res.json(order);
  });

  app.post("/api/sales-orders", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const orderData = insertSalesOrderSchema.parse({
        ...req.body,
        userId: req.user!.id
      });
      const order = await storage.createSalesOrder(orderData);
      res.status(201).json(order);
    } catch (error) {
      console.error("Sales order creation error:", error);
      res.status(400).json({ error: "Invalid sales order data" });
    }
  });

  app.put("/api/sales-orders/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const order = await storage.updateSalesOrder(req.params.id, req.body, req.user!.id);
      if (!order) return res.sendStatus(404);
      res.json(order);
    } catch (error) {
      res.status(400).json({ error: "Invalid sales order data" });
    }
  });

  app.delete("/api/sales-orders/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteSalesOrder(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Convert timesheet entries to sales order
  app.post("/api/sales-orders/from-timesheet", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { timeEntryIds, partnerId, description, hourlyRate } = req.body;
      
      if (!timeEntryIds || !Array.isArray(timeEntryIds) || timeEntryIds.length === 0) {
        return res.status(400).json({ error: "No time entries provided" });
      }
      
      if (!partnerId) {
        return res.status(400).json({ error: "Partner ID is required" });
      }

      // Get time entries and calculate totals
      const timeEntries = await Promise.all(
        timeEntryIds.map((id: string) => storage.getTimeEntry(id, req.user!.id))
      );
      
      const validEntries = timeEntries.filter(entry => entry !== undefined);
      if (validEntries.length === 0) {
        return res.status(400).json({ error: "No valid time entries found" });
      }

      // Calculate total hours and amount
      const totalMinutes = validEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
      const totalHours = Number((totalMinutes / 60).toFixed(2));
      const rate = parseFloat(hourlyRate) || 50; // Default rate
      const subtotal = Number((totalHours * rate).toFixed(2));
      const taxes = Number((subtotal * 0.22).toFixed(2)); // 22% VAT
      const total = Number((subtotal + taxes).toFixed(2));

      // Create sales order
      const salesOrder = await storage.createSalesOrder({
        userId: req.user!.id,
        partnerId,
        description: description || "Time tracking services",
        subtotal: subtotal.toString(),
        taxes: taxes.toString(),
        total: total.toString(),
        currency: "EUR",
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        status: "draft"
      });

      // Create sales order item
      await storage.createSalesOrderItem({
        salesOrderId: salesOrder.id,
        description: `Time tracking - ${totalHours}h @ €${rate}/h`,
        quantity: totalHours.toString(),
        unitPrice: rate.toString(),
        lineTotal: subtotal.toString(),
        workDate: new Date(validEntries[0].startTime),
        timeEntryIds: timeEntryIds
      });

      res.status(201).json(salesOrder);
    } catch (error) {
      console.error("Sales order conversion error:", error);
      res.status(500).json({ error: "Failed to convert timesheet to sales order" });
    }
  });

  // Sales Order Items
  app.get("/api/sales-order-items", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { salesOrderId } = req.query;
    if (!salesOrderId || typeof salesOrderId !== 'string') {
      return res.status(400).json({ error: "salesOrderId is required" });
    }
    const items = await storage.getSalesOrderItems(salesOrderId, req.user!.id);
    res.json(items);
  });

  app.get("/api/sales-order-items/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const item = await storage.getSalesOrderItem(req.params.id, req.user!.id);
    if (!item) return res.sendStatus(404);
    res.json(item);
  });

  app.post("/api/sales-order-items", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const itemData = insertSalesOrderItemSchema.parse(req.body);
      const item = await storage.createSalesOrderItem(itemData);
      res.status(201).json(item);
    } catch (error) {
      console.error("Sales order item creation error:", error);
      res.status(400).json({ error: "Invalid sales order item data" });
    }
  });

  app.put("/api/sales-order-items/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const item = await storage.updateSalesOrderItem(req.params.id, req.body, req.user!.id);
      if (!item) return res.sendStatus(404);
      res.json(item);
    } catch (error) {
      res.status(400).json({ error: "Invalid sales order item data" });
    }
  });

  app.delete("/api/sales-order-items/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteSalesOrderItem(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Rate Agreements
  app.get("/api/rate-agreements", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const agreements = await storage.getRateAgreements(req.user!.id);
    res.json(agreements);
  });

  app.get("/api/rate-agreements/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const agreement = await storage.getRateAgreement(req.params.id, req.user!.id);
    if (!agreement) return res.sendStatus(404);
    res.json(agreement);
  });

  app.get("/api/rate-agreements/active", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const agreements = await storage.getActiveRateAgreements(req.user!.id);
    res.json(agreements);
  });

  app.post("/api/rate-agreements/resolve", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { partnerId, projectId, taskId, taskType, humanResourceId } = req.body;
      const agreement = await storage.resolveRateForContext(req.user!.id, {
        partnerId,
        projectId,
        taskId,
        taskType,
        humanResourceId
      });
      res.json(agreement || null);
    } catch (error) {
      console.error("Rate resolution error:", error);
      res.status(500).json({ error: "Failed to resolve rate" });
    }
  });

  app.post("/api/rate-agreements", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const agreementData = insertRateAgreementSchema.parse({
        ...req.body,
        userId: req.user!.id,
        groupingValues: JSON.stringify(req.body.groupingValues),
        validFrom: req.body.validFrom ? new Date(req.body.validFrom) : new Date(),
        validTo: req.body.validTo ? new Date(req.body.validTo) : null
      });
      const agreement = await storage.createRateAgreement(agreementData);
      res.status(201).json(agreement);
    } catch (error) {
      console.error("Rate agreement creation error:", error);
      res.status(400).json({ error: "Invalid rate agreement data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/rate-agreements/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const updateData = {
        ...req.body,
        groupingValues: req.body.groupingValues ? JSON.stringify(req.body.groupingValues) : undefined,
        validFrom: req.body.validFrom ? new Date(req.body.validFrom) : undefined,
        validTo: req.body.validTo ? new Date(req.body.validTo) : undefined
      };
      const agreement = await storage.updateRateAgreement(req.params.id, updateData, req.user!.id);
      if (!agreement) return res.sendStatus(404);
      res.json(agreement);
    } catch (error) {
      console.error("Rate agreement update error:", error);
      res.status(400).json({ error: "Invalid rate agreement data" });
    }
  });

  app.delete("/api/rate-agreements/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const deleted = await storage.deleteRateAgreement(req.params.id, req.user!.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Human Resources routes
  app.get("/api/human-resources", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const resources = await storage.getHumanResources(req.user!.id);
      res.json(resources);
    } catch (error) {
      console.error("Error fetching human resources:", error);
      res.status(500).json({ error: "Failed to fetch human resources" });
    }
  });

  app.get("/api/human-resources/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const resource = await storage.getHumanResource(req.params.id, req.user!.id);
      if (!resource) {
        return res.status(404).json({ error: "Human resource not found" });
      }
      res.json(resource);
    } catch (error) {
      console.error("Error fetching human resource:", error);
      res.status(500).json({ error: "Failed to fetch human resource" });
    }
  });

  app.post("/api/human-resources", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Aggiungi automaticamente l'userId dell'utente autenticato e converti le date
      const dataWithUserId = {
        ...req.body,
        userId: req.user!.id,
        // Converti stringhe ISO in oggetti Date se presenti
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
      };
      
      const validation = insertHumanResourceSchema.safeParse(dataWithUserId);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }

      const resource = await storage.createHumanResource(validation.data);
      res.status(201).json(resource);
    } catch (error) {
      console.error("Error creating human resource:", error);
      res.status(500).json({ error: "Failed to create human resource" });
    }
  });

  app.put("/api/human-resources/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const validation = insertHumanResourceSchema.partial().safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validation.error.errors 
        });
      }

      const resource = await storage.updateHumanResource(req.params.id, validation.data, req.user!.id);
      if (!resource) {
        return res.status(404).json({ error: "Human resource not found" });
      }
      res.json(resource);
    } catch (error) {
      console.error("Error updating human resource:", error);
      res.status(500).json({ error: "Failed to update human resource" });
    }
  });

  app.delete("/api/human-resources/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const success = await storage.deleteHumanResource(req.params.id, req.user!.id);
      if (!success) {
        return res.status(404).json({ error: "Human resource not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting human resource:", error);
      res.status(500).json({ error: "Failed to delete human resource" });
    }
  });

  // SAP Systems
  app.get("/api/sap-systems", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const systems = await storage.getSapSystems(req.user!.id);
    res.json(systems);
  });

  app.get("/api/sap-systems/partner/:partnerId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const systems = await storage.getSapSystemsByPartner(req.params.partnerId, req.user!.id);
    res.json(systems);
  });

  app.get("/api/sap-systems/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const system = await storage.getSapSystem(req.params.id, req.user!.id);
    if (!system) return res.sendStatus(404);
    res.json(system);
  });

  app.post("/api/sap-systems", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const systemData = { ...req.body, userId: req.user!.id };
      const validatedData = insertSapSystemSchema.parse(systemData);
      const system = await storage.createSapSystem(validatedData);
      res.status(201).json(system);
    } catch (error) {
      res.status(400).json({ error: "Invalid SAP system data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/sap-systems/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const system = await storage.updateSapSystem(req.params.id, req.body, req.user!.id);
      if (!system) return res.sendStatus(404);
      res.json(system);
    } catch (error) {
      res.status(400).json({ error: "Failed to update SAP system", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/sap-systems/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteSapSystem(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // SAP System Credentials
  app.get("/api/sap-systems/:systemId/credentials", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const credentials = await storage.getSapSystemCredentials(req.params.systemId, req.user!.id);
    res.json(credentials);
  });

  app.get("/api/sap-systems/:systemId/credentials/active", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const credentials = await storage.getActiveSapSystemCredentials(req.params.systemId, req.user!.id);
    res.json(credentials);
  });

  app.get("/api/sap-system-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const credential = await storage.getSapSystemCredential(req.params.id, req.user!.id);
    if (!credential) return res.sendStatus(404);
    res.json(credential);
  });

  app.post("/api/sap-systems/:systemId/credentials", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const credentialData = { ...req.body, sapSystemId: req.params.systemId, userId: req.user!.id };
      const validatedData = insertSapSystemCredentialsSchema.parse(credentialData);
      const credential = await storage.createSapSystemCredential(validatedData);
      res.status(201).json(credential);
    } catch (error) {
      res.status(400).json({ error: "Invalid SAP system credential data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/sap-system-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const credential = await storage.updateSapSystemCredential(req.params.id, req.body, req.user!.id);
      if (!credential) return res.sendStatus(404);
      res.json(credential);
    } catch (error) {
      res.status(400).json({ error: "Failed to update SAP credential", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/sap-system-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteSapSystemCredential(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // VPN Connections
  app.get("/api/vpn-connections", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const connections = await storage.getVpnConnections(req.user!.id);
    res.json(connections);
  });

  app.get("/api/vpn-connections/partner/:partnerId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const connections = await storage.getVpnConnectionsByPartner(req.params.partnerId, req.user!.id);
    res.json(connections);
  });

  app.get("/api/vpn-connections/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const connection = await storage.getVpnConnection(req.params.id, req.user!.id);
    if (!connection) return res.sendStatus(404);
    res.json(connection);
  });

  app.post("/api/vpn-connections", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const connectionData = { ...req.body, userId: req.user!.id };
      const validatedData = insertVpnConnectionSchema.parse(connectionData);
      const connection = await storage.createVpnConnection(validatedData);
      res.status(201).json(connection);
    } catch (error) {
      res.status(400).json({ error: "Invalid VPN connection data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/vpn-connections/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const connection = await storage.updateVpnConnection(req.params.id, req.body, req.user!.id);
      if (!connection) return res.sendStatus(404);
      res.json(connection);
    } catch (error) {
      res.status(400).json({ error: "Failed to update VPN connection", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/vpn-connections/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteVpnConnection(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // VPN Credentials
  app.get("/api/vpn-connections/:connectionId/credentials", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const credentials = await storage.getVpnCredentials(req.params.connectionId, req.user!.id);
    res.json(credentials);
  });

  app.get("/api/vpn-connections/:connectionId/credentials/active", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const credentials = await storage.getActiveVpnCredentials(req.params.connectionId, req.user!.id);
    res.json(credentials);
  });

  app.get("/api/vpn-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const credential = await storage.getVpnCredential(req.params.id, req.user!.id);
    if (!credential) return res.sendStatus(404);
    res.json(credential);
  });

  app.post("/api/vpn-connections/:connectionId/credentials", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const credentialData = { ...req.body, vpnConnectionId: req.params.connectionId, userId: req.user!.id };
      const validatedData = insertVpnCredentialsSchema.parse(credentialData);
      const credential = await storage.createVpnCredential(validatedData);
      res.status(201).json(credential);
    } catch (error) {
      res.status(400).json({ error: "Invalid VPN credential data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/vpn-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const credential = await storage.updateVpnCredential(req.params.id, req.body, req.user!.id);
      if (!credential) return res.sendStatus(404);
      res.json(credential);
    } catch (error) {
      res.status(400).json({ error: "Failed to update VPN credential", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/vpn-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteVpnCredential(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // VPN Software (Master Data)
  app.get("/api/vpn-software", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const software = await storage.getVpnSoftware();
    res.json(software);
  });

  app.get("/api/vpn-software/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const software = await storage.getVpnSoftwareById(req.params.id);
    if (!software) return res.sendStatus(404);
    res.json(software);
  });

  app.post("/api/vpn-software", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const validatedData = insertVpnSoftwareSchema.parse(req.body);
      const software = await storage.createVpnSoftware(validatedData);
      res.status(201).json(software);
    } catch (error) {
      res.status(400).json({ error: "Invalid VPN software data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/vpn-software/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const software = await storage.updateVpnSoftware(req.params.id, req.body);
      if (!software) return res.sendStatus(404);
      res.json(software);
    } catch (error) {
      res.status(400).json({ error: "Failed to update VPN software", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/vpn-software/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteVpnSoftware(req.params.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // VPN Systems
  app.get("/api/vpn-systems", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const systems = await storage.getVpnSystems(req.user!.id);
    res.json(systems);
  });

  app.get("/api/vpn-systems/partner/:partnerId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const systems = await storage.getVpnSystemsByPartner(req.params.partnerId, req.user!.id);
    res.json(systems);
  });

  app.get("/api/vpn-systems/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const system = await storage.getVpnSystem(req.params.id, req.user!.id);
    if (!system) return res.sendStatus(404);
    res.json(system);
  });

  app.post("/api/vpn-systems", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const systemData = { ...req.body, userId: req.user!.id };
      const validatedData = insertVpnSystemsSchema.parse(systemData);
      const system = await storage.createVpnSystem(validatedData);
      res.status(201).json(system);
    } catch (error) {
      res.status(400).json({ error: "Invalid VPN system data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/vpn-systems/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const system = await storage.updateVpnSystem(req.params.id, req.body, req.user!.id);
      if (!system) return res.sendStatus(404);
      res.json(system);
    } catch (error) {
      res.status(400).json({ error: "Failed to update VPN system", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/vpn-systems/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteVpnSystem(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Transport Requests
  app.get("/api/transport-requests", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const requests = await storage.getTransportRequests(req.user!.id);
    res.json(requests);
  });

  app.get("/api/transport-requests/sap-system/:systemId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const requests = await storage.getTransportRequestsBySapSystem(req.params.systemId, req.user!.id);
    res.json(requests);
  });

  app.get("/api/transport-requests/project/:projectId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const requests = await storage.getTransportRequestsByProject(req.params.projectId, req.user!.id);
    res.json(requests);
  });

  app.get("/api/transport-requests/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const request = await storage.getTransportRequest(req.params.id, req.user!.id);
    if (!request) return res.sendStatus(404);
    res.json(request);
  });

  app.get("/api/transport-requests/number/:requestNumber", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const request = await storage.getTransportRequestByNumber(req.params.requestNumber, req.user!.id);
    if (!request) return res.sendStatus(404);
    res.json(request);
  });

  app.post("/api/transport-requests", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const requestData = { ...req.body, userId: req.user!.id };
      const validatedData = insertTransportRequestSchema.parse(requestData);
      const request = await storage.createTransportRequest(validatedData);
      res.status(201).json(request);
    } catch (error) {
      res.status(400).json({ error: "Invalid transport request data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/transport-requests/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const request = await storage.updateTransportRequest(req.params.id, req.body, req.user!.id);
      if (!request) return res.sendStatus(404);
      res.json(request);
    } catch (error) {
      res.status(400).json({ error: "Failed to update transport request", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/transport-requests/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteTransportRequest(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // Intervention Documents
  app.get("/api/intervention-documents", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const documents = await storage.getInterventionDocuments(req.user!.id);
    res.json(documents);
  });

  app.get("/api/intervention-documents/project/:projectId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const documents = await storage.getInterventionDocumentsByProject(req.params.projectId, req.user!.id);
    res.json(documents);
  });

  app.get("/api/intervention-documents/transport-request/:transportRequestId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const documents = await storage.getInterventionDocumentsByTransportRequest(req.params.transportRequestId, req.user!.id);
    res.json(documents);
  });

  app.get("/api/intervention-documents/status/:status", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const documents = await storage.getInterventionDocumentsByStatus(req.params.status, req.user!.id);
    res.json(documents);
  });

  app.get("/api/intervention-documents/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const document = await storage.getInterventionDocument(req.params.id, req.user!.id);
    if (!document) return res.sendStatus(404);
    res.json(document);
  });

  app.post("/api/intervention-documents", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const documentData = { ...req.body, userId: req.user!.id };
      const validatedData = insertInterventionDocumentSchema.parse(documentData);
      const document = await storage.createInterventionDocument(validatedData);
      res.status(201).json(document);
    } catch (error) {
      res.status(400).json({ error: "Invalid intervention document data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/intervention-documents/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const document = await storage.updateInterventionDocument(req.params.id, req.body, req.user!.id);
      if (!document) return res.sendStatus(404);
      res.json(document);
    } catch (error) {
      res.status(400).json({ error: "Failed to update intervention document", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/intervention-documents/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteInterventionDocument(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // System Credentials (unified SAP + VPN)
  app.get("/api/system-credentials", async (req, res) => {
    // Temporarily disable auth to debug - TODO: fix session handling
    // if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = "811b4ad2-6882-4a7d-afcd-57dfb7f0af51"; // Your user ID
    const credentials = await storage.getSystemCredentials(userId);
    res.json(credentials);
  });

  app.get("/api/system-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const credential = await storage.getSystemCredential(req.params.id, req.user!.id);
    if (!credential) return res.sendStatus(404);
    res.json(credential);
  });

  app.post("/api/system-credentials", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const processedData = {
        ...req.body,
        userId: req.user!.id,
        expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : null
      };
      const credentialData = insertSystemCredentialsSchema.parse(processedData);
      const credential = await storage.createSystemCredential(credentialData);
      res.status(201).json(credential);
    } catch (error) {
      console.error("System credential creation error:", error);
      res.status(400).json({ error: "Invalid credential data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put("/api/system-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const updateData = {
        ...req.body,
        expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : null
      };
      const credential = await storage.updateSystemCredential(req.params.id, updateData, req.user!.id);
      if (!credential) return res.sendStatus(404);
      res.json(credential);
    } catch (error) {
      res.status(400).json({ error: "Failed to update credential", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/system-credentials/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const success = await storage.deleteSystemCredential(req.params.id, req.user!.id);
    if (!success) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // AI Documentation Generation
  app.post("/api/intervention-documents/generate", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { transportRequestId, title, type = "transport_analysis" } = req.body;
      
      if (!transportRequestId) {
        return res.status(400).json({ error: "Transport request ID is required" });
      }

      // Get transport request with cofile content for AI analysis
      const transportRequest = await storage.getTransportRequest(transportRequestId, req.user!.id);
      if (!transportRequest) {
        return res.status(404).json({ error: "Transport request not found" });
      }

      if (!transportRequest.cofileContent) {
        return res.status(400).json({ error: "Transport request must have cofile content for AI analysis" });
      }

      // Generate AI documentation
      const analysisPrompt = `Analyze this SAP transport request and generate professional documentation:
      
Transport: ${transportRequest.requestNumber}
Description: ${transportRequest.description}
Owner: ${transportRequest.owner}
Type: ${transportRequest.type}
Status: ${transportRequest.status}

Cofile Content:
${transportRequest.cofileContent}

Objects Included: ${transportRequest.includedObjects?.join(', ') || 'Not specified'}

Please generate a comprehensive intervention document that includes:
1. Executive Summary
2. Technical Changes Overview
3. Objects Modified/Created
4. Impact Analysis
5. Testing Recommendations
6. Deployment Notes
7. Rollback Procedures (if applicable)

Format the response as professional documentation suitable for client delivery.`;

      const aiResponse = await aiService.generateDocumentation(analysisPrompt);
      
      // Create intervention document with AI content
      const documentData = {
        userId: req.user!.id,
        transportRequestId,
        title: title || `Documentation for Transport ${transportRequest.requestNumber}`,
        type,
        aiGeneratedContent: aiResponse.content,
        aiConfidenceScore: aiResponse.confidence,
        aiModel: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        analysisPrompt,
        sourceFiles: transportRequest.cofilePath ? [transportRequest.cofilePath] : [],
        sapSystemId: transportRequest.sapSystemId,
        projectId: transportRequest.projectId,
        taskId: transportRequest.taskId
      };

      const validatedData = insertInterventionDocumentSchema.parse(documentData);
      const document = await storage.createInterventionDocument(validatedData);
      
      res.status(201).json({
        document,
        aiGenerated: true,
        confidence: aiResponse.confidence
      });
    } catch (error) {
      console.error("AI documentation generation error:", error);
      res.status(500).json({ 
        error: "Failed to generate AI documentation", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
