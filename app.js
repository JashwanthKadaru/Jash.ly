const express = require("express")
const app = express()

require('dotenv').config();
const PORT = process.env.PORT | 3000

const cors = require('cors');
const path = require("path");

const helmet = require('helmet');
app.use(helmet());

app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

const corsOptionsDelegate = (req, callback) => {
    const requestOrigin = req.get('origin') || req.get('referer');
    const serverOrigin = `https://${req.get('host')}`;

    if (!requestOrigin || requestOrigin.startsWith(serverOrigin)) {
        console.log("Alright! Allowed:", requestOrigin);
        callback(null, { origin: true, credentials: true });
    } else {
        console.log("Not allowed by CORS:", requestOrigin);
        callback(new Error("Not allowed by CORS"));
    }
};

app.use(cors(corsOptionsDelegate));


const MurmurHash3 = require('murmurhash3js');
const Database = require('better-sqlite3');
const db = new Database('./secure-data/database.db', { verbose: console.log });

// Create table securely
db.prepare(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_url TEXT NOT NULL,
    short_hash TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).run();


app.post("/shorten-url/", (req, res) => {
    try {
        console.log(req.body)
        console.log("*******************************8")
        const originalLink = req.body.URL;
        const shortHash = MurmurHash3.x64.hash128(originalLink).slice(0, 8); // Shorten hash
        
        const stmt = db.prepare("INSERT INTO links (original_url, short_hash) VALUES (?, ?)");
        stmt.run(originalLink, shortHash);

        res.json({ status: "success", shortURL: shortHash, originalLink });

        // Cleanup old links (execute after response)
        setImmediate(() => {
            const expiryTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
            db.prepare("DELETE FROM links WHERE created_at < datetime(?, 'unixepoch')").run(expiryTime / 1000);
        });

    } catch (error) {
        console.log("Error:", error);
        res.status(500).json({ status: "failed", shortURL: null, originalLink: req.body.URL });
    }
});

app.get("/:shortURLhash", (req, res) => {
    try {
        const shortURLhash = req.params.shortURLhash;

        // Fetch the original URL and created_at timestamp
        const row = db.prepare("SELECT original_url, created_at FROM links WHERE short_hash = ?").get(shortURLhash);

        if (!row) {
            console.log(`No record found for: ${shortURLhash}`);
            return res.status(404).send("Not Found");
        }

        // Check if the link is older than 1 minute
        const linkAge = Date.now() - new Date(row.created_at).getTime();
        if (linkAge > 24* 60 * 60 * 1000) {
            console.log(`Expired link: ${shortURLhash}`);
            return res.status(404).send("Not Found");
        }

        // Redirect to the original URL
        res.redirect(row.original_url);

        // Cleanup old records (run after response)
        setImmediate(() => {
            const expiryTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours  ago
            db.prepare("DELETE FROM links WHERE created_at < datetime(?, 'unixepoch')").run(expiryTime / 1000);
        });

    } catch (error) {
        console.log("Error:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});



app.listen(PORT, () => {
  console.log("Server listening on PORT: ", PORT);
  if(PORT==3000) {
    console.log("Server process couldn't fetch .env file contents.")
  }
})