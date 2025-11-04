# Dev container base image with pinned newer npm
# You can bump NPM_VERSION to update consistently across all developers.
ARG NODE_IMAGE=mcr.microsoft.com/devcontainers/typescript-node:20
FROM ${NODE_IMAGE}


# Install native libraries needed for running extension tests / browsers.
# libnspr4 specifically required (error: libnspr4.so missing). Keep layer small.
USER root
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        # Core previously added
        libnspr4 \
        libnss3 \
        libdbus-1-3 \
        # Electron / headless browser dependencies
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libx11-xcb1 \
        libxcb-dri3-0 \
        libxcomposite1 \
        libxdamage1 \
        libxrandr2 \
        libxshmfence1 \
        libxfixes3 \
        libgbm1 \
        libasound2 \
        libdrm2 \
        libxss1 \
        libgtk-3-0 \
        libcups2 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Accept build arg for npm version; default to a specific known latest at time of authoring.
ARG NPM_VERSION=11.6.0
ENV NPM_VERSION=${NPM_VERSION}

# Install desired npm version globally (avoid using corepack for simplicity & stability here)
RUN npm install -g "npm@${NPM_VERSION}" \
    # Show versions for traceability in build logs
    && echo "Node: $(node -v)" \
    && echo "npm:  $(npm -v)" \
    && npm cache clean --force >/dev/null 2>&1 || true

# Preserve existing devcontainer expectation of user (return to non-root)
USER node
