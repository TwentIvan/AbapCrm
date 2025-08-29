import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { z } from "zod";
import { 
  insertProjectSchema, insertTaskSchema, insertPartnerSchema, 
  insertDealSchema, insertCalendarEventSchema, insertPlanningWindowSchema, insertTimeEntrySchema,
  insertMessageSchema, insertCommentSchema, insertEmailConfigSchema
} from "@shared/schema";
import { aiService } from "./ai-service";
import { initializeEmailService, getEmailService } from "./imap-service";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

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
    
    // LOG: Chi sta creando timer
    console.log(`🟢 NEW TIMER REQUEST: User ${req.user!.id} creating timer for task ${req.body.taskId}`);
    console.log(`🟢 Request headers: ${JSON.stringify(req.headers['user-agent'])}`);
    console.log(`🟢 Request body: ${JSON.stringify(req.body)}`);
    
    try {
      const entryData = insertTimeEntrySchema.parse({
        taskId: req.body.taskId,
        startTime: req.body.startTime ? new Date(req.body.startTime) : new Date(),
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined,
        description: req.body.description || undefined,
        isRunning: req.body.isRunning === true,
        userId: req.user!.id
      });

      // If creating a running timer, stop any existing running timer first
      if (entryData.isRunning) {
        const existingRunning = await storage.getRunningTimeEntry(req.user!.id);
        if (existingRunning) {
          await storage.stopTimeEntry(existingRunning.id, req.user!.id);
          console.log(`🔴 Stopped existing running timer ${existingRunning.id} before starting new one`);
        }
      }

      const entry = await storage.createTimeEntry(entryData);
      console.log(`✅ NEW TIMER CREATED: ${entry.id} for task ${entry.taskId}`);
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

  const httpServer = createServer(app);
  return httpServer;
}
