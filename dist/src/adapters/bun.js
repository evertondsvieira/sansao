export function serve(app, options = {}) {
    const { port = 3000, hostname = "0.0.0.0" } = options;
    const runtime = globalThis.Bun;
    if (!runtime?.serve) {
        throw new Error("Bun runtime not detected. Use this adapter inside Bun.");
    }
    const server = runtime.serve({
        port,
        hostname,
        fetch: async (request) => {
            try {
                return await app.fetch(request);
            }
            catch (error) {
                console.error("Error handling request:", error);
                return new Response(JSON.stringify({ error: "Internal Server Error" }), {
                    status: 500,
                    headers: { "content-type": "application/json" },
                });
            }
        },
    });
    console.log(`🦁📋 Sansao is running at http://${hostname}:${port}`);
    return server;
}
//# sourceMappingURL=bun.js.map