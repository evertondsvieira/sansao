export function serve(app, options = {}) {
    const { port = 3000, hostname = "0.0.0.0" } = options;
    const runtime = globalThis.Deno;
    if (!runtime?.serve) {
        throw new Error("Deno runtime not detected. Use this adapter inside Deno.");
    }
    return runtime.serve({
        port,
        hostname,
        onListen: ({ hostname: activeHostname, port: activePort }) => {
            console.log(`🦁📋 Sansao is running at http://${activeHostname}:${activePort}`);
        },
    }, async (request) => {
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
    });
}
//# sourceMappingURL=deno.js.map