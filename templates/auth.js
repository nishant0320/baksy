// Auth template generators for baksy scaffolding
// Handles: email/password, JWT refresh, TOTP 2FA (speakeasy), passwordless
// magic-link, OAuth (Google / GitHub) — both monolith and microservice layouts.

// ─── Relative-path map ───────────────────────────────────────────────────────
function rp(style) {
  const m = style === "monolith";
  return {
    // From service file
    jwtInSvc:    m ? "../../utils/jwt.js"                        : "../utils/jwt.js",
    loggerInSvc: m ? "../../utils/logger.js"                     : "../utils/logger.js",
    repoInSvc:   m ? "./auth.repository.js"                      : "../repositories/auth.repository.js",
    // From repository file
    modelInRepo: m ? "./user.model.js"                           : "../models/user.model.js",
    prismaInRepo: m ? "../../config/db.js"                       : "../config/db.js",
    // From controller file
    svcInCtrl:   m ? "./auth.service.js"                         : "../services/auth.service.js",
    loggerInCtrl: m ? "../../utils/logger.js"                    : "../utils/logger.js",
    // From routes file
    ctrlInRoutes: m ? "./auth.controller.js"                     : "../controllers/auth.controller.js",
    mwInRoutes:   m ? "../../middlewares/auth.middleware.js"      : "../middlewares/auth.middleware.js",
    passportInRoutes: m ? "../../config/passport.js"             : "../config/passport.js",
    svcInRoutes:  m ? "./auth.service.js"                        : "../services/auth.service.js",
    // From middleware file
    jwtInMw:     m ? "../utils/jwt.js"                           : "../utils/jwt.js",
    loggerInMw:  m ? "../utils/logger.js"                        : "../utils/logger.js",
    repoInMw:    m ? "../modules/auth/auth.repository.js"        : "../repositories/auth.repository.js",
    // From passport config
    repoInPass:  m ? "../modules/auth/auth.repository.js"        : "../repositories/auth.repository.js",
    svcInPass:   m ? "../modules/auth/auth.service.js"           : "../services/auth.service.js",
    // Routes mount path in app.js
    routesInApp:  m ? "./modules/auth/auth.routes.js"            : "./routes/auth.routes.js",
  };
}

// ─── 1. Mongoose User Model ───────────────────────────────────────────────────
export function generateUserModel({ authMethods }) {
  const hasEmail   = authMethods.includes("email");
  const hasTotp    = authMethods.includes("totp");
  const hasPassless = authMethods.includes("passless");
  const hasGoogle  = authMethods.includes("oauth-google");
  const hasGithub  = authMethods.includes("oauth-github");

  return `import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: { type: String, trim: true },
${hasEmail  ? "    password: { type: String, select: false },\n" : ""}\
${hasGoogle ? "    googleId: { type: String, sparse: true },\n"  : ""}\
${hasGithub ? "    githubId: { type: String, sparse: true },\n"  : ""}\
${hasTotp   ? "    totpSecret:  { type: String, select: false },\n    totpEnabled: { type: Boolean, default: false },\n" : ""}\
${hasPassless ? "    magicToken:       { type: String, select: false },\n    magicTokenExpiry: { type: Date },\n" : ""}\
    refreshTokens: [{ type: String, select: false }],
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
);
${hasEmail ? `
userSchema.pre('save', async function (next) {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});

userSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};
` : ""}
const User = mongoose.model('User', userSchema);
export default User;
`;
}

// ─── 2. Prisma Schema ─────────────────────────────────────────────────────────
export function generatePrismaSchema({ authMethods }) {
  const hasEmail    = authMethods.includes("email");
  const hasTotp     = authMethods.includes("totp");
  const hasPassless = authMethods.includes("passless");
  const hasGoogle   = authMethods.includes("oauth-google");
  const hasGithub   = authMethods.includes("oauth-github");

  return `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
${hasEmail    ? "  password  String?\n"                                                               : ""}\
${hasGoogle   ? "  googleId  String? @unique\n"                                                       : ""}\
${hasGithub   ? "  githubId  String? @unique\n"                                                       : ""}\
${hasTotp     ? "  totpSecret  String?\n  totpEnabled Boolean @default(false)\n"                      : ""}\
${hasPassless ? "  magicToken       String?\n  magicTokenExpiry DateTime?\n"                          : ""}\
  refreshTokens String[]
  isVerified    Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
`;
}

// ─── 3. Auth Repository ───────────────────────────────────────────────────────
export function generateAuthRepository({ database, authMethods, archStyle }) {
  const hasTotp     = authMethods.includes("totp");
  const hasPassless = authMethods.includes("passless");
  const hasGoogle   = authMethods.includes("oauth-google");
  const hasGithub   = authMethods.includes("oauth-github");
  const p           = rp(archStyle);
  const isMongo     = database !== "postgres";

  if (isMongo) {
    return `import User from '${p.modelInRepo}';

const authRepository = {
  async findByEmail(email) {
    return User.findOne({ email });
  },

  async findByEmailWithPassword(email) {
    return User.findOne({ email }).select('+password +refreshTokens');
  },

  async findById(id) {
    return User.findById(id);
  },

  async create(data) {
    return User.create(data);
  },

  async updateById(id, update) {
    return User.findByIdAndUpdate(id, update, { new: true });
  },

  // ── Refresh tokens ──────────────────────────────────────────────────────
  async addRefreshToken(id, token) {
    return User.findByIdAndUpdate(id, { $push: { refreshTokens: token } });
  },

  async removeRefreshToken(id, token) {
    return User.findByIdAndUpdate(id, { $pull: { refreshTokens: token } });
  },

  async findByRefreshToken(token) {
    return User.findOne({ refreshTokens: token }).select('+refreshTokens');
  },
${hasPassless ? `
  // ── Magic-link (passless) ────────────────────────────────────────────────
  async setMagicToken(id, token, expiry) {
    return User.findByIdAndUpdate(id, { magicToken: token, magicTokenExpiry: expiry });
  },

  async findByMagicToken(token) {
    return User.findOne({
      magicToken: token,
      magicTokenExpiry: { $gt: new Date() },
    }).select('+magicToken');
  },

  async clearMagicToken(id) {
    return User.findByIdAndUpdate(id, { magicToken: null, magicTokenExpiry: null });
  },
` : ""}\
${hasTotp ? `
  // ── TOTP / 2FA ───────────────────────────────────────────────────────────
  async setTotpSecret(id, secret) {
    return User.findByIdAndUpdate(id, { totpSecret: secret }).select('+totpSecret');
  },

  async findByIdWithTotp(id) {
    return User.findById(id).select('+totpSecret');
  },

  async enableTotp(id) {
    return User.findByIdAndUpdate(id, { totpEnabled: true });
  },

  async disableTotp(id) {
    return User.findByIdAndUpdate(id, { totpEnabled: false, totpSecret: null });
  },
` : ""}\
${hasGoogle ? `
  // ── Google OAuth ─────────────────────────────────────────────────────────
  async findByGoogleId(googleId) {
    return User.findOne({ googleId });
  },

  async upsertGoogleUser({ googleId, email, name }) {
    return User.findOneAndUpdate(
      { $or: [{ googleId }, { email }] },
      { $set: { googleId, name } },
      { upsert: true, new: true },
    );
  },
` : ""}\
${hasGithub ? `
  // ── GitHub OAuth ─────────────────────────────────────────────────────────
  async findByGithubId(githubId) {
    return User.findOne({ githubId });
  },

  async upsertGithubUser({ githubId, email, name }) {
    return User.findOneAndUpdate(
      { $or: [{ githubId }, { email }] },
      { $set: { githubId, name } },
      { upsert: true, new: true },
    );
  },
` : ""}\
};

export default authRepository;
`;
  }

  // ── Prisma variant ──────────────────────────────────────────────────────────
  return `import prisma from '${p.prismaInRepo}';

const authRepository = {
  async findByEmail(email) {
    return prisma.user.findUnique({ where: { email } });
  },

  async findByEmailWithPassword(email) {
    return prisma.user.findUnique({ where: { email } });
  },

  async findById(id) {
    return prisma.user.findUnique({ where: { id } });
  },

  async create(data) {
    return prisma.user.create({ data });
  },

  async updateById(id, data) {
    return prisma.user.update({ where: { id }, data });
  },

  // ── Refresh tokens ──────────────────────────────────────────────────────
  async addRefreshToken(id, token) {
    const user = await prisma.user.findUnique({ where: { id } });
    return prisma.user.update({
      where: { id },
      data: { refreshTokens: [...(user.refreshTokens || []), token] },
    });
  },

  async removeRefreshToken(id, token) {
    const user = await prisma.user.findUnique({ where: { id } });
    return prisma.user.update({
      where: { id },
      data: { refreshTokens: (user.refreshTokens || []).filter((t) => t !== token) },
    });
  },

  async findByRefreshToken(token) {
    return prisma.user.findFirst({ where: { refreshTokens: { has: token } } });
  },
${hasPassless ? `
  async setMagicToken(id, token, expiry) {
    return prisma.user.update({ where: { id }, data: { magicToken: token, magicTokenExpiry: expiry } });
  },

  async findByMagicToken(token) {
    return prisma.user.findFirst({
      where: { magicToken: token, magicTokenExpiry: { gt: new Date() } },
    });
  },

  async clearMagicToken(id) {
    return prisma.user.update({ where: { id }, data: { magicToken: null, magicTokenExpiry: null } });
  },
` : ""}\
${hasTotp ? `
  async setTotpSecret(id, secret) {
    return prisma.user.update({ where: { id }, data: { totpSecret: secret } });
  },

  async findByIdWithTotp(id) {
    return prisma.user.findUnique({ where: { id } });
  },

  async enableTotp(id) {
    return prisma.user.update({ where: { id }, data: { totpEnabled: true } });
  },

  async disableTotp(id) {
    return prisma.user.update({ where: { id }, data: { totpEnabled: false, totpSecret: null } });
  },
` : ""}\
${hasGoogle ? `
  async findByGoogleId(googleId) {
    return prisma.user.findFirst({ where: { googleId } });
  },

  async upsertGoogleUser({ googleId, email, name }) {
    return prisma.user.upsert({
      where: { email },
      update: { googleId, name },
      create: { email, googleId, name, isVerified: true },
    });
  },
` : ""}\
${hasGithub ? `
  async findByGithubId(githubId) {
    return prisma.user.findFirst({ where: { githubId } });
  },

  async upsertGithubUser({ githubId, email, name }) {
    return prisma.user.upsert({
      where: { email },
      update: { githubId, name },
      create: { email, githubId, name, isVerified: true },
    });
  },
` : ""}\
};

export default authRepository;
`;
}

// ─── 4. Auth Service ──────────────────────────────────────────────────────────
export function generateAuthService({ database, authMethods, archStyle, queue }) {
  const hasEmail    = authMethods.includes("email");
  const hasTotp     = authMethods.includes("totp");
  const hasPassless = authMethods.includes("passless");
  const hasGoogle   = authMethods.includes("oauth-google");
  const hasGithub   = authMethods.includes("oauth-github");
  const hasOAuth    = hasGoogle || hasGithub;
  const p           = rp(archStyle);
  const isMongo     = database !== "postgres";

  const totpImports  = hasTotp     ? "import speakeasy from 'speakeasy';\nimport QRCode from 'qrcode';\n" : "";
  const cryptoImport = hasPassless ? "import crypto from 'crypto';\n" : "";
  const bcryptImport = (hasEmail && !isMongo) ? "import bcrypt from 'bcryptjs';\n" : "";
  // Nodemailer for passless (may already be present if queue=bullmq)
  const mailerImport = hasPassless
    ? "import nodemailer from 'nodemailer';\n"
    : "";

  return `import jwt from 'jsonwebtoken';
${bcryptImport}\
${totpImports}\
${cryptoImport}\
${mailerImport}\
import authRepository from '${p.repoInSvc}';
import logger from '${p.loggerInSvc}';

const ACCESS_KEY  = process.env.ACCESS_KEY;
const REFRESH_KEY = process.env.REFRESH_KEY;

function signAccess(payload) {
  return jwt.sign(payload, ACCESS_KEY, { expiresIn: '15m' });
}
function signRefresh(payload) {
  return jwt.sign(payload, REFRESH_KEY, { expiresIn: '7d' });
}
function signTemp(payload) {
  return jwt.sign({ ...payload, _partial: true }, ACCESS_KEY, { expiresIn: '5m' });
}
function issueTokens(user) {
  const p = { id: user.id || user._id, email: user.email };
  return { accessToken: signAccess(p), refreshToken: signRefresh(p) };
}
${hasEmail ? `
// ── Email / Password ──────────────────────────────────────────────────────────
export async function register({ email, password, name }) {
  const existing = await authRepository.findByEmail(email);
  if (existing) throw Object.assign(new Error('Email already registered'), { status: 409 });
${isMongo
    ? "  return authRepository.create({ email, password, name });"
    : `  const hashed = await bcrypt.hash(password, 12);
  return authRepository.create({ email, password: hashed, name });`}
}

export async function login({ email, password }) {
  const user = await authRepository.findByEmailWithPassword(email);
  if (!user) throw Object.assign(new Error('Invalid credentials'), { status: 401 });

${isMongo
    ? `  const valid = await user.comparePassword(password);`
    : `  const valid = user.password && await bcrypt.compare(password, user.password);`}
  if (!valid) throw Object.assign(new Error('Invalid credentials'), { status: 401 });

${hasTotp ? `  if (user.totpEnabled) {
    const tempToken = signTemp({ id: user.id || user._id, email: user.email });
    return { requiresTotp: true, tempToken };
  }
` : ""}\
  const tokens = issueTokens(user);
  await authRepository.addRefreshToken(user.id || user._id, tokens.refreshToken);
  return { user: { id: user.id || user._id, email: user.email, name: user.name }, ...tokens };
}
` : ""}\

// ── Logout / Refresh ──────────────────────────────────────────────────────────
export async function logout(userId, refreshToken) {
  await authRepository.removeRefreshToken(userId, refreshToken);
}

export async function refreshTokens(token) {
  let payload;
  try {
    payload = jwt.verify(token, REFRESH_KEY);
  } catch {
    throw Object.assign(new Error('Invalid refresh token'), { status: 401 });
  }
  const user = await authRepository.findByRefreshToken(token);
  if (!user) throw Object.assign(new Error('Session not found'), { status: 401 });
  await authRepository.removeRefreshToken(user.id || user._id, token);
  const tokens = issueTokens(user);
  await authRepository.addRefreshToken(user.id || user._id, tokens.refreshToken);
  return tokens;
}
${hasTotp ? `
// ── TOTP / 2FA (speakeasy) ────────────────────────────────────────────────────
export async function setupTotp(userId) {
  const user = await authRepository.findById(userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  const secret = speakeasy.generateSecret({
    name: 'MyApp (' + user.email + ')',
    length: 20,
  });
  await authRepository.setTotpSecret(userId, secret.base32);
  const qrCode = await QRCode.toDataURL(secret.otpauth_url);
  return { secret: secret.base32, qrCode };
}

export async function enableTotp(userId, token) {
  const user = await authRepository.findByIdWithTotp(userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  const valid = speakeasy.totp.verify({
    secret: user.totpSecret,
    encoding: 'base32',
    token,
    window: 1,
  });
  if (!valid) throw Object.assign(new Error('Invalid TOTP token'), { status: 400 });
  await authRepository.enableTotp(userId);
  return { enabled: true };
}

export async function loginWithTotp(tempToken, totpToken) {
  let payload;
  try {
    payload = jwt.verify(tempToken, ACCESS_KEY);
  } catch {
    throw Object.assign(new Error('Invalid or expired session'), { status: 401 });
  }
  if (!payload._partial) throw Object.assign(new Error('Not a partial token'), { status: 400 });

  const user = await authRepository.findByIdWithTotp(payload.id);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const valid = speakeasy.totp.verify({
    secret: user.totpSecret,
    encoding: 'base32',
    token: totpToken,
    window: 1,
  });
  if (!valid) throw Object.assign(new Error('Invalid TOTP token'), { status: 400 });

  const tokens = issueTokens(user);
  await authRepository.addRefreshToken(user.id || user._id, tokens.refreshToken);
  return { user: { id: user.id || user._id, email: user.email, name: user.name }, ...tokens };
}

export async function disableTotp(userId, token) {
  const user = await authRepository.findByIdWithTotp(userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  const valid = speakeasy.totp.verify({
    secret: user.totpSecret,
    encoding: 'base32',
    token,
    window: 1,
  });
  if (!valid) throw Object.assign(new Error('Invalid TOTP token'), { status: 400 });
  await authRepository.disableTotp(userId);
  return { disabled: true };
}
` : ""}\
${hasPassless ? `
// ── Passwordless magic-link ───────────────────────────────────────────────────
const mailer = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT) || 587,
  secure: false,
  auth: { user: process.env.MAIL_FROM, pass: process.env.MAIL_PASS },
});

export async function requestMagicLink(email) {
  let user = await authRepository.findByEmail(email);
  if (!user) user = await authRepository.create({ email });

  const token  = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min
  await authRepository.setMagicToken(user.id || user._id, token, expiry);

  const link = \`\${process.env.FRONTEND_URL || 'http://localhost:4000'}/auth/passless/verify?token=\${token}\`;

  await mailer.sendMail({
    from: 'App <' + process.env.MAIL_FROM + '>',
    to: email,
    subject: 'Your sign-in link',
    html: '<p>Click <a href="' + link + '">here</a> to sign in. Valid for 15 minutes.</p>',
  });

  logger.info('Magic link sent to ' + email);
  return { message: 'Magic link sent. Check your email.' };
}

export async function verifyMagicLink(token) {
  const user = await authRepository.findByMagicToken(token);
  if (!user) throw Object.assign(new Error('Invalid or expired magic link'), { status: 400 });

  await authRepository.clearMagicToken(user.id || user._id);
  await authRepository.updateById(user.id || user._id, { isVerified: true });

  const tokens = issueTokens(user);
  await authRepository.addRefreshToken(user.id || user._id, tokens.refreshToken);
  return { user: { id: user.id || user._id, email: user.email, name: user.name }, ...tokens };
}
` : ""}\
${hasOAuth ? `
// ── OAuth handler (called from Passport callbacks) ────────────────────────────
export async function handleOAuthCallback(user) {
  const tokens = issueTokens(user);
  await authRepository.addRefreshToken(user.id || user._id, tokens.refreshToken);
  return { user: { id: user.id || user._id, email: user.email, name: user.name }, ...tokens };
}
` : ""}\
`;
}

// ─── 5. Auth Controller ───────────────────────────────────────────────────────
export function generateAuthController({ authMethods, archStyle }) {
  const hasEmail    = authMethods.includes("email");
  const hasTotp     = authMethods.includes("totp");
  const hasPassless = authMethods.includes("passless");
  const p           = rp(archStyle);

  return `import * as authService from '${p.svcInCtrl}';
import logger from '${p.loggerInCtrl}';

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}
function fail(res, err) {
  const status = err.status || 500;
  logger.error('Auth error: ' + err.message);
  res.status(status).json({ success: false, message: err.message });
}
${hasEmail ? `
export async function register(req, res) {
  try {
    const user = await authService.register(req.body);
    ok(res, { id: user.id || user._id, email: user.email }, 201);
  } catch (err) { fail(res, err); }
}

export async function login(req, res) {
  try {
    const result = await authService.login(req.body);
    ok(res, result);
  } catch (err) { fail(res, err); }
}
` : ""}\

export async function logout(req, res) {
  try {
    const token = req.body.refreshToken;
    await authService.logout(req.user.id, token);
    ok(res, { message: 'Logged out' });
  } catch (err) { fail(res, err); }
}

export async function refresh(req, res) {
  try {
    const tokens = await authService.refreshTokens(req.body.refreshToken);
    ok(res, tokens);
  } catch (err) { fail(res, err); }
}

export async function me(req, res) {
  ok(res, req.user);
}
${hasTotp ? `
// ── TOTP ──────────────────────────────────────────────────────────────────────
export async function totpSetup(req, res) {
  try {
    const result = await authService.setupTotp(req.user.id);
    ok(res, result);
  } catch (err) { fail(res, err); }
}

export async function totpEnable(req, res) {
  try {
    const result = await authService.enableTotp(req.user.id, req.body.token);
    ok(res, result);
  } catch (err) { fail(res, err); }
}

export async function totpLogin(req, res) {
  try {
    const result = await authService.loginWithTotp(req.body.tempToken, req.body.token);
    ok(res, result);
  } catch (err) { fail(res, err); }
}

export async function totpDisable(req, res) {
  try {
    const result = await authService.disableTotp(req.user.id, req.body.token);
    ok(res, result);
  } catch (err) { fail(res, err); }
}
` : ""}\
${hasPassless ? `
// ── Passless ──────────────────────────────────────────────────────────────────
export async function passlessRequest(req, res) {
  try {
    const result = await authService.requestMagicLink(req.body.email);
    ok(res, result);
  } catch (err) { fail(res, err); }
}

export async function passlessVerify(req, res) {
  try {
    const result = await authService.verifyMagicLink(req.query.token);
    ok(res, result);
  } catch (err) { fail(res, err); }
}
` : ""}\
`;
}

// ─── 6. Auth Routes ───────────────────────────────────────────────────────────
export function generateAuthRoutes({ authMethods, archStyle }) {
  const hasEmail    = authMethods.includes("email");
  const hasTotp     = authMethods.includes("totp");
  const hasPassless = authMethods.includes("passless");
  const hasGoogle   = authMethods.includes("oauth-google");
  const hasGithub   = authMethods.includes("oauth-github");
  const hasOAuth    = hasGoogle || hasGithub;
  const p           = rp(archStyle);

  const passportImport = hasOAuth
    ? "import passport from 'passport';\nimport '" + p.passportInRoutes + "';\n"
    : "";

  return `import { Router } from 'express';
${passportImport}\
import * as ctrl from '${p.ctrlInRoutes}';
import { protect } from '${p.mwInRoutes}';

const router = Router();

// ── Health ────────────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ ok: true }));
${hasEmail ? `
// ── Email / Password ──────────────────────────────────────────────────────────
router.post('/register', ctrl.register);
router.post('/login',    ctrl.login);
` : ""}\

// ── Session management ────────────────────────────────────────────────────────
router.post('/logout',  protect, ctrl.logout);
router.post('/refresh', ctrl.refresh);
router.get('/me',       protect, ctrl.me);
${hasTotp ? `
// ── TOTP / 2FA ────────────────────────────────────────────────────────────────
router.post('/2fa/setup',   protect, ctrl.totpSetup);
router.post('/2fa/enable',  protect, ctrl.totpEnable);
router.post('/2fa/login',   ctrl.totpLogin);
router.post('/2fa/disable', protect, ctrl.totpDisable);
` : ""}\
${hasPassless ? `
// ── Passwordless magic-link ───────────────────────────────────────────────────
router.post('/passless/request', ctrl.passlessRequest);
router.get('/passless/verify',   ctrl.passlessVerify);
` : ""}\
${hasGoogle ? `
// ── Google OAuth ──────────────────────────────────────────────────────────────
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false }),
);
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/failed' }),
  (req, res) => {
    const { accessToken, refreshToken } = req.user;
    res.redirect(
      (process.env.FRONTEND_URL || 'http://localhost:5173') +
        '/auth/callback?access=' + accessToken + '&refresh=' + refreshToken,
    );
  },
);
` : ""}\
${hasGithub ? `
// ── GitHub OAuth ──────────────────────────────────────────────────────────────
router.get('/github',
  passport.authenticate('github', { scope: ['user:email'], session: false }),
);
router.get('/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: '/auth/failed' }),
  (req, res) => {
    const { accessToken, refreshToken } = req.user;
    res.redirect(
      (process.env.FRONTEND_URL || 'http://localhost:5173') +
        '/auth/callback?access=' + accessToken + '&refresh=' + refreshToken,
    );
  },
);
` : ""}\
${hasOAuth ? `
router.get('/failed', (_req, res) =>
  res.status(401).json({ success: false, message: 'OAuth authentication failed' }),
);
` : ""}\

export default router;
`;
}

// ─── 7. Auth Middleware ───────────────────────────────────────────────────────
export function generateAuthMiddleware({ archStyle }) {
  const p = rp(archStyle);
  return `import jwt from 'jsonwebtoken';
import authRepository from '${p.repoInMw}';
import logger from '${p.loggerInMw}';

const ACCESS_KEY = process.env.ACCESS_KEY;

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export function protect(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

  try {
    const payload = jwt.verify(token, ACCESS_KEY);
    if (payload._partial) {
      return res.status(401).json({ success: false, message: 'Partial auth — complete 2FA first' });
    }
    req.user = { id: payload.id, email: payload.email };
    next();
  } catch (err) {
    logger.warn('JWT error: ' + err.message);
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

export function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, ACCESS_KEY);
    if (!payload._partial) req.user = { id: payload.id, email: payload.email };
  } catch { /* ignore */ }
  next();
}
`;
}

// ─── 8. Passport Config ───────────────────────────────────────────────────────
export function generatePassportConfig({ authMethods, archStyle }) {
  const hasGoogle = authMethods.includes("oauth-google");
  const hasGithub = authMethods.includes("oauth-github");
  const p = rp(archStyle);

  return `import passport from 'passport';
${hasGoogle ? "import { Strategy as GoogleStrategy } from 'passport-google-oauth20';\n" : ""}\
${hasGithub ? "import { Strategy as GitHubStrategy } from 'passport-github2';\n" : ""}\
import authRepository from '${p.repoInPass}';
import { handleOAuthCallback } from '${p.svcInPass}';
${hasGoogle ? `
passport.use(
  new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error('No email from Google'), null);
        const user = await authRepository.upsertGoogleUser({
          googleId: profile.id,
          email,
          name: profile.displayName,
        });
        const tokens = await handleOAuthCallback(user);
        done(null, tokens);
      } catch (err) {
        done(err, null);
      }
    },
  ),
);
` : ""}\
${hasGithub ? `
passport.use(
  new GitHubStrategy(
    {
      clientID:     process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL:  process.env.GITHUB_CALLBACK_URL || '/api/auth/github/callback',
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(
            new Error(
              'No email returned from GitHub. Ask the user to make their email public or grant email scope.',
            ),
            null,
          );
        }
        const user = await authRepository.upsertGithubUser({
          githubId: profile.id,
          email,
          name: profile.displayName || profile.username,
        });
        const tokens = await handleOAuthCallback(user);
        done(null, tokens);
      } catch (err) {
        done(err, null);
      }
    },
  ),
);
` : ""}\

export default passport;
`;
}

// ─── 9. Express App with Auth routes ─────────────────────────────────────────
export function generateAppWithAuth({ authMethods, archStyle }) {
  const hasOAuth = authMethods.includes("oauth-google") || authMethods.includes("oauth-github");
  const p = rp(archStyle);

  return `import express from 'express';
import cors from 'cors';
${hasOAuth ? "import passport from 'passport';\n" : ""}\
import authRouter from '${p.routesInApp}';

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_PROD,
  process.env.FRONTEND_URL_DEV,
  'http://localhost:5173',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error('CORS blocked'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
${hasOAuth ? "app.use(passport.initialize());\n" : ""}\

// Routes
app.use('/api/auth', authRouter);

// Health check
app.get('/', (_req, res) => res.json({ msg: 'API running' }));

// Error handler
app.use((err, _req, res, _next) => {
  res.status(500).json({ error: err.message });
});

export default app;
`;
}
