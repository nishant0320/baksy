import fs from "node:fs";
import path from "node:path";
import generatePackageJson from "./package.js";
import gitignore from "./gitignore.js";
import prettier from "./prettier.js";
import { utils, server, mail } from "../templates/codeBase.js";
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
  const { language, database, cache, queue, auth, payments } = features;
  const isTS = language === "ts";

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
  if (auth === "jwt") {
    deps.jsonwebtoken = "^9.0.2";
    if (isTS) devDeps["@types/jsonwebtoken"] = "^9.0.7";
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
  const { database, cache, queue, auth, payments } = features;
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
  if (auth === "jwt") {
    lines.push(
      "ACCESS_KEY=your_access_secret_here",
      "REFRESH_KEY=your_refresh_secret_here",
      "",
    );
  }
  if (queue === "bullmq") {
    lines.push(
      "MAIL_HOST=smtp.gmail.com",
      "MAIL_PORT=587",
      "MAIL_FROM=your@email.com",
      "MAIL_PASS=your_app_password",
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
  const { language, database, cache, queue, auth, payments, docker } = features;
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
  ];

  if (cache === "redis") lines.push("- **Cache:** Redis (ioredis)");
  if (queue === "bullmq") lines.push("- **Queue / Mail:** BullMQ + Nodemailer");
  if (auth === "jwt") lines.push("- **Auth:** JWT (jsonwebtoken)");
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
    "npm run dev",
    "```",
    "",
    "## Scripts",
    "",
  );

  if (isTS) {
    lines.push(
      "| Script | Description |",
      "|--------|-------------|",
      "| `npm run dev` | Start dev server with hot reload (ts-node-dev) |",
      "| `npm run build` | Compile TypeScript to `dist/` |",
      "| `npm start` | Run compiled output |",
    );
  } else {
    lines.push(
      "| Script | Description |",
      "|--------|-------------|",
      "| `npm run dev` | Start dev server with nodemon |",
      "| `npm start` | Start production server |",
    );
  }

  lines.push(
    "",
    "## Project Structure",
    "",
    "```",
    "src/",
    `├── index.${ext}         # Entry point`,
    "├── config/",
    `│   ├── app.${ext}       # Express app setup`,
    `│   ├── env.${ext}       # dotenv loader`,
  );

  if (database !== "custom") lines.push(`│   ├── db.${ext}        # Database connection`);
  if (cache === "redis" || queue === "bullmq") lines.push(`│   └── redis.${ext}     # Redis connection`);

  lines.push("└── utils/");
  lines.push(`    ├── handler.${ext}   # Async error wrapper`);
  lines.push(`    ├── time.${ext}      # Time unit converter`);
  lines.push(`    └── logger.${ext}    # Winston logger`);
  if (auth === "jwt") lines.push(`    ├── jwt.${ext}       # JWT helpers`);
  if (cache === "redis") lines.push(`    └── redisKeyGen.${ext}`);
  if (payments !== "none") lines.push(`    └── payments.${ext}  # Payment client`);

  if (queue === "bullmq") {
    lines.push(
      "mail/",
      `├── mailTemplates.${ext}`,
      `├── mailer.${ext}`,
      `├── queue.${ext}`,
      `├── worker.${ext}`,
      `└── mailRepository.${ext}`,
    );
  }

  lines.push("```", "");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main scaffold function
// ---------------------------------------------------------------------------

export default function scaffold(targetDir, features) {
  const { language, database, cache, queue, auth, payments, docker } = features;
  const isTS = language === "ts";
  const ext = isTS ? "ts" : "js";

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
  writeFile(targetDir, `src/config/app.${ext}`, server.basicExpress);
  writeFile(targetDir, `src/config/env.${ext}`, generateEnvJs());

  const dbContent = generateDbConfig(database);
  if (dbContent) {
    writeFile(targetDir, `src/config/db.${ext}`, dbContent);
  }

  if (cache === "redis" || queue === "bullmq") {
    writeFile(targetDir, `src/config/redis.${ext}`, generateRedisConfig());
  }

  // 4. src/utils
  writeFile(targetDir, `src/utils/handler.${ext}`, utils.handler);
  writeFile(targetDir, `src/utils/time.${ext}`, utils.time);
  writeFile(targetDir, `src/utils/logger.${ext}`, utils.logger);

  if (cache === "redis") {
    writeFile(targetDir, `src/utils/redisKeyGen.${ext}`, utils.redisKeyGen);
  }
  if (auth === "jwt") {
    writeFile(targetDir, `src/utils/jwt.${ext}`, utils.jwt);
  }

  const paymentContent = generatePaymentUtil(payments);
  if (paymentContent) {
    writeFile(targetDir, `src/utils/payments.${ext}`, paymentContent);
  }

  // 5. src/mail (BullMQ queue)
  if (queue === "bullmq") {
    writeFile(targetDir, `src/mail/mailTemplates.${ext}`, mail.mailTemplates);
    writeFile(targetDir, `src/mail/mailer.${ext}`, mail.mailer);
    writeFile(targetDir, `src/mail/queue.${ext}`, mail.queue);
    writeFile(targetDir, `src/mail/worker.${ext}`, mail.worker);
    writeFile(targetDir, `src/mail/mailRepository.${ext}`, mail.mailRepository);
  }

  // 6. TypeScript config
  if (isTS) {
    writeFile(targetDir, "tsconfig.json", generateTsConfig());
  }

  // 7. Docker
  if (docker) {
    writeFile(targetDir, "Dockerfile", generateDockerfile());
    writeFile(targetDir, ".dockerignore", generateDockerIgnore());
    writeFile(targetDir, "docker-compose.yml", generateDockerCompose(features));
  }

  // 8. Environment example
  writeFile(targetDir, ".env.example", generateEnvExample(features));

  // 9. README
  const projectName = path.basename(targetDir);
  writeFile(targetDir, "README.md", generateReadme(projectName, features));
}
