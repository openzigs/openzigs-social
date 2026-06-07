# openzigs-social API server — minimal Node 22 Alpine image
FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

# Copy compiled server output
COPY dist/ ./dist/
COPY migrations/ ./migrations/
COPY config/ ./config/

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
