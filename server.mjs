import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = __dirname;
const port = Number(process.env.PORT) || 4173;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function send(response, statusCode, body, contentType) {
  response.writeHead(statusCode, { "Content-Type": contentType });
  response.end(body);
}

function safePath(urlPath) {
  const pathname = decodeURIComponent(new URL(urlPath, "http://localhost").pathname);
  const requested = pathname === "/" ? "/index.html" : pathname;
  const absolute = path.resolve(root, `.${requested}`);
  if (!absolute.startsWith(root)) {
    return null;
  }
  return absolute;
}

const server = http.createServer((request, response) => {
  const filePath = safePath(request.url ?? "/");
  if (!filePath) {
    send(response, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      if (error.code === "ENOENT") {
        send(response, 404, "Not found", "text/plain; charset=utf-8");
        return;
      }
      send(response, 500, "Server error", "text/plain; charset=utf-8");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    send(response, 200, data, contentTypes[extension] ?? "application/octet-stream");
  });
});

server.listen(port, () => {
  console.log(`Serving joystick explainer at http://localhost:${port}`);
});
