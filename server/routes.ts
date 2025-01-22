import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupSocket } from "./socket";
import { db } from "@db";
import { users, calls, contacts } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  const httpServer = createServer(app);
  setupSocket(httpServer);

  // Search users
  app.get("/api/users/search", async (req, res) => {
    const { query } = req.query;
    if (!query || typeof query !== "string") {
      return res.status(400).send("Invalid query");
    }

    const results = await db
      .select()
      .from(users)
      .where(eq(users.username, query))
      .limit(10);

    res.json(results);
  });

  // Get call history
  app.get("/api/calls", async (req, res) => {
    if (!req.user) {
      return res.status(401).send("Not authenticated");
    }

    const callHistory = await db
      .select()
      .from(calls)
      .where(
        or(
          eq(calls.callerId, req.user.id),
          eq(calls.receiverId, req.user.id)
        )
      )
      .orderBy(desc(calls.startTime))
      .limit(50);

    res.json(callHistory);
  });

  // Add contact
  app.post("/api/contacts", async (req, res) => {
    if (!req.user) {
      return res.status(401).send("Not authenticated");
    }

    const { contactId, nickname } = req.body;
    if (!contactId) {
      return res.status(400).send("Contact ID required");
    }

    const [contact] = await db
      .insert(contacts)
      .values({
        userId: req.user.id,
        contactId,
        nickname
      })
      .returning();

    res.json(contact);
  });

  // Get contacts
  app.get("/api/contacts", async (req, res) => {
    if (!req.user) {
      return res.status(401).send("Not authenticated");
    }

    const userContacts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.userId, req.user.id));

    res.json(userContacts);
  });

  return httpServer;
}
