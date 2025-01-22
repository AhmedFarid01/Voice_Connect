import { Server as HTTPServer } from "http";
import { Server } from "socket.io";
import { db } from "@db";
import { users, calls } from "@db/schema";
import { eq } from "drizzle-orm";

export function setupSocket(server: HTTPServer) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const connectedUsers = new Map<number, string>();

  io.on("connection", (socket) => {
    let userId: number;

    socket.on("register", async (id: number) => {
      userId = id;
      connectedUsers.set(id, socket.id);
      
      await db
        .update(users)
        .set({ status: "online" })
        .where(eq(users.id, id));

      io.emit("userStatus", { userId: id, status: "online" });
    });

    socket.on("disconnect", async () => {
      if (userId) {
        connectedUsers.delete(userId);
        
        await db
          .update(users)
          .set({ status: "offline" })
          .where(eq(users.id, userId));

        io.emit("userStatus", { userId, status: "offline" });
      }
    });

    // WebRTC Signaling
    socket.on("call:offer", async ({ to, offer }) => {
      const toSocket = connectedUsers.get(to);
      if (toSocket) {
        io.to(toSocket).emit("call:offer", {
          from: userId,
          offer
        });

        await db.insert(calls).values({
          callerId: userId,
          receiverId: to,
          status: "pending",
          startTime: new Date()
        });
      }
    });

    socket.on("call:answer", ({ to, answer }) => {
      const toSocket = connectedUsers.get(to);
      if (toSocket) {
        io.to(toSocket).emit("call:answer", {
          from: userId,
          answer
        });
      }
    });

    socket.on("call:ice-candidate", ({ to, candidate }) => {
      const toSocket = connectedUsers.get(to);
      if (toSocket) {
        io.to(toSocket).emit("call:ice-candidate", {
          from: userId,
          candidate
        });
      }
    });

    socket.on("call:end", async ({ callId, to }) => {
      const toSocket = connectedUsers.get(to);
      if (toSocket) {
        io.to(toSocket).emit("call:end", { from: userId });
      }

      await db
        .update(calls)
        .set({
          status: "completed",
          endTime: new Date()
        })
        .where(eq(calls.id, callId));
    });
  });

  return io;
}
