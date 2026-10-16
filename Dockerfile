# Runs the ncrypted MCP server (stdio). Used by MCP directories (e.g. Glama) to build and inspect the server.
# For normal use, prefer: npx -y @seidl-family/ncrypted-mcp
FROM node:22-slim
RUN npm install -g @seidl-family/ncrypted-mcp@0.2.2 && npm cache clean --force
USER node
ENTRYPOINT ["ncrypted-mcp"]
