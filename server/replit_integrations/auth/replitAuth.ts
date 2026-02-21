import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import crypto from "crypto";
import os from "os";
import { authStorage } from "./storage";

const STANDALONE_USER_ID = "local-admin";
const STANDALONE_USER_EMAIL = "admin@localhost";

export function isStandaloneMode(): boolean {
  return !process.env.REPL_ID;
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  const sessionSecret = isStandaloneMode()
    ? (process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"))
    : process.env.SESSION_SECRET!;
  return session({
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: !isStandaloneMode(),
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await authStorage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

async function ensureLocalAdmin() {
  try {
    const hostname = os.hostname();
    await authStorage.upsertUser({
      id: STANDALONE_USER_ID,
      email: STANDALONE_USER_EMAIL,
      firstName: hostname,
      lastName: "Operator",
      profileImageUrl: null,
    });
    console.log(`[auth] Standalone mode: local admin user ready (${hostname} Operator)`);
  } catch (error) {
    console.error("[auth] Failed to create local admin user:", error);
  }
}

async function setupStandaloneAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  await ensureLocalAdmin();

  app.use((req: any, _res, next) => {
    if (!req.user) {
      req.user = {
        claims: {
          sub: STANDALONE_USER_ID,
          email: STANDALONE_USER_EMAIL,
          exp: Math.floor(Date.now() / 1000) + 86400 * 365,
        },
        expires_at: Math.floor(Date.now() / 1000) + 86400 * 365,
      };
      req.isAuthenticated = () => true;
    }
    next();
  });

  app.get("/api/login", (_req, res) => {
    res.redirect("/");
  });

  app.get("/api/callback", (_req, res) => {
    res.redirect("/");
  });

  app.get("/api/logout", (_req, res) => {
    res.redirect("/");
  });

  console.log("[auth] Running in standalone mode - no login required");
}

async function setupReplitAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  const registeredStrategies = new Set<string>();

  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export async function setupAuth(app: Express) {
  if (isStandaloneMode()) {
    await setupStandaloneAuth(app);
  } else {
    await setupReplitAuth(app);
  }
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (isStandaloneMode()) {
    const reqAny = req as any;
    if (!reqAny.user) {
      reqAny.user = {
        claims: {
          sub: STANDALONE_USER_ID,
          email: STANDALONE_USER_EMAIL,
          exp: Math.floor(Date.now() / 1000) + 86400 * 365,
        },
        expires_at: Math.floor(Date.now() / 1000) + 86400 * 365,
      };
      reqAny.isAuthenticated = () => true;
    }
    return next();
  }

  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
