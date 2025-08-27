import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { 
  insertProjectSchema, insertTaskSchema, insertPartnerSchema, 
  insertDealSchema, insertCalendarEventSchema 
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
      const projectData = insertProjectSchema.parse({ ...req.body, userId: req.user!.id });
      const project = await storage.createProject(projectData);
      res.status(201).json(project);
    } catch (error) {
      res.status(400).json({ error: "Invalid project data" });
    }
  });

  app.put("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const project = await storage.updateProject(req.params.id, req.body, req.user!.id);
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

  app.post("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const taskData = insertTaskSchema.parse({ ...req.body, userId: req.user!.id });
      const task = await storage.createTask(taskData);
      res.status(201).json(task);
    } catch (error) {
      res.status(400).json({ error: "Invalid task data" });
    }
  });

  app.put("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const task = await storage.updateTask(req.params.id, req.body, req.user!.id);
      if (!task) return res.sendStatus(404);
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: "Invalid task data" });
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
      const partnerData = insertPartnerSchema.parse({ ...req.body, userId: req.user!.id });
      const partner = await storage.createPartner(partnerData);
      res.status(201).json(partner);
    } catch (error) {
      res.status(400).json({ error: "Invalid partner data" });
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
      const dealData = insertDealSchema.parse({ ...req.body, userId: req.user!.id });
      const deal = await storage.createDeal(dealData);
      res.status(201).json(deal);
    } catch (error) {
      res.status(400).json({ error: "Invalid deal data" });
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

  const httpServer = createServer(app);
  return httpServer;
}
