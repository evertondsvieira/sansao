import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { App } from "../core/app.js";

export type NodeServeOptions = {
  port?: number;
  hostname?: string;
};

export function serve(app: App, options: NodeServeOptions = {}): http.Server {
  const { port = 3000, hostname = "0.0.0.0" } = options;

  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      // Convert the Node incoming request into a Web Standard Request.
      const host = req.headers.host || "localhost";
      const url = `http://${host}${req.url}`;
      
      // Read the full request body stream into a single buffer.
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = Buffer.concat(chunks);

      // Normalize Node headers into a Fetch Headers object.
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            value.forEach((v) => headers.append(key, v));
          } else if (typeof value === "string") {
            headers.set(key, value);
          }
        }
      }

      // Create a Web Standard Request (GET/HEAD must not include a body).
      const method = req.method || "GET";
      const requestInit: RequestInit = {
        method,
        headers,
      };
      // Only attach body when method semantics allow it.
      if (body.length > 0 && method !== "GET" && method !== "HEAD") {
        requestInit.body = body;
      }
      const request = new Request(url, requestInit);

      // Delegate processing to the framework app.
      const response = await app.fetch(request);

      // Map the Web Standard Response back to Node's response object.
      res.statusCode = response.status;
      res.statusMessage = response.statusText;

      // Copy headers while preserving repeated values (for example: set-cookie).
      response.headers.forEach((value, key) => {
        const existing = res.getHeader(key);
        if (existing) {
          // If the header already exists, append instead of overwrite.
          const values = Array.isArray(existing) ? existing : [existing as string];
          values.push(value);
          res.setHeader(key, values);
        } else {
          res.setHeader(key, value);
        }
      });

      // Stream bytes as-is to preserve binary payload integrity.
      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          res.end();
        } finally {
          reader.releaseLock();
        }
      } else {
        res.end();
      }
    } catch (error) {
      console.error("Error handling request:", error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
  });

  server.listen(port, hostname, () => {
    console.log(`🦁📋 Sansao is running at http://${hostname}:${port}`);
  });

  return server;
}
