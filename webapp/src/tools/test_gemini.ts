import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

// Load variables from .env.local
dotenv.config({ path: '.env.local' });

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error("❌ ERROR: GEMINI_API_KEY is not set in .env.local");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function testGemini() {
    try {
        console.log("🌊 Testing Gemini API connection...");
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'You are an expert surf guide. Say "Aloha! The API is working perfectly." and nothing else.',
        });
        console.log("✅ Success! The Surf Guru says:");
        console.log(response.text);
    } catch (error) {
        console.error("❌ Gemini API Test Failed:", error);
    }
}

testGemini();
