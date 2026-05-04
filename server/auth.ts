import passport from "passport";
import { IVerifyOptions, Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { type Express, type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual, createHash } from "crypto";
import { promisify } from "util";
import { users, passwordResetTokens, insertUserSchema, type User as DbUser } from "@db/schema";
import { db } from "@db";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { sendMail } from "./mailer";

const scryptAsync = promisify(scrypt);
const crypto = {
  hash: async (password: string) => {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  },
  compare: async (suppliedPassword: string, storedPassword: string | null) => {
    if (!storedPassword) return false;
    const [hashedPassword, salt] = storedPassword.split(".");
    if (!hashedPassword || !salt) return false;
    const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
    const suppliedPasswordBuf = (await scryptAsync(suppliedPassword, salt, 64)) as Buffer;
    return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
  },
};

const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerInputSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  email: z.string().email("Invalid email"),
  displayName: z.string().optional(),
});

const AVATAR_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#14b8a6",
];
const pickColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

declare global {
  namespace Express {
    interface User extends DbUser {}
  }
}

const slugify = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24) || "user";

async function ensureUniqueUsername(base: string): Promise<string> {
  let candidate = base;
  let suffix = 0;
  while (true) {
    const [hit] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, candidate))
      .limit(1);
    if (!hit) return candidate;
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
}

interface OAuthProfile {
  provider: "google" | "github";
  providerId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  usernameHint: string | null;
}

async function findOrCreateOAuthUser(p: OAuthProfile): Promise<DbUser> {
  // 1. Existing OAuth identity?
  const [byProvider] = await db
    .select()
    .from(users)
    .where(eq(users.providerId, p.providerId))
    .limit(1);
  if (byProvider && byProvider.provider === p.provider) {
    // Refresh display name / avatar if the provider supplied newer ones
    const updates: Partial<DbUser> = {};
    if (p.displayName && p.displayName !== byProvider.displayName) updates.displayName = p.displayName;
    if (p.avatarUrl && p.avatarUrl !== byProvider.avatarUrl) updates.avatarUrl = p.avatarUrl;
    if (Object.keys(updates).length) {
      const [updated] = await db.update(users).set(updates).where(eq(users.id, byProvider.id)).returning();
      return updated;
    }
    return byProvider;
  }

  // 2. Existing email — link the OAuth identity to that account
  if (p.email) {
    const [byEmail] = await db.select().from(users).where(eq(users.email, p.email)).limit(1);
    if (byEmail) {
      const [linked] = await db
        .update(users)
        .set({
          provider: p.provider,
          providerId: p.providerId,
          avatarUrl: byEmail.avatarUrl ?? p.avatarUrl,
          displayName: byEmail.displayName ?? p.displayName,
        })
        .where(eq(users.id, byEmail.id))
        .returning();
      return linked;
    }
  }

  // 3. Create a brand-new user
  const baseUsername = slugify(p.usernameHint || (p.email ? p.email.split("@")[0] : "") || p.displayName || "user");
  const username = await ensureUniqueUsername(baseUsername);
  const email = p.email ?? `${username}.${p.provider}@lumen.local`;

  const [created] = await db
    .insert(users)
    .values({
      username,
      email,
      password: null,
      displayName: p.displayName || username,
      avatarColor: pickColor(),
      avatarUrl: p.avatarUrl,
      status: "online",
      provider: p.provider,
      providerId: p.providerId,
    })
    .returning();
  return created;
}

export function setupAuth(app: Express) {
  const MemoryStore = createMemoryStore(session);
  const useSecureCookies = process.env.SECURE_COOKIES === "true";
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || process.env.REPL_ID || "lumen-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: useSecureCookies,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
    store: new MemoryStore({
      checkPeriod: 86400000,
    }),
  };

  if (useSecureCookies) {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // ── Local username/password ───────────────────────────────────────────
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
        if (!user) return done(null, false, { message: "Incorrect username." });
        if (!user.password) {
          return done(null, false, {
            message: `This account uses ${user.provider}. Continue with ${user.provider} instead.`,
          });
        }
        const isMatch = await crypto.compare(password, user.password);
        if (!isMatch) return done(null, false, { message: "Incorrect password." });
        return done(null, user);
      } catch (err) {
        return done(err as Error);
      }
    }),
  );

  // ── Google ────────────────────────────────────────────────────────────
  const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (googleConfigured) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback",
          passReqToCallback: false,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const user = await findOrCreateOAuthUser({
              provider: "google",
              providerId: profile.id,
              email: profile.emails?.[0]?.value ?? null,
              displayName: profile.displayName ?? null,
              avatarUrl: profile.photos?.[0]?.value ?? null,
              usernameHint: profile.emails?.[0]?.value?.split("@")[0] ?? null,
            });
            done(null, user);
          } catch (err) {
            done(err as Error);
          }
        },
      ),
    );
  }

  // ── GitHub ────────────────────────────────────────────────────────────
  const githubConfigured = !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  if (githubConfigured) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
          callbackURL: process.env.GITHUB_CALLBACK_URL || "/api/auth/github/callback",
          scope: ["user:email"],
        },
        async (_accessToken: string, _refreshToken: string, profile: any, done: (err: any, user?: any) => void) => {
          try {
            const email = profile.emails?.find((e: any) => e?.value)?.value ?? null;
            const user = await findOrCreateOAuthUser({
              provider: "github",
              providerId: String(profile.id),
              email,
              displayName: profile.displayName || profile.username || null,
              avatarUrl: profile.photos?.[0]?.value ?? null,
              usernameHint: profile.username ?? null,
            });
            done(null, user);
          } catch (err) {
            done(err);
          }
        },
      ),
    );
  }

  passport.serializeUser((user: Express.User, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      done(null, user);
    } catch (err) {
      done(err as Error);
    }
  });

  // ── Routes ────────────────────────────────────────────────────────────
  app.get("/api/auth/providers", (_req, res) => {
    res.json({
      google: googleConfigured,
      github: githubConfigured,
    });
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const result = registerInputSchema.safeParse(req.body);
      if (!result.success) {
        return res
          .status(400)
          .send("Invalid input: " + result.error.issues.map((i) => i.message).join(", "));
      }

      const { username, password, email, displayName } = result.data;

      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      if (existingUser) return res.status(400).send("Username already exists");

      const hashedPassword = await crypto.hash(password);
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          password: hashedPassword,
          email,
          displayName: displayName || username,
          avatarColor: pickColor(),
          status: "online",
          provider: "local",
        })
        .returning();

      req.login(newUser, (err) => {
        if (err) return next(err);
        res.json({ message: "Registration successful", user: newUser });
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return res
        .status(400)
        .send("Invalid input: " + result.error.issues.map((i) => i.message).join(", "));
    }

    passport.authenticate("local", async (err: any, user: Express.User, info: IVerifyOptions) => {
      if (err) return next(err);
      if (!user) return res.status(400).send(info?.message ?? "Login failed");

      await db.update(users).set({ status: "online" }).where(eq(users.id, user.id));

      req.logIn(user, (err) => {
        if (err) return next(err);
        res.json({ message: "Login successful", user });
      });
    })(req, res, next);
  });

  app.post("/api/logout", async (req, res) => {
    if (req.user) {
      await db.update(users).set({ status: "offline" }).where(eq(users.id, req.user.id));
    }
    req.logout((err) => {
      if (err) return res.status(500).send("Logout failed");
      res.json({ message: "Logout successful" });
    });
  });

  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) return res.json(req.user);
    res.status(401).send("Not logged in");
  });

  // Change password (local accounts only)
  const passwordChangeSchema = z.object({
    currentPassword: z.string().min(6),
    newPassword: z.string().min(6),
  });

  app.post("/api/me/password", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    const result = passwordChangeSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: "Password must be at least 6 characters" });

    const [user] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.password) {
      return res.status(400).json({
        message: "This account uses social sign-in. Set a password by re-registering with the same email.",
      });
    }

    const ok = await crypto.compare(result.data.currentPassword, user.password);
    if (!ok) return res.status(400).json({ message: "Current password is incorrect" });

    const next = await crypto.hash(result.data.newPassword);
    await db.update(users).set({ password: next }).where(eq(users.id, user.id));
    res.json({ ok: true });
  });

  // ── Password reset ───────────────────────────────────────────────────
  const forgotSchema = z.object({ email: z.string().email() });
  const resetSchema = z.object({
    token: z.string().min(20),
    password: z.string().min(6),
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    const parsed = forgotSchema.safeParse(req.body);
    // Always respond identically to avoid leaking which emails exist.
    const generic = {
      ok: true,
      message: "If that email is registered, a reset link is on its way.",
    };
    if (!parsed.success) return res.json(generic);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);
    if (!user || user.provider !== "local" || !user.password) {
      return res.json(generic);
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const link = `${base}/reset-password?token=${token}`;

    await sendMail({
      to: user.email,
      subject: "Reset your Lumen password",
      text: `Hi ${user.displayName || user.username},

Someone (hopefully you) asked to reset your Lumen password. To choose a new
password, click the link below within the next hour:

${link}

If you didn't request this, ignore this email — your password will stay the same.`,
    });

    res.json(generic);
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Token and new password (6+ chars) required" });
    }

    const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");

    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!row) {
      return res.status(400).json({ message: "Reset link is invalid or has expired" });
    }

    const hashed = await crypto.hash(parsed.data.password);
    await db.update(users).set({ password: hashed }).where(eq(users.id, row.userId));
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id));

    res.json({ ok: true });
  });

  // Delete own account
  app.delete("/api/me", async (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    const userId = req.user.id;
    try {
      // Cascade: rely on the deletion endpoint in routes.ts patterns by issuing
      // direct deletes here. Foreign keys to users have no cascade configured,
      // so we wipe dependents first.
      await db.execute(sql`delete from notifications where user_id = ${userId} or actor_id = ${userId}`);
      await db.execute(sql`delete from video_likes where user_id = ${userId}`);
      await db.execute(sql`delete from video_comments where user_id = ${userId}`);
      await db.execute(sql`delete from video_saves where user_id = ${userId}`);
      await db.execute(sql`delete from watch_history where user_id = ${userId}`);
      await db.execute(sql`delete from follows where follower_id = ${userId} or following_id = ${userId}`);
      await db.execute(
        sql`delete from video_likes where video_id in (select id from videos where user_id = ${userId})`,
      );
      await db.execute(
        sql`delete from video_comments where video_id in (select id from videos where user_id = ${userId})`,
      );
      await db.execute(
        sql`delete from video_saves where video_id in (select id from videos where user_id = ${userId})`,
      );
      await db.execute(
        sql`delete from watch_history where video_id in (select id from videos where user_id = ${userId})`,
      );
      await db.execute(
        sql`delete from notifications where video_id in (select id from videos where user_id = ${userId})`,
      );
      await db.execute(sql`delete from videos where user_id = ${userId}`);
      await db.execute(sql`delete from broadcasts where host_id = ${userId}`);
      await db.execute(sql`delete from users where id = ${userId}`);

      req.logout((err) => {
        if (err) return next(err);
        res.json({ ok: true });
      });
    } catch (err) {
      next(err);
    }
  });

  // OAuth flow routes — only mounted when their strategies are configured.
  if (googleConfigured) {
    app.get(
      "/api/auth/google",
      passport.authenticate("google", { scope: ["profile", "email"] }),
    );
    app.get(
      "/api/auth/google/callback",
      passport.authenticate("google", {
        failureRedirect: "/?authError=google",
        successRedirect: "/",
      }),
    );
  }
  if (githubConfigured) {
    app.get(
      "/api/auth/github",
      passport.authenticate("github", { scope: ["user:email"] }),
    );
    app.get(
      "/api/auth/github/callback",
      passport.authenticate("github", {
        failureRedirect: "/?authError=github",
        successRedirect: "/",
      }),
    );
  }
}
