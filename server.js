const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(fileUpload());
app.use(express.json());

app.post('/upload', (req, res) => {
    if (!req.files || !req.files.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const file = req.files.file;
    const data = JSON.parse(file.data.toString());
    
    // Process ChainMaker JSON
    const typeMappings = {1: "Items", 2: "Alt-Forms", 3: "Drawbacks"};
    const jumpTotals = {};
    const jumpNames = {};
    
    if (data.jumps) {
        for (const [jumpId, jumpData] of Object.entries(data.jumps)) {
            jumpNames[jumpId] = jumpData.name || `Jump ${jumpId}`;
        }
    }
    
    if (data.purchases) {
        for (const purchase of Object.values(data.purchases)) {
            if (purchase._characterId === 0) {
                const jumpId = purchase._jumpId;
                const itemType = purchase._type;
                
                if (!jumpTotals[jumpId]) {
                    jumpTotals[jumpId] = { Items: 0, "Alt-Forms": 0, Drawbacks: 0 };
                }
                
                if (typeMappings[itemType]) {
                    jumpTotals[jumpId][typeMappings[itemType]] += 1;
                }
            }
        }
    }
    
    const result = Object.keys(jumpTotals).map(jumpId => ({
        jump: jumpNames[jumpId] || `Jump ${jumpId}`,
        totals: jumpTotals[jumpId]
    }));
    
    res.json(result);
});

app.listen(5000, () => console.log('Server running on port 5000'));
