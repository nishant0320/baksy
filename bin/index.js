#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import { select, confirm } from "@inquirer/prompts";

const program = new Command();

program
  .name("baksy")
  .description("Baksy — Opinionated backend scaffolding")
  .version("1.0.0")
  .argument("[project-name]", "Project directory name or '.' for current")
  .option("-p, --path <dir>", "Base directory to create project in")
  .option("--in-place", "Scaffold inside current directory")
  .action(async (projectName, options) => {
    // 🚀 If no project name provided → show usage
    if (!projectName) {
      console.log(chalk.cyan("\nBaksy — Backend Scaffolding CLI\n"));
      console.log("Usage:");
      console.log("  baksy my-app");
      console.log("  baksy my-app --path ./apps");
      console.log("  baksy . --in-place\n");
      console.log("Examples:");
      console.log("  baksy api-server");
      console.log("  baksy api --path ./packages");
      console.log("  baksy . --in-place\n");
      process.exit(0);
    }

    let targetDir;

    if (options.inPlace) {
      if (projectName !== ".") {
        console.error(
          chalk.red("Use '.' with --in-place to scaffold in current directory."),
        );
        process.exit(1);
      }
      targetDir = process.cwd();
    } else {
      const baseDir = options.path
        ? path.resolve(process.cwd(), options.path)
        : process.cwd();

      targetDir = path.join(baseDir, projectName);

      if (fs.existsSync(targetDir)) {
        console.error(chalk.red("Target directory already exists."));
        process.exit(1);
      }

      fs.mkdirSync(targetDir, { recursive: true });
    }

    if (!options.inPlace) {
      const existingFiles = fs.readdirSync(targetDir);
      if (existingFiles.length > 0) {
        console.error(
          chalk.red("Target directory is not empty. Aborting."),
        );
        process.exit(1);
      }
    }

    console.log(chalk.cyan("\nBaksy Setup\n"));

    const language = await select({
      message: "Language:",
      choices: [
        { name: "TypeScript", value: "ts" },
        { name: "JavaScript", value: "js" },
      ],
      default: "ts",
    });

    const database = await select({
      message: "Database:",
      choices: [
        { name: "MongoDB (Mongoose)", value: "mongo" },
        { name: "PostgreSQL (Prisma)", value: "postgres" },
        { name: "Other (manual setup)", value: "custom" },
      ],
      default: "mongo",
    });

    const cache = await select({
      message: "Caching:",
      choices: [
        { name: "None", value: "none" },
        { name: "Redis", value: "redis" },
      ],
      default: "none",
    });

    const queue = await select({
      message: "Background jobs:",
      choices: [
        { name: "None", value: "none" },
        { name: "BullMQ", value: "bullmq" },
      ],
      default: "none",
    });

    const docker = await confirm({
      message: "Include Docker?",
      default: true,
    });

    const spinner = ora("Generating project...").start();

    const features = {
      language,
      database,
      cache,
      queue,
      docker,
    };

    fs.writeFileSync(
      path.join(targetDir, "features.json"),
      JSON.stringify(features, null, 2),
    );

    spinner.succeed("Project generated successfully.");

    console.log(chalk.green("\nNext steps:\n"));

    if (!options.inPlace) {
      console.log(`  cd ${path.relative(process.cwd(), targetDir)}`);
    }

    console.log(`  npm install
  npm run dev
`);
  });

program.parse(process.argv);