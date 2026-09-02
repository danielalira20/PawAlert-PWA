const fs = require('fs');
const path = require('path');

const geojsonPath = path.join(__dirname, '..', 'public', 'data', 'colonias-puebla.json');
const data = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));

console.log(`Loaded ${data.features.length} features.`);

async function main() {
    let updated = 0;
    for (let feature of data.features) {
        const cp = feature.properties.cp;
        const currentName = feature.properties.nombre || '';
        
        if (!currentName.startsWith('CP ') && currentName !== '') {
            continue; // Already has a name
        }
        
        try {
            const res = await fetch(`https://api.zippopotam.us/mx/${cp}`);
            if (res.ok) {
                const json = await res.json();
                if (json.places && json.places.length > 0) {
                    const names = json.places.map(p => p['place name']);
                    const finalName = names.slice(0, 2).join(' / ');
                    feature.properties.nombre = finalName;
                    console.log(`CP ${cp} -> ${finalName}`);
                    updated++;
                } else {
                    console.log(`CP ${cp} has no places`);
                }
            } else {
                console.log(`CP ${cp} not found (${res.status})`);
            }
        } catch (e) {
            console.log(`Error fetching CP ${cp}: ${e.message}`);
        }
        
        // Wait 100ms
        await new Promise(r => setTimeout(r, 100));
    }
    
    fs.writeFileSync(geojsonPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Updated ${updated} colonias! Done.`);
}

main();
