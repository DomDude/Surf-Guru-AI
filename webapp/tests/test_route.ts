import { POST } from "../src/app/api/chat/route";
import { NextRequest } from "next/server";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function run() {
    const req = new NextRequest("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ location_name: "Beliche" })
    });

    console.log("Testing Route Handler Directly...");
    const res = await POST(req);
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
}

run();
