import type { Express, Request, Response } from "express";
import express from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { setupAuth } from "./auth";
import { probe, generateThumbnail } from "./media";
import { setupSocket } from "./socket";
import { db } from "@db";
import {
  users,
  videos,
  videoLikes,
  videoComments,
  broadcasts,
  follows,
  notifications,
  videoSaves,
  watchHistory,
  insertVideoSchema,
} from "@db/schema";
import { eq, and, desc, sql, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { createNotification } from "./notifications";

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.user) return res.status(401).json({ message: "Not authenticated" });
  next();
}

const createBroadcastSchema = z.object({
  title: z.string().min(1).max(140),
  description: z.string().max(2000).optional().default(""),
});

const commentSchema = z.object({
  content: z.string().min(1).max(500),
});

// Per-IP limiters. Slow-and-low (avoid hammering db / fs) without surprising
// real users.
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60, // 1 write/sec sustained
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many requests, slow down a bit." },
});

const commentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "You're commenting too quickly." },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Upload limit reached. Try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30, // 30 attempts per 15 min per IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many sign-in attempts. Try again later." },
});

export function registerRoutes(app: Express): Server {
  // Liveness probe — used by orchestrators / uptime checks.
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // Auth-related endpoints get the brute-force limiter.
  app.use(["/api/login", "/api/register", "/api/me/password", "/api/auth/forgot-password", "/api/auth/reset-password"], authLimiter);

  setupAuth(app);

  // Where uploaded video files + thumbnails live on disk.
  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const videoDir = path.join(uploadsRoot, "videos");
  const thumbDir = path.join(uploadsRoot, "thumbnails");
  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(thumbDir, { recursive: true });

  app.use("/uploads", express.static(uploadsRoot, { maxAge: "30d", immutable: true }));

  const videoUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, file, cb) => {
        cb(null, file.fieldname === "thumbnail" ? thumbDir : videoDir);
      },
      filename: (_req, file, cb) => {
        const id = crypto.randomBytes(12).toString("hex");
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^.\w]/g, "") || "";
        cb(null, `${Date.now()}-${id}${ext}`);
      },
    }),
    limits: { fileSize: 500 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.fieldname === "video" && !file.mimetype.startsWith("video/")) {
        return cb(new Error("Video file must be a video/* mimetype"));
      }
      if (file.fieldname === "thumbnail" && !file.mimetype.startsWith("image/")) {
        return cb(new Error("Thumbnail must be an image"));
      }
      cb(null, true);
    },
  });

  const httpServer = createServer(app);
  const io = setupSocket(httpServer);

  // ─── Users ─────────────────────────────────────────────────────────────
  app.get("/api/users/search", async (req, res) => {
    const q = (req.query.query as string | undefined)?.trim();
    if (!q) return res.json([]);

    const results = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarColor: users.avatarColor,
        bio: users.bio,
        status: users.status,
      })
      .from(users)
      .where(or(ilike(users.username, `%${q}%`), ilike(users.displayName, `%${q}%`)))
      .limit(20);

    res.json(results);
  });

  app.get("/api/users/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    // Count this visit only when someone other than the owner opens the page.
    const isMe = req.user?.id === id;
    if (!isMe) {
      await db
        .update(users)
        .set({ profileViews: sql`coalesce(${users.profileViews}, 0) + 1` })
        .where(eq(users.id, id));
    }

    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!u) return res.status(404).json({ message: "User not found" });

    const [{ vidCount }] = await db
      .select({ vidCount: sql<number>`count(*)::int` })
      .from(videos)
      .where(eq(videos.userId, id));

    const [{ followerCount }] = await db
      .select({ followerCount: sql<number>`count(*)::int` })
      .from(follows)
      .where(eq(follows.followingId, id));

    const [{ followingCount }] = await db
      .select({ followingCount: sql<number>`count(*)::int` })
      .from(follows)
      .where(eq(follows.followerId, id));

    let following = false;
    if (req.user && !isMe) {
      const [f] = await db
        .select()
        .from(follows)
        .where(and(eq(follows.followerId, req.user.id), eq(follows.followingId, id)))
        .limit(1);
      following = !!f;
    }

    res.json({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarColor: u.avatarColor,
      avatarUrl: u.avatarUrl,
      bio: u.bio,
      status: u.status,
      videoCount: vidCount,
      followers: followerCount,
      followingCount,
      profileViews: u.profileViews ?? 0,
      following,
      isMe,
    });
  });

  // Followers / Following lists
  app.get("/api/users/:id/followers", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarColor: users.avatarColor,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
      })
      .from(follows)
      .innerJoin(users, eq(follows.followerId, users.id))
      .where(eq(follows.followingId, id))
      .orderBy(desc(follows.createdAt))
      .limit(200);
    res.json(rows);
  });

  app.get("/api/users/:id/following", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarColor: users.avatarColor,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
      })
      .from(follows)
      .innerJoin(users, eq(follows.followingId, users.id))
      .where(eq(follows.followerId, id))
      .orderBy(desc(follows.createdAt))
      .limit(200);
    res.json(rows);
  });

  app.post("/api/users/:id/follow", writeLimiter, requireAuth, async (req, res) => {
    const targetId = Number(req.params.id);
    if (!Number.isFinite(targetId) || targetId === req.user!.id) {
      return res.status(400).json({ message: "Invalid target" });
    }

    const [existing] = await db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, req.user!.id), eq(follows.followingId, targetId)))
      .limit(1);

    if (existing) {
      await db.delete(follows).where(eq(follows.id, existing.id));
      return res.json({ following: false });
    }

    await db.insert(follows).values({ followerId: req.user!.id, followingId: targetId });
    createNotification({
      userId: targetId,
      actorId: req.user!.id,
      type: "follow",
    }).catch((err) => console.error("notify follow", err));
    res.json({ following: true });
  });

  // ─── Creator dashboard ─────────────────────────────────────────────────
  app.get("/api/me/dashboard", requireAuth, async (req, res) => {
    const me = req.user!.id;

    const [agg] = await db
      .select({
        videoCount: sql<number>`count(*)::int`,
        totalViews: sql<number>`coalesce(sum(${videos.views}), 0)::int`,
      })
      .from(videos)
      .where(eq(videos.userId, me));

    const [{ totalLikes }] = await db
      .select({
        totalLikes: sql<number>`count(*)::int`,
      })
      .from(videoLikes)
      .innerJoin(videos, eq(videoLikes.videoId, videos.id))
      .where(eq(videos.userId, me));

    const [{ totalComments }] = await db
      .select({
        totalComments: sql<number>`count(*)::int`,
      })
      .from(videoComments)
      .innerJoin(videos, eq(videoComments.videoId, videos.id))
      .where(eq(videos.userId, me));

    const [{ followers }] = await db
      .select({ followers: sql<number>`count(*)::int` })
      .from(follows)
      .where(eq(follows.followingId, me));

    const likeCount = sql<number>`(select count(*)::int from ${videoLikes} where ${videoLikes.videoId} = ${videos.id})`;
    const commentCount = sql<number>`(select count(*)::int from ${videoComments} where ${videoComments.videoId} = ${videos.id})`;

    const top = await db
      .select({
        id: videos.id,
        title: videos.title,
        thumbnail: videos.thumbnail,
        views: videos.views,
        durationSec: videos.durationSec,
        likeCount,
        commentCount,
        createdAt: videos.createdAt,
      })
      .from(videos)
      .where(eq(videos.userId, me))
      .orderBy(desc(likeCount), desc(videos.views), desc(videos.createdAt))
      .limit(5);

    res.json({
      videoCount: agg?.videoCount ?? 0,
      totalViews: agg?.totalViews ?? 0,
      totalLikes,
      totalComments,
      followers,
      topVideos: top,
    });
  });

  // ─── Notifications ─────────────────────────────────────────────────────
  app.get("/api/notifications", requireAuth, async (req, res) => {
    const rows = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        videoId: notifications.videoId,
        broadcastId: notifications.broadcastId,
        content: notifications.content,
        read: notifications.read,
        createdAt: notifications.createdAt,
        actorId: notifications.actorId,
        actorUsername: users.username,
        actorDisplayName: users.displayName,
        actorColor: users.avatarColor,
        actorAvatarUrl: users.avatarUrl,
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.actorId, users.id))
      .where(eq(notifications.userId, req.user!.id))
      .orderBy(desc(notifications.createdAt))
      .limit(60);

    const [{ unread }] = await db
      .select({ unread: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, req.user!.id), eq(notifications.read, false)));

    res.json({ items: rows, unread });
  });

  app.post("/api/notifications/mark-read", requireAuth, async (req, res) => {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, req.user!.id), eq(notifications.read, false)));
    res.json({ ok: true });
  });

  // ─── Edit own profile ──────────────────────────────────────────────────
  const profileUpdateSchema = z.object({
    displayName: z.string().min(1).max(60).optional(),
    bio: z.string().max(280).optional(),
    avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  });

  app.patch("/api/me", requireAuth, async (req, res) => {
    const result = profileUpdateSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Invalid input" });

    const [updated] = await db
      .update(users)
      .set(result.data)
      .where(eq(users.id, req.user!.id))
      .returning();

    res.json(updated);
  });

  // ─── Video feed ────────────────────────────────────────────────────────
  app.get("/api/videos", async (req, res) => {
    const category = req.query.category as string | undefined;
    const search = (req.query.search as string | undefined)?.trim();
    const feed = req.query.feed as string | undefined; // "following" | "trending" | undefined
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;
    const pageSize = Math.min(Math.max(Number(req.query.limit) || 24, 1), 60);

    const followingFilter =
      feed === "following" && req.user
        ? sql`${videos.userId} in (select ${follows.followingId} from ${follows} where ${follows.followerId} = ${req.user.id})`
        : undefined;

    const likeCount = sql<number>`(select count(*)::int from ${videoLikes} where ${videoLikes.videoId} = ${videos.id})`;
    const cursorFilter =
      cursor && Number.isFinite(cursor) ? sql`${videos.id} < ${cursor}` : undefined;

    // We paginate by id desc (createdAt has the same monotonic order in
    // practice and id makes for a clean cursor). Trending sort still happens
    // in-app: we fetch a wider window then re-rank client-side... actually
    // for simplicity we only support cursor pagination for createdAt order.
    // Trending mode falls back to a single (larger) page.

    const useTrending = feed === "trending";
    const order = useTrending
      ? [
          desc(sql<number>`(
            ((select count(*)::int from ${videoLikes} where ${videoLikes.videoId} = ${videos.id}) * 2
              + coalesce(${videos.views}, 0))::float
            / greatest(extract(epoch from (now() - ${videos.createdAt})) / 3600.0, 1)
          )`),
          desc(videos.createdAt),
        ]
      : [desc(videos.createdAt), desc(videos.id)];

    const rows = await db
      .select({
        id: videos.id,
        title: videos.title,
        description: videos.description,
        thumbnail: videos.thumbnail,
        videoUrl: videos.videoUrl,
        durationSec: videos.durationSec,
        views: videos.views,
        category: videos.category,
        createdAt: videos.createdAt,
        userId: videos.userId,
        authorUsername: users.username,
        authorDisplayName: users.displayName,
        authorColor: users.avatarColor,
        likeCount,
        commentCount: sql<number>`(select count(*)::int from ${videoComments} where ${videoComments.videoId} = ${videos.id})`,
      })
      .from(videos)
      .innerJoin(users, eq(videos.userId, users.id))
      .where(
        and(
          category && category !== "All" ? eq(videos.category, category) : undefined,
          search ? ilike(videos.title, `%${search}%`) : undefined,
          followingFilter,
          // Cursor only applies to recency-ordered feeds; trending uses a
          // single page so cursoring in/out of it is misleading.
          useTrending ? undefined : cursorFilter,
        ),
      )
      .orderBy(...order)
      .limit(pageSize + 1);

    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore && !useTrending ? items[items.length - 1].id : null;

    res.json({ items, nextCursor });
  });

  app.get("/api/videos/:id/related", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    const [base] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
    if (!base) return res.status(404).json({ message: "Video not found" });

    const likeCount = sql<number>`(select count(*)::int from ${videoLikes} where ${videoLikes.videoId} = ${videos.id})`;

    const rows = await db
      .select({
        id: videos.id,
        title: videos.title,
        thumbnail: videos.thumbnail,
        videoUrl: videos.videoUrl,
        durationSec: videos.durationSec,
        views: videos.views,
        category: videos.category,
        createdAt: videos.createdAt,
        userId: videos.userId,
        authorUsername: users.username,
        authorDisplayName: users.displayName,
        authorColor: users.avatarColor,
        likeCount,
        commentCount: sql<number>`(select count(*)::int from ${videoComments} where ${videoComments.videoId} = ${videos.id})`,
        sameAuthor: sql<boolean>`(${videos.userId} = ${base.userId})`,
      })
      .from(videos)
      .innerJoin(users, eq(videos.userId, users.id))
      .where(
        and(
          // exclude the current video
          sql`${videos.id} <> ${id}`,
          or(eq(videos.userId, base.userId), eq(videos.category, base.category ?? "General")),
        ),
      )
      .orderBy(desc(sql`(${videos.userId} = ${base.userId})`), desc(likeCount), desc(videos.createdAt))
      .limit(8);

    res.json(rows);
  });

  app.get("/api/videos/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    const [row] = await db
      .select({
        id: videos.id,
        title: videos.title,
        description: videos.description,
        thumbnail: videos.thumbnail,
        videoUrl: videos.videoUrl,
        durationSec: videos.durationSec,
        views: videos.views,
        category: videos.category,
        createdAt: videos.createdAt,
        userId: videos.userId,
        authorUsername: users.username,
        authorDisplayName: users.displayName,
        authorColor: users.avatarColor,
        likeCount: sql<number>`(select count(*)::int from ${videoLikes} where ${videoLikes.videoId} = ${videos.id})`,
        commentCount: sql<number>`(select count(*)::int from ${videoComments} where ${videoComments.videoId} = ${videos.id})`,
      })
      .from(videos)
      .innerJoin(users, eq(videos.userId, users.id))
      .where(eq(videos.id, id))
      .limit(1);

    if (!row) return res.status(404).json({ message: "Video not found" });

    let liked = false;
    let saved = false;
    let progressSec = 0;
    if (req.user) {
      const [l] = await db
        .select()
        .from(videoLikes)
        .where(and(eq(videoLikes.videoId, id), eq(videoLikes.userId, req.user.id)))
        .limit(1);
      liked = !!l;

      const [s] = await db
        .select()
        .from(videoSaves)
        .where(and(eq(videoSaves.videoId, id), eq(videoSaves.userId, req.user.id)))
        .limit(1);
      saved = !!s;

      const [h] = await db
        .select()
        .from(watchHistory)
        .where(and(eq(watchHistory.videoId, id), eq(watchHistory.userId, req.user.id)))
        .limit(1);
      progressSec = h?.progressSec ?? 0;
    }

    await db.update(videos).set({ views: (row.views ?? 0) + 1 }).where(eq(videos.id, id));

    res.json({ ...row, liked, saved, progressSec });
  });

  app.post(
    "/api/videos",
    uploadLimiter,
    requireAuth,
    videoUpload.fields([
      { name: "video", maxCount: 1 },
      { name: "thumbnail", maxCount: 1 },
    ]),
    async (req, res) => {
      const files = req.files as { video?: Express.Multer.File[]; thumbnail?: Express.Multer.File[] };
      const videoFile = files?.video?.[0];

      const cleanup = () => {
        files?.video?.forEach((f) => fs.unlink(f.path, () => {}));
        files?.thumbnail?.forEach((f) => fs.unlink(f.path, () => {}));
      };

      if (!videoFile) {
        cleanup();
        return res.status(400).json({ message: "Missing video file" });
      }

      const title = String(req.body.title ?? "").trim();
      const description = String(req.body.description ?? "").trim();
      const category = String(req.body.category ?? "General").trim();
      const clientDurationSec = Math.max(0, Math.floor(Number(req.body.durationSec ?? 0)));

      if (!title || title.length > 140) {
        cleanup();
        return res.status(400).json({ message: "Title is required (max 140 chars)" });
      }

      const videoUrl = `/uploads/videos/${path.basename(videoFile.path)}`;

      // ── Server-side media probe ─────────────────────────────────────────
      // Fall back to whatever the client captured if ffprobe/ffmpeg fail.
      let durationSec = clientDurationSec;
      try {
        const probed = await probe(videoFile.path);
        if (probed.durationSec > 0) durationSec = probed.durationSec;
      } catch (err) {
        console.warn("[upload] ffprobe failed, keeping client duration:", err);
      }

      const thumbFile = files?.thumbnail?.[0];
      let thumbnail: string | null = thumbFile
        ? `/uploads/thumbnails/${path.basename(thumbFile.path)}`
        : null;

      if (!thumbnail) {
        try {
          const baseName = path.parse(videoFile.path).name;
          const generated = await generateThumbnail({
            inputPath: videoFile.path,
            outDir: thumbDir,
            baseName,
            durationSec,
          });
          thumbnail = `/uploads/thumbnails/${path.basename(generated)}`;
        } catch (err) {
          console.warn("[upload] thumbnail generation failed:", err);
        }
      }

      const [video] = await db
        .insert(videos)
        .values({
          userId: req.user!.id,
          title,
          description,
          videoUrl,
          thumbnail,
          durationSec,
          category: category || "General",
        })
        .returning();

      res.json(video);
    },
  );

  app.delete("/api/videos/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const [vid] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
    if (!vid) return res.status(404).json({ message: "Not found" });
    if (vid.userId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });

    await db.delete(videoLikes).where(eq(videoLikes.videoId, id));
    await db.delete(videoComments).where(eq(videoComments.videoId, id));
    await db.delete(videoSaves).where(eq(videoSaves.videoId, id));
    await db.delete(watchHistory).where(eq(watchHistory.videoId, id));
    await db.delete(notifications).where(eq(notifications.videoId, id));
    await db.delete(videos).where(eq(videos.id, id));

    // Best-effort: clean up files on disk if they live in our uploads dir.
    const tryUnlink = (urlPath: string | null) => {
      if (!urlPath || !urlPath.startsWith("/uploads/")) return;
      const local = path.join(uploadsRoot, urlPath.replace(/^\/uploads\//, ""));
      fs.unlink(local, () => {});
    };
    tryUnlink(vid.videoUrl);
    tryUnlink(vid.thumbnail);

    res.json({ ok: true });
  });

  // ─── Likes ─────────────────────────────────────────────────────────────
  app.post("/api/videos/:id/like", writeLimiter, requireAuth, async (req, res) => {
    const videoId = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(videoLikes)
      .where(and(eq(videoLikes.videoId, videoId), eq(videoLikes.userId, req.user!.id)))
      .limit(1);

    if (existing) {
      await db.delete(videoLikes).where(eq(videoLikes.id, existing.id));
      return res.json({ liked: false });
    }
    await db.insert(videoLikes).values({ videoId, userId: req.user!.id });

    const [vid] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
    if (vid) {
      createNotification({
        userId: vid.userId,
        actorId: req.user!.id,
        type: "like",
        videoId,
        content: vid.title,
      }).catch((err) => console.error("notify like", err));
    }
    res.json({ liked: true });
  });

  // ─── Comments ──────────────────────────────────────────────────────────
  app.get("/api/videos/:id/comments", async (req, res) => {
    const videoId = Number(req.params.id);
    const rows = await db
      .select({
        id: videoComments.id,
        content: videoComments.content,
        createdAt: videoComments.createdAt,
        userId: videoComments.userId,
        username: users.username,
        displayName: users.displayName,
        avatarColor: users.avatarColor,
        avatarUrl: users.avatarUrl,
      })
      .from(videoComments)
      .innerJoin(users, eq(videoComments.userId, users.id))
      .where(eq(videoComments.videoId, videoId))
      .orderBy(desc(videoComments.createdAt))
      .limit(200);

    res.json(rows);
  });

  app.post("/api/videos/:id/comments", commentLimiter, requireAuth, async (req, res) => {
    const videoId = Number(req.params.id);
    const result = commentSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Invalid comment" });

    const [c] = await db
      .insert(videoComments)
      .values({ videoId, userId: req.user!.id, content: result.data.content })
      .returning();

    const [vid] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
    if (vid) {
      createNotification({
        userId: vid.userId,
        actorId: req.user!.id,
        type: "comment",
        videoId,
        content: result.data.content.slice(0, 100),
      }).catch((err) => console.error("notify comment", err));
    }
    res.json(c);
  });

  app.patch("/api/comments/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const result = commentSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Invalid comment" });

    const [c] = await db.select().from(videoComments).where(eq(videoComments.id, id)).limit(1);
    if (!c) return res.status(404).json({ message: "Not found" });
    if (c.userId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });

    const [updated] = await db
      .update(videoComments)
      .set({ content: result.data.content })
      .where(eq(videoComments.id, id))
      .returning();
    res.json(updated);
  });

  app.delete("/api/comments/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    const [c] = await db.select().from(videoComments).where(eq(videoComments.id, id)).limit(1);
    if (!c) return res.status(404).json({ message: "Not found" });

    // Comment author can delete their own; video owner can delete any on their video.
    let canDelete = c.userId === req.user!.id;
    if (!canDelete) {
      const [vid] = await db.select().from(videos).where(eq(videos.id, c.videoId)).limit(1);
      canDelete = !!vid && vid.userId === req.user!.id;
    }
    if (!canDelete) return res.status(403).json({ message: "Forbidden" });

    await db.delete(videoComments).where(eq(videoComments.id, id));
    res.json({ ok: true });
  });

  // ─── Broadcasts (live) ─────────────────────────────────────────────────
  app.get("/api/broadcasts", async (_req, res) => {
    const rows = await db
      .select({
        id: broadcasts.id,
        title: broadcasts.title,
        description: broadcasts.description,
        isLive: broadcasts.isLive,
        viewerCount: broadcasts.viewerCount,
        startedAt: broadcasts.startedAt,
        hostId: broadcasts.hostId,
        hostUsername: users.username,
        hostDisplayName: users.displayName,
        hostColor: users.avatarColor,
      })
      .from(broadcasts)
      .innerJoin(users, eq(broadcasts.hostId, users.id))
      .where(eq(broadcasts.isLive, true))
      .orderBy(desc(broadcasts.startedAt));

    res.json(rows);
  });

  app.get("/api/broadcasts/:id", async (req, res) => {
    const id = Number(req.params.id);
    const [row] = await db
      .select({
        id: broadcasts.id,
        title: broadcasts.title,
        description: broadcasts.description,
        isLive: broadcasts.isLive,
        viewerCount: broadcasts.viewerCount,
        startedAt: broadcasts.startedAt,
        hostId: broadcasts.hostId,
        hostUsername: users.username,
        hostDisplayName: users.displayName,
        hostColor: users.avatarColor,
      })
      .from(broadcasts)
      .innerJoin(users, eq(broadcasts.hostId, users.id))
      .where(eq(broadcasts.id, id))
      .limit(1);

    if (!row) return res.status(404).json({ message: "Broadcast not found" });
    res.json(row);
  });

  app.post("/api/broadcasts", requireAuth, async (req, res) => {
    const result = createBroadcastSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Invalid input" });

    const [b] = await db
      .insert(broadcasts)
      .values({
        hostId: req.user!.id,
        title: result.data.title,
        description: result.data.description ?? "",
        isLive: false,
        viewerCount: 0,
      })
      .returning();

    res.json(b);
  });

  app.post("/api/broadcasts/:id/end", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const [b] = await db.select().from(broadcasts).where(eq(broadcasts.id, id)).limit(1);
    if (!b) return res.status(404).json({ message: "Not found" });
    if (b.hostId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });

    await db
      .update(broadcasts)
      .set({ isLive: false, endedAt: new Date() })
      .where(eq(broadcasts.id, id));

    io.to(`live:${id}`).emit("broadcast:ended", { broadcastId: id });
    res.json({ ok: true });
  });

  // ─── Saves ─────────────────────────────────────────────────────────────
  app.post("/api/videos/:id/save", writeLimiter, requireAuth, async (req, res) => {
    const videoId = Number(req.params.id);
    if (!Number.isFinite(videoId)) return res.status(400).json({ message: "Invalid id" });

    const [existing] = await db
      .select()
      .from(videoSaves)
      .where(and(eq(videoSaves.userId, req.user!.id), eq(videoSaves.videoId, videoId)))
      .limit(1);

    if (existing) {
      await db.delete(videoSaves).where(eq(videoSaves.id, existing.id));
      return res.json({ saved: false });
    }
    await db.insert(videoSaves).values({ userId: req.user!.id, videoId });
    res.json({ saved: true });
  });

  app.get("/api/me/saves", requireAuth, async (req, res) => {
    const rows = await db
      .select({
        id: videos.id,
        title: videos.title,
        thumbnail: videos.thumbnail,
        videoUrl: videos.videoUrl,
        durationSec: videos.durationSec,
        views: videos.views,
        category: videos.category,
        createdAt: videos.createdAt,
        userId: videos.userId,
        authorUsername: users.username,
        authorDisplayName: users.displayName,
        authorColor: users.avatarColor,
        likeCount: sql<number>`(select count(*)::int from ${videoLikes} where ${videoLikes.videoId} = ${videos.id})`,
        commentCount: sql<number>`(select count(*)::int from ${videoComments} where ${videoComments.videoId} = ${videos.id})`,
        savedAt: videoSaves.createdAt,
      })
      .from(videoSaves)
      .innerJoin(videos, eq(videoSaves.videoId, videos.id))
      .innerJoin(users, eq(videos.userId, users.id))
      .where(eq(videoSaves.userId, req.user!.id))
      .orderBy(desc(videoSaves.createdAt))
      .limit(100);

    res.json(rows);
  });

  // ─── Watch history + progress ──────────────────────────────────────────
  const progressSchema = z.object({
    progressSec: z.number().int().nonnegative(),
    completed: z.boolean().optional(),
  });

  app.post("/api/videos/:id/progress", requireAuth, async (req, res) => {
    const videoId = Number(req.params.id);
    if (!Number.isFinite(videoId)) return res.status(400).json({ message: "Invalid id" });

    const result = progressSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Invalid input" });

    const [existing] = await db
      .select()
      .from(watchHistory)
      .where(and(eq(watchHistory.userId, req.user!.id), eq(watchHistory.videoId, videoId)))
      .limit(1);

    if (existing) {
      await db
        .update(watchHistory)
        .set({
          progressSec: result.data.progressSec,
          completed: result.data.completed ?? existing.completed,
          lastWatchedAt: new Date(),
        })
        .where(eq(watchHistory.id, existing.id));
    } else {
      await db.insert(watchHistory).values({
        userId: req.user!.id,
        videoId,
        progressSec: result.data.progressSec,
        completed: result.data.completed ?? false,
      });
    }
    res.json({ ok: true });
  });

  app.get("/api/me/history", requireAuth, async (req, res) => {
    const rows = await db
      .select({
        id: videos.id,
        title: videos.title,
        thumbnail: videos.thumbnail,
        videoUrl: videos.videoUrl,
        durationSec: videos.durationSec,
        views: videos.views,
        category: videos.category,
        createdAt: videos.createdAt,
        userId: videos.userId,
        authorUsername: users.username,
        authorDisplayName: users.displayName,
        authorColor: users.avatarColor,
        likeCount: sql<number>`(select count(*)::int from ${videoLikes} where ${videoLikes.videoId} = ${videos.id})`,
        commentCount: sql<number>`(select count(*)::int from ${videoComments} where ${videoComments.videoId} = ${videos.id})`,
        progressSec: watchHistory.progressSec,
        completed: watchHistory.completed,
        lastWatchedAt: watchHistory.lastWatchedAt,
      })
      .from(watchHistory)
      .innerJoin(videos, eq(watchHistory.videoId, videos.id))
      .innerJoin(users, eq(videos.userId, users.id))
      .where(eq(watchHistory.userId, req.user!.id))
      .orderBy(desc(watchHistory.lastWatchedAt))
      .limit(60);

    res.json(rows);
  });

  app.delete("/api/me/history", requireAuth, async (req, res) => {
    await db.delete(watchHistory).where(eq(watchHistory.userId, req.user!.id));
    res.json({ ok: true });
  });

  app.delete("/api/me/history/:videoId", requireAuth, async (req, res) => {
    const videoId = Number(req.params.videoId);
    if (!Number.isFinite(videoId)) return res.status(400).json({ message: "Invalid id" });
    await db
      .delete(watchHistory)
      .where(and(eq(watchHistory.userId, req.user!.id), eq(watchHistory.videoId, videoId)));
    res.json({ ok: true });
  });

  // ─── User videos (profile) ─────────────────────────────────────────────
  app.get("/api/users/:id/videos", async (req, res) => {
    const userId = Number(req.params.id);
    const rows = await db
      .select({
        id: videos.id,
        title: videos.title,
        thumbnail: videos.thumbnail,
        videoUrl: videos.videoUrl,
        durationSec: videos.durationSec,
        views: videos.views,
        category: videos.category,
        createdAt: videos.createdAt,
        userId: videos.userId,
        authorUsername: users.username,
        authorDisplayName: users.displayName,
        authorColor: users.avatarColor,
        likeCount: sql<number>`(select count(*)::int from ${videoLikes} where ${videoLikes.videoId} = ${videos.id})`,
        commentCount: sql<number>`(select count(*)::int from ${videoComments} where ${videoComments.videoId} = ${videos.id})`,
      })
      .from(videos)
      .innerJoin(users, eq(videos.userId, users.id))
      .where(eq(videos.userId, userId))
      .orderBy(desc(videos.createdAt));

    res.json(rows);
  });

  // ─── User's top (most-liked) videos ────────────────────────────────────
  app.get("/api/users/:id/top-videos", async (req, res) => {
    const userId = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 6, 20);

    const likeCount = sql<number>`(select count(*)::int from ${videoLikes} where ${videoLikes.videoId} = ${videos.id})`;

    const rows = await db
      .select({
        id: videos.id,
        title: videos.title,
        thumbnail: videos.thumbnail,
        videoUrl: videos.videoUrl,
        durationSec: videos.durationSec,
        views: videos.views,
        category: videos.category,
        createdAt: videos.createdAt,
        userId: videos.userId,
        authorUsername: users.username,
        authorDisplayName: users.displayName,
        authorColor: users.avatarColor,
        likeCount,
        commentCount: sql<number>`(select count(*)::int from ${videoComments} where ${videoComments.videoId} = ${videos.id})`,
      })
      .from(videos)
      .innerJoin(users, eq(videos.userId, users.id))
      .where(eq(videos.userId, userId))
      .orderBy(desc(likeCount), desc(videos.views), desc(videos.createdAt))
      .limit(limit);

    // Don't surface zero-like videos as "top" — they're just the most recent.
    res.json(rows.filter((r) => (r.likeCount ?? 0) > 0));
  });

  // ─── User's currently-live broadcasts ──────────────────────────────────
  app.get("/api/users/:id/broadcasts", async (req, res) => {
    const userId = Number(req.params.id);
    const rows = await db
      .select({
        id: broadcasts.id,
        title: broadcasts.title,
        description: broadcasts.description,
        isLive: broadcasts.isLive,
        viewerCount: broadcasts.viewerCount,
        startedAt: broadcasts.startedAt,
        hostId: broadcasts.hostId,
        hostUsername: users.username,
        hostDisplayName: users.displayName,
        hostColor: users.avatarColor,
      })
      .from(broadcasts)
      .innerJoin(users, eq(broadcasts.hostId, users.id))
      .where(and(eq(broadcasts.hostId, userId), eq(broadcasts.isLive, true)))
      .orderBy(desc(broadcasts.startedAt));

    res.json(rows);
  });

  return httpServer;
}
