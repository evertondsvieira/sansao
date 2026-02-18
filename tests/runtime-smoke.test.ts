import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";

function resolveCommand(
  command: string,
  versionArgs: string[] = ["--version"],
  fallbacks: string[] = []
): string | null {
  const candidates = [command, ...fallbacks];
  for (const candidate of candidates) {
    if (candidate.includes("/") && !existsSync(candidate)) continue;
    const result = spawnSync(candidate, versionArgs, { stdio: "ignore" });
    if (result.status === 0) return candidate;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url: string, timeoutMs = 7000): Promise<Response> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Server not ready yet.
    }
    await sleep(100);
  }

  throw new Error(`Server did not become ready in ${timeoutMs}ms: ${url}`);
}

async function findFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to resolve free port"));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

async function findFreePortOrSkip(t: import("node:test").TestContext): Promise<number | null> {
  try {
    return await findFreePort();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (
      text.includes("EPERM") ||
      text.includes("EACCES") ||
      text.includes("Operation not permitted")
    ) {
      t.skip("socket listen blocked in this environment");
      return null;
    }
    throw error;
  }
}

async function stopProcess(child: ChildProcess): Promise<void> {
  const releaseHandles = () => {
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.unref();
  };

  if (child.killed || child.exitCode !== null) return;

  try {
    child.kill("SIGTERM");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH" || code === "EPERM" || code === "EACCES") {
      releaseHandles();
      return;
    }
    throw error;
  }
  await Promise.race([
    new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
    }),
    sleep(1000).then(() => {
      if (!child.killed && child.exitCode === null) {
        try {
          child.kill("SIGKILL");
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== "ESRCH" && code !== "EPERM" && code !== "EACCES") {
            throw error;
          }
          releaseHandles();
        }
      }
    }),
  ]);

  if (child.exitCode === null) {
    releaseHandles();
  }
}

function startServer(command: string, args: string[], port: number): {
  child: ChildProcess;
  logs: { stdout: string; stderr: string };
} {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SANSAO_TEST_PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs = { stdout: "", stderr: "" };
  child.stdout?.on("data", (chunk: Buffer | string) => {
    logs.stdout += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer | string) => {
    logs.stderr += chunk.toString();
  });

  return { child, logs };
}

function isSocketPermissionError(error: unknown, logs: { stdout: string; stderr: string }): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const text = `${message}\n${logs.stdout}\n${logs.stderr}`;
  return (
    text.includes("listen EPERM") ||
    text.includes("EACCES") ||
    text.includes("PermissionDenied") ||
    text.includes("Operation not permitted") ||
    text.includes("os error 1")
  );
}

function withProcessLogs(label: string, error: unknown, logs: { stdout: string; stderr: string }): Error {
  const base = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const stdout = logs.stdout.trim() || "<empty>";
  const stderr = logs.stderr.trim() || "<empty>";
  return new Error(`${label}\n${base}\n--- child stdout ---\n${stdout}\n--- child stderr ---\n${stderr}`);
}

function printProcessLogs(label: string, logs: { stdout: string; stderr: string }): void {
  const stdout = logs.stdout.trim() || "<empty>";
  const stderr = logs.stderr.trim() || "<empty>";
  console.error(`[${label}] child stdout:\n${stdout}`);
  console.error(`[${label}] child stderr:\n${stderr}`);
}

test("smoke: Node runtime serves /health", async (t) => {
  const port = await findFreePortOrSkip(t);
  if (port === null) return;
  const { child: server, logs } = startServer("node", ["tests/fixtures/smoke-node.mjs"], port);

  try {
    const response = await waitForServer(`http://127.0.0.1:${port}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.runtime, "node");
  } catch (error) {
    printProcessLogs("node-smoke", logs);
    if (isSocketPermissionError(error, logs)) {
      t.skip("socket listen blocked in this environment");
      return;
    }
    throw withProcessLogs("Node smoke failed", error, logs);
  } finally {
    await stopProcess(server);
  }
});

test("smoke: Bun runtime serves /health", async (t) => {
  const bunCommand = resolveCommand("bun", ["--version"], ["/snap/bin/bun"]);
  if (!bunCommand) {
    t.skip("bun command is not available in this environment");
    return;
  }

  const port = await findFreePortOrSkip(t);
  if (port === null) return;
  const { child: server, logs } = startServer(bunCommand, ["tests/fixtures/smoke-bun.ts"], port);

  try {
    const response = await waitForServer(`http://127.0.0.1:${port}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.runtime, "bun");
  } catch (error) {
    printProcessLogs("bun-smoke", logs);
    if (isSocketPermissionError(error, logs)) {
      t.skip("socket listen blocked in this environment");
      return;
    }
    throw withProcessLogs("Bun smoke failed", error, logs);
  } finally {
    await stopProcess(server);
  }
});

test("smoke: Deno runtime serves /health", async (t) => {
  const denoCommand = resolveCommand("deno", ["--version"], [
      `${process.env.DENO_INSTALL || ""}/bin/deno`,
      `${process.env.HOME || ""}/.deno/bin/deno`,
    ]);
  if (!denoCommand) {
    t.skip("deno command is not available in this environment");
    return;
  }

  const port = await findFreePortOrSkip(t);
  if (port === null) return;
  const { child: server, logs } = startServer(
    denoCommand,
    ["run", "--allow-net", "--allow-env", "tests/fixtures/smoke-deno.ts"],
    port
  );

  try {
    const response = await waitForServer(`http://127.0.0.1:${port}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.runtime, "deno");
  } catch (error) {
    printProcessLogs("deno-smoke", logs);
    if (isSocketPermissionError(error, logs)) {
      t.skip("socket listen blocked in this environment");
      return;
    }
    throw withProcessLogs("Deno smoke failed", error, logs);
  } finally {
    await stopProcess(server);
  }
});
