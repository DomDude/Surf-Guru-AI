import { geocodeLocation } from "../src/tools/geocoding";

async function main() {
    console.log("Testing Geocoding for Beliche...");
    const res = await geocodeLocation("Beliche");
    console.log("Result:", res);
}
main();
