import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { z } from "zod";
import { 
  insertProjectSchema, insertTaskSchema, insertPartnerSchema, 
  insertDealSchema, insertCalendarEventSchema, insertPlanningWindowSchema, insertTimeEntrySchema
} from "@shared/schema";

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
        type: req.body.type,
        notes: req.body.notes || null,
        userId: req.user!.id
      });
      const partner = await storage.createPartner(partnerData);
      res.status(201).json(partner);
    } catch (error) {
      console.error("Partner creation error:", error);
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
        workingHoursPerDay: req.body.workingHoursPerDay || 8,
        isActive: req.body.isActive !== undefined ? req.body.isActive : true,
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
      };
      const window = await storage.updatePlanningWindow(req.params.id, updateData, req.user!.id);
      if (!window) return res.sendStatus(404);
      res.json(window);
    } catch (error) {
      res.status(400).json({ error: "Invalid planning window data" });
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

  const httpServer = createServer(app);
  return httpServer;
}
