import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import Database from "better-sqlite3";

// Initialize Database
const db = new Database("voting.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    creator_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS options (
    id TEXT PRIMARY KEY,
    poll_id TEXT NOT NULL,
    text TEXT NOT NULL,
    logo_url TEXT,
    FOREIGN KEY (poll_id) REFERENCES polls(id)
  );

  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id TEXT NOT NULL,
    option_id TEXT NOT NULL,
    voter_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (poll_id) REFERENCES polls(id),
    FOREIGN KEY (option_id) REFERENCES options(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    voter_id TEXT PRIMARY KEY,
    phone_number TEXT NOT NULL,
    dashboard_password TEXT DEFAULT 'admin123'
  );

  -- Add default admin
  INSERT OR IGNORE INTO users (voter_id, phone_number, dashboard_password) 
  VALUES ('admin1', '0000000000', 'admin1234');
`);

const app = express();
app.use(express.json());

async function startServer() {
  const PORT = 3000;
  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  function broadcastUpdate() {
    const polls = db.prepare("SELECT * FROM polls ORDER BY created_at DESC").all();
    const pollsWithChoices = polls.map((poll: any) => {
      const options = db.prepare("SELECT * FROM options WHERE poll_id = ?").all(poll.id);
      const votes = db.prepare("SELECT option_id, COUNT(*) as count FROM votes WHERE poll_id = ? GROUP BY option_id").all(poll.id);
      return { ...poll, options, votes };
    });
    const message = JSON.stringify({ type: "UPDATE", polls: pollsWithChoices });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // Auth Endpoints
  app.post("/api/auth/voter", (req, res) => {
    const { voterId, phoneNumber } = req.body;
    if (!voterId || !phoneNumber) {
      return res.status(400).json({ error: "Voter ID and Phone Number are required" });
    }

    const user = db.prepare("SELECT * FROM users WHERE voter_id = ?").get(voterId) as any;
    if (user) {
      if (user.phone_number === phoneNumber) {
        return res.json({ success: true, user });
      } else {
        return res.status(401).json({ error: "Invalid phone number for this Voter ID" });
      }
    } else {
      // Create new user
      db.prepare("INSERT INTO users (voter_id, phone_number) VALUES (?, ?)").run(voterId, phoneNumber);
      const newUser = db.prepare("SELECT * FROM users WHERE voter_id = ?").get(voterId);
      return res.json({ success: true, user: newUser });
    }
  });

  app.post("/api/auth/dashboard", (req, res) => {
    const { voterId, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE voter_id = ?").get(voterId) as any;
    if (user && user.dashboard_password === password) {
      return res.json({ success: true });
    }
    return res.status(401).json({ error: "Invalid dashboard password" });
  });

  app.get("/api/user/profile/:voterId", (req, res) => {
    const { voterId } = req.params;
    const user = db.prepare("SELECT voter_id, phone_number FROM users WHERE voter_id = ?").get(voterId);
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ error: "User not found" });
    }
  });

  app.get("/api/admin/stats", (req, res) => {
    const totalVotes = db.prepare("SELECT COUNT(*) as count FROM votes").get() as any;
    const totalPolls = db.prepare("SELECT COUNT(*) as count FROM polls").get() as any;
    const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users").get() as any;
    const activePolls = db.prepare("SELECT COUNT(*) as count FROM polls WHERE status = 'active'").get() as any;
    
    res.json({
      totalVotes: totalVotes.count,
      totalPolls: totalPolls.count,
      totalUsers: totalUsers.count,
      activePolls: activePolls.count
    });
  });

  app.delete("/api/admin/polls/:id", (req, res) => {
    const { id } = req.params;
    const transaction = db.transaction(() => {
      db.prepare("DELETE FROM votes WHERE poll_id = ?").run(id);
      db.prepare("DELETE FROM options WHERE poll_id = ?").run(id);
      db.prepare("DELETE FROM polls WHERE id = ?").run(id);
    });
    transaction();
    res.json({ success: true });
    broadcastUpdate();
  });

  app.get("/api/admin/users", (req, res) => {
    const users = db.prepare("SELECT * FROM users").all() as any[];
    const usersWithVotes = users.map(user => {
      const userVotes = db.prepare(`
        SELECT DISTINCT p.id, p.title 
        FROM votes v 
        JOIN polls p ON v.poll_id = p.id 
        WHERE v.voter_id = ?
      `).all(user.voter_id);
      return { ...user, participatedPolls: userVotes };
    });
    res.json(usersWithVotes);
  });

  // Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // User Dashboard Endpoints
  app.get("/api/user/stats/:voterId", (req, res) => {
    const { voterId } = req.params;
    const votesCast = db.prepare("SELECT COUNT(*) as count FROM votes WHERE voter_id = ?").get(voterId) as any;
    const pollsCreated = db.prepare("SELECT COUNT(*) as count FROM polls WHERE creator_id = ?").get(voterId) as any;
    const activePolls = db.prepare("SELECT COUNT(*) as count FROM polls WHERE status = 'active'").get() as any;
    
    res.json({
      votesCast: votesCast.count,
      pollsCreated: pollsCreated.count,
      activePolls: activePolls.count
    });
  });

  app.get("/api/user/activity/:voterId", (req, res) => {
    const { voterId } = req.params;
    const activity = db.prepare(`
      SELECT p.title, p.id as poll_id, v.created_at as voted_at, o.text as choice
      FROM votes v
      JOIN polls p ON v.poll_id = p.id
      JOIN options o ON v.option_id = o.id
      WHERE v.voter_id = ?
      ORDER BY v.created_at DESC
      LIMIT 10
    `).all(voterId);
    res.json(activity);
  });

  // API Routes
  app.get("/api/polls", (req, res) => {
    const polls = db.prepare("SELECT * FROM polls ORDER BY created_at DESC").all();
    const pollsWithChoices = polls.map((poll: any) => {
      const options = db.prepare("SELECT * FROM options WHERE poll_id = ?").all(poll.id);
      const votes = db.prepare("SELECT option_id, COUNT(*) as count FROM votes WHERE poll_id = ? GROUP BY option_id").all(poll.id);
      return { ...poll, options, votes };
    });
    res.json(pollsWithChoices);
  });

  app.post("/api/polls", (req, res) => {
    const { title, description, options, creatorId } = req.body;
    const pollId = Math.random().toString(36).substring(2, 15);
    
    const insertPoll = db.prepare("INSERT INTO polls (id, title, description, creator_id) VALUES (?, ?, ?, ?)");
    const insertOption = db.prepare("INSERT INTO options (id, poll_id, text, logo_url) VALUES (?, ?, ?, ?)");

    const transaction = db.transaction(() => {
      insertPoll.run(pollId, title, description, creatorId);
      options.forEach((opt: { text: string, logo_url?: string }) => {
        insertOption.run(Math.random().toString(36).substring(2, 15), pollId, opt.text, opt.logo_url || null);
      });
    });

    transaction();
    res.json({ id: pollId });
    broadcastUpdate();
  });

  app.post("/api/vote", (req, res) => {
    const { pollId, optionId, voterId } = req.body;
    
    // Check if poll is active
    const poll = db.prepare("SELECT status FROM polls WHERE id = ?").get(pollId) as any;
    if (!poll || poll.status !== 'active') {
      return res.status(400).json({ error: "Poll is closed or does not exist" });
    }
    
    // Check if user already voted
    const existing = db.prepare("SELECT id FROM votes WHERE poll_id = ? AND voter_id = ?").get(pollId, voterId);
    if (existing) {
      return res.status(400).json({ error: "Already voted" });
    }

    db.prepare("INSERT INTO votes (poll_id, option_id, voter_id) VALUES (?, ?, ?)").run(pollId, optionId, voterId);
    res.json({ success: true });
    broadcastUpdate();
  });

  app.patch("/api/polls/:id", (req, res) => {
    const { id } = req.params;
    const { title, description, options, status } = req.body;

    // Check if votes exist before allowing edits to content
    const voteCount = db.prepare("SELECT COUNT(*) as count FROM votes WHERE poll_id = ?").get(id) as any;
    
    if (status !== undefined) {
      db.prepare("UPDATE polls SET status = ? WHERE id = ?").run(status, id);
    }

    if (title || description || options) {
      if (voteCount.count > 0) {
        return res.status(400).json({ error: "Cannot edit poll after votes have been cast" });
      }

      if (title) db.prepare("UPDATE polls SET title = ? WHERE id = ?").run(title, id);
      if (description !== undefined) db.prepare("UPDATE polls SET description = ? WHERE id = ?").run(description, id);
      
      if (options) {
        // Simple strategy: delete and recreate options if no votes exist
        db.prepare("DELETE FROM options WHERE poll_id = ?").run(id);
        const insertOption = db.prepare("INSERT INTO options (id, poll_id, text) VALUES (?, ?, ?)");
        options.forEach((opt: string) => {
          insertOption.run(Math.random().toString(36).substring(2, 15), id, opt);
        });
      }
    }

    res.json({ success: true });
    broadcastUpdate();
  });

  wss.on("connection", (ws) => {
    console.log("Client connected");
    // Send initial state
    const polls = db.prepare("SELECT * FROM polls ORDER BY created_at DESC").all();
    const pollsWithChoices = polls.map((poll: any) => {
      const options = db.prepare("SELECT * FROM options WHERE poll_id = ?").all(poll.id);
      const votes = db.prepare("SELECT option_id, COUNT(*) as count FROM votes WHERE poll_id = ? GROUP BY option_id").all(poll.id);
      return { ...poll, options, votes };
    });
    ws.send(JSON.stringify({ type: "INIT", polls: pollsWithChoices }));
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

startServer();
