# Dev container base image with pinned newer npm
# You can bump NPM_VERSION to update consistently across all developers.
ARG NODE_IMAGE=mcr.microsoft.com/devcontainers/typescript-node:20
FROM ${NODE_IMAGE}

# Accept build arg for npm version; default to a specific known latest at time of authoring.
ARG NPM_VERSION=11.6.0
ENV NPM_VERSION=${NPM_VERSION}

# Install desired npm version globally (avoid using corepack for simplicity & stability here)
RUN npm install -g "npm@${NPM_VERSION}" \
    # Show versions for traceability in build logs
    && echo "Node: $(node -v)" \
    && echo "npm:  $(npm -v)" \
    && npm cache clean --force >/dev/null 2>&1 || true

# Preserve existing devcontainer expectation of user
USER node
