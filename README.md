# baksy – SaaS Backend Generator

[![Stargazers](https://img.shields.io/github/stars/nishant0320/baksy?style=flat)](https://github.com/nishant0320/baksy/stargazers)
[![Issues](https://img.shields.io/github/issues/nishant0320/baksy?style=flat)](https://github.com/nishant0320/baksy/issues)
[![Forks](https://img.shields.io/github/forks/nishant0320/baksy?style=flat)](https://github.com/nishant0320/baksy/network/members)
[![Size](https://img.shields.io/github/repo-size/nishant0320/baksy?style=flat)](https://github.com/nishant0320/baksy)

## About

**baksy** is an opinionated backend generator for SaaS builders. It helps you scaffold a modern Node.js backend with best practices, interactive setup, and support for popular stacks (TypeScript/JavaScript, MongoDB/PostgreSQL, JWT/OAuth, and more).

## Features

- Interactive CLI: Choose language, database, auth, payments, queue, Docker, and more
- Modern project structure with ESM support
- Pre-configured for TypeScript or JavaScript
- Supports MongoDB (Mongoose) and PostgreSQL (Prisma)
- Auth options: JWT, OAuth, refresh tokens, cookies
- Payments: Stripe, Razorpay, or none
- Queue: BullMQ (Redis), RabbitMQ, or none
- Docker support (optional)
- Extensible and modular codebase

## How It Works

1. Run the CLI to scaffold a backend:

   ```bash
   npx baksy add <project-directory>
   ```

   or

   ```bash
   npx baksy -h
   ```

2. Use the arrow keys to select options for language, database, auth, etc.
3. Your backend project will be generated in the specified directory.

## Example

```bash
npx baksy my-saas-backend -p ./
```

## Links

- [GitHub Repository](https://github.com/nishant0320/baksy)
- [Stargazers](https://github.com/nishant0320/baksy/stargazers)
- [Issues](https://github.com/nishant0320/baksy/issues)
