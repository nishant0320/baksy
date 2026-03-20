import fs from "node:fs";
import path from "node:path";
import generatePackageJson from "./package.js";
import gitignore from "./gitignore.js";
import prettier from "./prettier.js";
import { utils, server, mail } from "../templates/codeBase.js";
import {
  generateUserModel,
  generatePrismaSchema,
  generateAuthRepository,
  generateAuthService,
  generateAuthController,
  generateAuthRoutes,
  generateAuthMiddleware,
  generatePassportConfig,
  generateAppWithAuth,
} from "../templates/auth.js";
import { prettyJson } from "./file-utils.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function writeFile(targetDir, relPath, content) {
  const fullPath = path.join(targetDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
}

// ---------------------------------------------------------------------------
// Dependency resolution
// ---------------------------------------------------------------------------

function buildDependencies(features) {
  const { language, database, cache, queue, authMethods = [], payments } = features;
  const isTS = language === "ts";

  const hasEmail    = authMethods.includes("email");
  const hasTotp     = authMethods.includes("totp");
  const hasPassless = authMethods.includes("passless");
  const hasGoogle   = authMethods.includes("oauth-google");
  const hasGithub   = authMethods.includes("oauth-github");
  const hasOAuth    = hasGoogle || hasGithub;
  const hasAnyAuth  = authMethods.length > 0;

  const deps = {
    express: "^4.21.2",
    cors: "^2.8.5",
    dotenv: "^16.4.7",
    winston: "^3.17.0",
  };

  const devDeps = {};

  if (isTS) {
    Object.assign(devDeps, {
      typescript: "^5.7.2",
      "ts-node-dev": "^2.0.0",
      "@types/node": "^22.0.0",
      "@types/express": "^5.0.0",
      "@types/cors": "^2.8.17",
    });
  } else {
    devDeps.nodemon = "^3.1.9";
  }

  if (database === "mongo") {
    deps.mongoose = "^8.10.0";
  }
  if (database === "postgres") {
    deps["@prisma/client"] = "^6.0.0";
    devDeps.prisma = "^6.0.0";
  }
  if (cache === "redis" || queue === "bullmq") {
    deps.ioredis = "^5.4.2";
  }
  if (queue === "bullmq") {
    deps.bullmq = "^5.34.3";
    deps.nodemailer = "^6.9.16";
    if (isTS) devDeps["@types/nodemailer"] = "^6.4.17";
  }

  // Auth deps
  if (hasAnyAuth) {
    deps.jsonwebtoken = "^9.0.2";
    if (isTS) devDeps["@types/jsonwebtoken"] = "^9.0.7";
  }
  if (hasEmail || hasOAuth) {
    deps.bcryptjs = "^2.4.3";
    if (isTS) devDeps["@types/bcryptjs"] = "^2.4.6";
  }
  if (hasTotp) {
    deps.speakeasy = "^2.0.0";
    deps.qrcode = "^1.5.4";
    if (isTS) {
      devDeps["@types/speakeasy"] = "^2.0.10";
      devDeps["@types/qrcode"] = "^1.5.5";
    }
  }
  if (hasPassless && queue !== "bullmq") {
    // Nodemailer for magic-link sending (only add if not already added via queue)
    deps.nodemailer = "^6.9.16";
    if (isTS) devDeps["@types/nodemailer"] = "^6.4.17";
  }
  if (hasOAuth) {
    deps.passport = "^0.7.0";
    if (isTS) devDeps["@types/passport"] = "^1.0.17";
  }
  if (hasGoogle) {
    deps["passport-google-oauth20"] = "^2.0.0";
    if (isTS) devDeps["@types/passport-google-oauth20"] = "^2.0.16";
  }
  if (hasGithub) {
    deps["passport-github2"] = "^0.1.12";
    if (isTS) devDeps["@types/passport-github2"] = "^1.2.9";
  }

  if (payments === "stripe") {
    deps.stripe = "^17.7.0";
  }
  if (payments === "razorpay") {
    deps.razorpay = "^2.9.4";
  }

  return { deps, devDeps };
}

// ---------------------------------------------------------------------------
// Source file generators
// ---------------------------------------------------------------------------

function generateEnvJs() {
  return `import { config } from 'dotenv';
config();
`;
}

function generateEntryWithDB(database) {
  return `import './config/env.js';
import app from './config/app.js';
import { connectDB } from './config/db.js';

const port = process.env.PORT || 4000;

connectDB().then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log('Service running on port ' + port);
  });
});
`;
}

function generateDbConfig(database) {
  // 'custom' means the user will set up the database manually — no file generated.
  if (database === "mongo") {
    return `import mongoose from 'mongoose';
import logger from '../utils/logger.js';

export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('MongoDB connected');
  } catch (err) {
    logger.error('MongoDB connection error: ' + err.message);
    process.exit(1);
  }
}
`;
  }

  if (database === "postgres") {
    return `import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';

const prisma = new PrismaClient();

export async function connectDB() {
  await prisma.$connect();
  logger.info('PostgreSQL connected via Prisma');
}

export default prisma;
`;
  }

  return null;
}

function generateRedisConfig() {
  return `import { Redis } from 'ioredis';
import logger from '../utils/logger.js';

const red = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

red.on('error', (err) => logger.error('Redis error: ' + err.message));

export default red;
`;
}

function generatePaymentUtil(payments) {
  if (payments === "stripe") {
    return `import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export default stripe;
`;
  }

  if (payments === "razorpay") {
    return `import Razorpay from 'razorpay';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

export default razorpay;
`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Config file generators
// ---------------------------------------------------------------------------

function generateTsConfig() {
  return prettyJson({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      outDir: "./dist",
      rootDir: "./src",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"],
  });
}

function generateEnvExample(features) {
  const { database, cache, queue, authMethods = [], payments } = features;
  const hasAnyAuth  = authMethods.length > 0;
  const hasPassless = authMethods.includes("passless");
  const hasGoogle   = authMethods.includes("oauth-google");
  const hasGithub   = authMethods.includes("oauth-github");
  const lines = ["PORT=4000", "MODE=development", ""];

  if (database === "mongo") {
    lines.push("MONGO_URI=mongodb://localhost:27017/mydb", "");
  }
  if (database === "postgres") {
    lines.push("DATABASE_URL=postgresql://user:password@localhost:5432/mydb", "");
  }
  if (cache === "redis" || queue === "bullmq") {
    lines.push("REDIS_HOST=localhost", "REDIS_PORT=6379", "");
  }
  if (hasAnyAuth) {
    lines.push(
      "ACCESS_KEY=your_access_secret_here",
      "REFRESH_KEY=your_refresh_secret_here",
      "",
    );
  }
  if (queue === "bullmq" || hasPassless) {
    lines.push(
      "MAIL_HOST=smtp.gmail.com",
      "MAIL_PORT=587",
      "MAIL_FROM=your@email.com",
      "MAIL_PASS=your_app_password",
      "",
    );
  }
  if (hasGoogle) {
    lines.push(
      "GOOGLE_CLIENT_ID=your_google_client_id",
      "GOOGLE_CLIENT_SECRET=your_google_client_secret",
      "GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback",
      "",
    );
  }
  if (hasGithub) {
    lines.push(
      "GITHUB_CLIENT_ID=your_github_client_id",
      "GITHUB_CLIENT_SECRET=your_github_client_secret",
      "GITHUB_CALLBACK_URL=http://localhost:4000/api/auth/github/callback",
      "",
    );
  }
  if (payments === "stripe") {
    lines.push("STRIPE_SECRET_KEY=sk_test_...", "STRIPE_WEBHOOK_SECRET=whsec_...", "");
  }
  if (payments === "razorpay") {
    lines.push("RAZORPAY_KEY_ID=rzp_test_...", "RAZORPAY_KEY_SECRET=your_secret", "");
  }

  lines.push("FRONTEND_URL=http://localhost:5173");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Docker generators
// ---------------------------------------------------------------------------

function generateDockerfile() {
  return `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 4000
CMD ["npm", "start"]
`;
}

function generateDockerIgnore() {
  return `node_modules
dist
.env
.git
*.log
`;
}

function generateDockerCompose(features) {
  const { database, cache, queue } = features;
  const hasRedis = cache === "redis" || queue === "bullmq";
  const hasMongo = database === "mongo";
  const hasPostgres = database === "postgres";

  const depends = [];
  if (hasMongo) depends.push("      - mongo");
  if (hasPostgres) depends.push("      - postgres");
  if (hasRedis) depends.push("      - redis");

  let out = `version: '3.8'
services:
  app:
    build: .
    ports:
      - "4000:4000"
    env_file:
      - .env
    restart: unless-stopped`;

  if (depends.length) {
    out += `\n    depends_on:\n${depends.join("\n")}`;
  }

  if (hasMongo) {
    out += `

  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db`;
  }

  if (hasPostgres) {
    out += `

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: mydb
    ports:
      - "5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data`;
  }

  if (hasRedis) {
    out += `

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"`;
  }

  const volumes = [];
  if (hasMongo) volumes.push("  mongo_data:");
  if (hasPostgres) volumes.push("  pg_data:");

  if (volumes.length) {
    out += `\n\nvolumes:\n${volumes.join("\n")}`;
  }

  return out + "\n";
}

// ---------------------------------------------------------------------------
// README generator
// ---------------------------------------------------------------------------

function generateReadme(projectName, features) {
  const { language, database, cache, queue, authMethods = [], archStyle, payments, docker } = features;
  const isTS = language === "ts";
  const ext = isTS ? "ts" : "js";

  const dbLabel =
    database === "mongo" ? "MongoDB (Mongoose)"
    : database === "postgres" ? "PostgreSQL (Prisma)"
    : "Custom (manual setup)";

  const lines = [
    `# ${projectName}`,
    "",
    "A modern Node.js backend generated by [baksy](https://github.com/nishant0320/baksy).",
    "",
    "## Stack",
    "",
    `- **Language:** ${isTS ? "TypeScript" : "JavaScript"}`,
    `- **Framework:** Express.js`,
    `- **Database:** ${dbLabel}`,
    `- **Architecture:** ${archStyle === "microservice" ? "Microservice-oriented" : "Monolith"}`,
  ];

  if (cache === "redis") lines.push("- **Cache:** Redis (ioredis)");
  if (queue === "bullmq") lines.push("- **Queue / Mail:** BullMQ + Nodemailer");

  if (authMethods.length > 0) {
    const methodLabels = {
      email: "Email + Password",
      totp: "TOTP 2FA (speakeasy)",
      passless: "Passwordless magic-link",
      "oauth-google": "Google OAuth",
      "oauth-github": "GitHub OAuth",
    };
    lines.push(
      "- **Auth:** " + authMethods.map((m) => methodLabels[m] || m).join(", "),
    );
  }

  if (payments === "stripe") lines.push("- **Payments:** Stripe");
  if (payments === "razorpay") lines.push("- **Payments:** Razorpay");
  if (docker) lines.push("- **Docker:** Dockerfile + docker-compose");

  lines.push(
    "",
    "## Getting Started",
    "",
    "```bash",
    "npm install",
    "cp .env.example .env  # fill in your values",
    database === "postgres" ? "npx prisma generate  # generate Prisma client" : "",
    "npm run dev",
    "```",
    "",
  );

  if (authMethods.length > 0) {
    lines.push(
      "## Auth API",
      "",
      "| Method | Endpoint | Description |",
      "|--------|----------|-------------|",
    );
    if (authMethods.includes("email")) {
      lines.push(
        "| POST | `/api/auth/register` | Register new user |",
        "| POST | `/api/auth/login` | Login (returns JWT) |",
      );
    }
    lines.push(
      "| POST | `/api/auth/logout` | Logout (revoke refresh token) |",
      "| POST | `/api/auth/refresh` | Get new access token |",
      "| GET  | `/api/auth/me` | Get current user |",
    );
    if (authMethods.includes("totp")) {
      lines.push(
        "| POST | `/api/auth/2fa/setup` | Generate TOTP secret + QR code |",
        "| POST | `/api/auth/2fa/enable` | Confirm and enable 2FA |",
        "| POST | `/api/auth/2fa/login` | Complete login with TOTP token |",
        "| POST | `/api/auth/2fa/disable` | Disable 2FA |",
      );
    }
    if (authMethods.includes("passless")) {
      lines.push(
        "| POST | `/api/auth/passless/request` | Send magic-link email |",
        "| GET  | `/api/auth/passless/verify?token=` | Verify magic-link |",
      );
    }
    if (authMethods.includes("oauth-google")) {
      lines.push(
        "| GET | `/api/auth/google` | Redirect to Google OAuth |",
        "| GET | `/api/auth/google/callback` | Google OAuth callback |",
      );
    }
    if (authMethods.includes("oauth-github")) {
      lines.push(
        "| GET | `/api/auth/github` | Redirect to GitHub OAuth |",
        "| GET | `/api/auth/github/callback` | GitHub OAuth callback |",
      );
    }
    lines.push("");
  }

  lines.push(
    "## Scripts",
    "",
    isTS
      ? "| Script | Description |\n|--------|-------------|\n| `npm run dev` | Start dev server with hot reload (ts-node-dev) |\n| `npm run build` | Compile TypeScript to `dist/` |\n| `npm start` | Run compiled output |"
      : "| Script | Description |\n|--------|-------------|\n| `npm run dev` | Start dev server with nodemon |\n| `npm start` | Start production server |",
    "",
  );

  lines.push("## Project Structure", "", "```");

  if (archStyle === "microservice") {
    lines.push(
      "src/",
      `├── index.${ext}`,
      "├── config/          # env, db, redis, passport",
      "├── controllers/     # auth.controller",
      "├── services/        # auth.service",
      "├── repositories/    # auth.repository",
      "├── models/          # user.model (Mongoose)",
      "├── routes/          # auth.routes",
      "├── middlewares/     # auth.middleware (JWT guard)",
      "└── utils/           # handler, time, logger, jwt, ...",
    );
  } else {
    lines.push(
      "src/",
      `├── index.${ext}`,
      "├── config/          # env, db, redis, passport",
      "├── modules/",
      "│   └── auth/        # controller, service, repository, routes, model",
      "├── middlewares/     # auth.middleware (JWT guard)",
      "└── utils/           # handler, time, logger, ...",
    );
  }

  lines.push("```", "");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main scaffold function
// ---------------------------------------------------------------------------

export default function scaffold(targetDir, features) {
  const { language, database, cache, queue, authMethods = [], archStyle = "monolith", payments, docker } = features;
  const isTS = language === "ts";
  const ext = isTS ? "ts" : "js";
  const hasAnyAuth = authMethods.length > 0;
  const hasOAuth   = authMethods.includes("oauth-google") || authMethods.includes("oauth-github");

  // 1. Config files at project root
  const { deps, devDeps } = buildDependencies(features);
  generatePackageJson(targetDir, {
    isTS,
    force: true,
    dependencies: deps,
    devDependencies: devDeps,
  });
  gitignore({ targetDir, template: "node", force: true });
  prettier({ dir: targetDir, force: true });

  // 2. src/index — entry point
  const entryContent =
    database !== "custom" ? generateEntryWithDB(database) : server.entry;
  writeFile(targetDir, `src/index.${ext}`, entryContent);

  // 3. src/config
  // app.js — if auth is included use the version that mounts auth routes
  const appContent = hasAnyAuth
    ? generateAppWithAuth({ authMethods, archStyle })
    : server.basicExpress;
  writeFile(targetDir, `src/config/app.${ext}`, appContent);
  writeFile(targetDir, `src/config/env.${ext}`, generateEnvJs());

  const dbContent = generateDbConfig(database);
  if (dbContent) {
    writeFile(targetDir, `src/config/db.${ext}`, dbContent);
  }

  if (cache === "redis" || queue === "bullmq") {
    writeFile(targetDir, `src/config/redis.${ext}`, generateRedisConfig());
  }

  // Passport config (OAuth only)
  if (hasOAuth) {
    writeFile(targetDir, `src/config/passport.${ext}`, generatePassportConfig({ authMethods, archStyle }));
  }

  // 4. src/utils
  writeFile(targetDir, `src/utils/handler.${ext}`, utils.handler);
  writeFile(targetDir, `src/utils/time.${ext}`, utils.time);
  writeFile(targetDir, `src/utils/logger.${ext}`, utils.logger);

  if (cache === "redis") {
    writeFile(targetDir, `src/utils/redisKeyGen.${ext}`, utils.redisKeyGen);
  }

  const paymentContent = generatePaymentUtil(payments);
  if (paymentContent) {
    writeFile(targetDir, `src/utils/payments.${ext}`, paymentContent);
  }

  // Prisma schema (database layer — always generate when postgres, regardless of auth)
  if (database === "postgres") {
    writeFile(targetDir, "prisma/schema.prisma", generatePrismaSchema({ authMethods }));
  }

  // 5. Auth module
  if (hasAnyAuth) {
    const authFeatures = { database, authMethods, archStyle, queue };

    // Paths depend on architecture style
    const isMonolith = archStyle === "monolith";

    // Model / schema
    if (database === "mongo") {
      const modelPath = isMonolith
        ? `src/modules/auth/user.model.${ext}`
        : `src/models/user.model.${ext}`;
      writeFile(targetDir, modelPath, generateUserModel({ authMethods }));
    }
    // (prisma/schema.prisma already written above)

    // Repository
    const repoPath = isMonolith
      ? `src/modules/auth/auth.repository.${ext}`
      : `src/repositories/auth.repository.${ext}`;
    writeFile(targetDir, repoPath, generateAuthRepository(authFeatures));

    // Service
    const svcPath = isMonolith
      ? `src/modules/auth/auth.service.${ext}`
      : `src/services/auth.service.${ext}`;
    writeFile(targetDir, svcPath, generateAuthService(authFeatures));

    // Controller
    const ctrlPath = isMonolith
      ? `src/modules/auth/auth.controller.${ext}`
      : `src/controllers/auth.controller.${ext}`;
    writeFile(targetDir, ctrlPath, generateAuthController({ authMethods, archStyle }));

    // Routes
    const routesPath = isMonolith
      ? `src/modules/auth/auth.routes.${ext}`
      : `src/routes/auth.routes.${ext}`;
    writeFile(targetDir, routesPath, generateAuthRoutes({ authMethods, archStyle }));

    // Middleware (shared location in both styles)
    writeFile(
      targetDir,
      `src/middlewares/auth.middleware.${ext}`,
      generateAuthMiddleware({ archStyle }),
    );
  }

  // 6. src/mail (BullMQ queue)
  if (queue === "bullmq") {
    writeFile(targetDir, `src/mail/mailTemplates.${ext}`, mail.mailTemplates);
    writeFile(targetDir, `src/mail/mailer.${ext}`, mail.mailer);
    writeFile(targetDir, `src/mail/queue.${ext}`, mail.queue);
    writeFile(targetDir, `src/mail/worker.${ext}`, mail.worker);
    writeFile(targetDir, `src/mail/mailRepository.${ext}`, mail.mailRepository);
  }

  // 7. TypeScript config
  if (isTS) {
    writeFile(targetDir, "tsconfig.json", generateTsConfig());
  }

  // 8. Docker
  if (docker) {
    writeFile(targetDir, "Dockerfile", generateDockerfile());
    writeFile(targetDir, ".dockerignore", generateDockerIgnore());
    writeFile(targetDir, "docker-compose.yml", generateDockerCompose(features));
  }

  // 9. Environment example
  writeFile(targetDir, ".env.example", generateEnvExample(features));

  // 10. README
  const projectName = path.basename(targetDir);
  writeFile(targetDir, "README.md", generateReadme(projectName, features));
}
