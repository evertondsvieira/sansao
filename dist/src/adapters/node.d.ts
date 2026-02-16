import http from "node:http";
import type { App } from "../core/app.js";
export type NodeServeOptions = {
    port?: number;
    hostname?: string;
};
export declare function serve(app: App, options?: NodeServeOptions): http.Server;
//# sourceMappingURL=node.d.ts.map