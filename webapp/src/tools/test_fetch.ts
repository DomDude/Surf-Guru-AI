import { fetchMarineData } from './fetch_marine_data';

async function testCurrentMarine() {
    console.log("Testing current marine data for Pipeline...");
    const data = await fetchMarineData(21.6642, -158.0562);
    console.log(data);
}

testCurrentMarine();
