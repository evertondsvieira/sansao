import { serve } from "sansao/node";
import { app } from "./app.ts";

serve(app, { port: 3000 });
