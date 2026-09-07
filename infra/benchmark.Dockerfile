# Diagnostic backend image. BASE_IMAGE must have the same dependency lockfile.
ARG BASE_IMAGE=warband-web:local
FROM ${BASE_IMAGE}
WORKDIR /app
COPY apps/server/src ./apps/server/src
COPY packages/db ./packages/db
COPY packages/shared ./packages/shared
COPY tools/sim ./tools/sim
