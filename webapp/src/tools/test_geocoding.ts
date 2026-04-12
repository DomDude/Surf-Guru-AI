import { geocodeLocation } from './geocoding';

async function test() {
    console.log("Testing new Gemini Geocoding Agent...");
    const pipeline = await geocodeLocation("Pipeline, Hawaii");
    console.log("Pipeline result:", pipeline);

    const munich = await geocodeLocation("Eisbachwelle, Munich");
    console.log("Eisbachwelle result:", munich);
}

test();
