// Example code snippets for generated microservice boilerplate

export const utils = {
  time: `import handler from './handler.js';

let time = (amt, unit) =>
  handler(() => {
    const base = {
      ms: 1,
      s: 1000,
      sec: 1000,
      m: 1000 * 60,
      min: 1000 * 60,
      h: 1000 * 60 * 60,
      hr: 1000 * 60 * 60,
      d: 1000 * 60 * 60 * 24,
      day: 1000 * 60 * 60 * 24,
    };
    if (!base[unit]) throw new Error('Invalid unit: ' + unit);
    return +amt * base[unit.toLowerCase()];
  });

export default time;`,
  redisKeyGen: `export default function redisKeyGen(app, service, id, purpose) {
  const parts = [app || 'serviceName', service];
  if (id?.length) parts.push(id);
  if (purpose?.length) parts.push(purpose);
  return parts.join(':');
}
`,
  qr: `import QRCode from 'qrcode';

export const generate = async (text) => {
  try {
    const qrImage = await QRCode.toDataURL(text);
    return qrImage;
  } catch (err) {
    throw new Error('Failed to generate QR code: ' + err.message);
  }
};

export const render = function(qrDataUrl, size = 300) {
  return '<img src="' + qrDataUrl + '" alt="QR Code" style="width: ' + size + 'px; height: ' + size + 'px;" />';
};

export default { generate, render };
`,
  handler: `let handler =
  (func) =>
  (...args) =>
    Promise.resolve(func(...args)).catch((err) => {
      console.error('Handler Error:', err);
      throw err;
    });

export default handler;
`,
  jwt: `import jwt from 'jsonwebtoken';

let accessKey = process.env.ACCESS_KEY;
let refreshKey = process.env.REFRESH_KEY;

if (!accessKey || !refreshKey) {
  throw new Error('JWT secrets are missing from environment variables.');
}

export function accessToken(payload) {
  return jwt.sign(payload, accessKey, { expiresIn: '7d' });
}
export function refreshToken(payload) {
  return jwt.sign(payload, refreshKey, { expiresIn: '15d' });
}

export function tokens(payload) {
  return {
    accessToken: accessToken(payload),
    refreshToken: refreshToken(payload),
  };
}

export function verifyAccess(token) {
  return jwt.verify(token, accessKey);
}
export function verifyRefresh(token) {
  return jwt.verify(token, refreshKey);
}
`,
  logger: `import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => info.timestamp + ' ' + info.level + ': ' + info.message),
);

const transports = [new winston.transports.Console()];

if (process.env.MODE === 'production') {
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, '../../../logs/error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  levels,
  format,
  transports,
});

export default logger;
`,
};

export const server = {
  basicExpress: `import express from 'express';
import cors from 'cors';

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_PROD,
  process.env.FRONTEND_URL_DEV,
  'http://localhost:5173',
  'https://scafeakasahu.vercel.app',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        /^https?:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(origin)
      )
        return cb(null, true);
      cb(new Error('CORS blocked'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-authenticated'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Example root route
app.get('/', (req, res) => {
  res.json({ msg: 'Hello from service' });
});

// Error handler
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message });
});

export default app;
`,
  entry: `import './config/env.js';
import app from './config/app.js';

const port = process.env.PORT || 4000;
app.listen(port, '0.0.0.0', () => {
  console.log('Service running on port ' + port);
});
`,
};

export const mail = {
  mailTemplates: `// Modular mail templates (pure functions, no framework)
const mailTemplates = {
  otp: ({ name, otp }) => (
    '<div style="font-family: Arial; padding: 24px; color:#333;">' +
      '<h2 style="color:#4b5dff; margin-bottom: 12px;">One-Time Password (OTP)</h2>' +
      '<p style="margin: 6px 0;">Hi ' + (name || 'there') + ',</p>' +
      '<p style="margin: 6px 0;">Use the verification code below to complete your sign-in or security action:</p>' +
      '<div style="font-size: 34px; font-weight: bold; margin: 24px 0; letter-spacing: 4px; text-align:center; background:#f1f3ff; padding: 12px 20px; border-radius: 8px; color:#4b5dff;">' + otp + '</div>' +
      '<p style="margin: 6px 0;">This OTP is valid for <strong>10 minutes</strong>. Please do not share this code with anyone.</p>' +
      '<p style="margin: 12px 0; color:#666; font-size: 13px;">If you did not request this, you can safely ignore this email.</p>' +
    '</div>'
  ),
  welcome: ({ name }) => (
    '<div style="font-family: Arial; padding: 24px; color:#333;">' +
      '<h2 style="color:#4b5dff; margin-bottom: 12px;">Welcome to the Platform, ' + (name || 'User') + '!</h2>' +
      "<p style=\"margin: 6px 0;\">We're excited to have you here. Your account has been successfully created and you're ready to explore everything we offer.</p>" +
      '<a href="https://scafe-sahu.verel.app/dashboard" style="display:inline-block; margin-top: 18px; padding: 12px 20px; background:#4b5dff; color:#fff; text-decoration:none; border-radius:8px; font-weight:600;">Go to Dashboard</a>' +
      '<p style="margin-top: 20px;">Cheers,<br/>The Team, Scafe</p>' +
    '</div>'
  ),
  passwordChanged: ({ name, time }) => (
    '<div style="font-family: Arial; padding: 24px; color:#333;">' +
      '<h2 style="color:#ff4757; margin-bottom: 12px;">Your Password Was Updated</h2>' +
      '<p style="margin: 6px 0;">Hi ' + (name || 'User') + ',</p>' +
      '<p style="margin: 6px 0;">This is a confirmation that your password was changed ' + (time ? 'on <strong>' + time + '</strong>' : 'recently') + '.</p>' +
      '<a href="https://scafe-sahu.vercel.app/reset-password" style="display:inline-block; margin-top: 18px; padding: 12px 20px; background:#ff4757; color:#fff; text-decoration:none; border-radius:8px; font-weight:600;">Reset Password</a>' +
      '<p style="margin-top: 20px; color:#666; font-size: 13px;">For further assistance, contact support.</p>' +
    '</div>'
  ),
  generic: ({ title, message, actionLabel, actionUrl }) => (
    '<div style="font-family: Arial; padding: 24px; color:#333;">' +
      '<h2 style="color:#4b5dff; margin-bottom: 12px;">' + title + '</h2>' +
      '<p style="margin: 8px 0;">' + message + '</p>' +
      (actionLabel && actionUrl ? '<a href="' + actionUrl + '" style="display:inline-block; margin-top: 18px; padding: 12px 20px; background:#4b5dff; color:#fff; text-decoration:none; border-radius:8px; font-weight:600;">' + actionLabel + '</a>' : '') +
    '</div>'
  ),
  adminApproval: ({ name, adminEmail, adminUsername, otp }) => (
    '<div style="font-family: Arial; padding: 24px; color:#333;">' +
      '<h2 style="color:#ff6348; margin-bottom: 12px;">New Admin Registration - Approval Required</h2>' +
      '<p style="margin: 6px 0;">Hi ' + (name || 'Superadmin') + ',</p>' +
      '<p style="margin: 6px 0;">A new admin registration request requires your approval:</p>' +
      '<div style="background:#f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;"><strong>Username:</strong> ' + adminUsername + '<br/><strong>Email:</strong> ' + adminEmail + '</div>' +
      '<p style="margin: 12px 0;">To approve this registration, use the following OTP code:</p>' +
      '<div style="font-size: 34px; font-weight: bold; margin: 24px 0; letter-spacing: 4px; text-align:center; background:#fff3f0; padding: 12px 20px; border-radius: 8px; color:#ff6348;">' + otp + '</div>' +
      '<p style="margin: 6px 0;">This approval OTP is valid for <strong>15 minutes</strong>.</p>' +
      '<p style="margin: 12px 0; color:#666; font-size: 13px;">If you did not expect this request, please ignore this email or contact support.</p>' +
    '</div>'
  )
};

export default mailTemplates;
`,
  mailer: `// Modular mailer using nodemailer and BullMQ
import nodemailer from "nodemailer";
import mailTemplates from "./mailTemplates.js";

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.MAIL_FROM,
    pass: process.env.MAIL_PASS,
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
});

export async function sendMail({ to, template, data, subject }) {
  if (!mailTemplates[template]) {
    throw new Error('Unknown template: ' + template);
  }
  const html = mailTemplates[template](data);
  const mail = {
    from: 'YourApp <' + process.env.MAIL_FROM + '>',
    to,
    subject: subject || template,
    html,
  };
  return transporter.sendMail(mail);
}
`,
  queue: `// BullMQ mail queue setup
import { Queue } from "bullmq";
import red from "../config/redis.js";

export const queueName = "mail";
export const jobTypes = {
  otp: "otp",
  welcome: "welcome",
  generic: "generic",
  passwordChanged: "passwordChanged",
  passlessLogin: "passlessLogin",
  adminApproval: "adminApproval",
};

export const MAIL_QUEUE = new Queue(queueName, {
  connection: red,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
  },
});
`,
  worker: `// BullMQ mail worker
import { Worker } from "bullmq";
import red from "../config/redis.js";
import { queueName, jobTypes } from "./queue.js";
import { sendMail } from "./mailer.js";
import mailTemplates from "./mailTemplates.js";

const subjectMap = {
  [jobTypes.otp]: "Your Verification Code",
  [jobTypes.welcome]: "Welcome!",
  [jobTypes.passwordChanged]: "Your Password Has Been Updated",
  [jobTypes.generic]: "Notification",
  [jobTypes.adminApproval]: "New Admin Registration - Approval Required",
  [jobTypes.passlessLogin]: "Passwordless Login Request",
};

const mailWorker = new Worker(
  queueName,
  async (job) => {
    const { to, ...data } = job.data;
    const type = job.name;
    if (!mailTemplates[type]) throw new Error('Template not found for type: ' + type);
    const subject = subjectMap[type] ?? "Notification";
    await sendMail({ to, template: type, data, subject });
    return { success: true, jobId: job.id, to };
  },
  { connection: red },
);
`,
  mailRepository: `// Mail repository for queueing mail jobs
import { MAIL_QUEUE, jobTypes } from "./queue.js";

const mailRepository = {
  async queueOTP(email, otp) {
    return MAIL_QUEUE.add(jobTypes.otp, { to: email, otp });
  },
  async queueWelcome(email, name) {
    return MAIL_QUEUE.add(jobTypes.welcome, { to: email, name });
  },
  // Add more as needed
};

export default mailRepository;
`,
};
