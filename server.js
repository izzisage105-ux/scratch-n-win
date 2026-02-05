const express = require("express");
const cors = require("cors");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const fs = require("fs"); // ADD THIS
require("dotenv").config();

const app = express();

// ========== FIX FOR VERCEL ==========
// Vercel is serverless - use in-memory storage
let memoryDb = {
  users: [],
  games: [],
  withdrawals: [],
  deposits: [],
  settings: {},
  winCounters: {}
};

const db = {
  data: memoryDb,
  read: async function() {
    return this.data;
  },
  write: async function() {
    return Promise.resolve();
  }
};

// Initialize with demo admin account for Vercel
(async () => {
  console.log("✅ Database ready for Vercel (in-memory)");
  
  const hasAdmin = db.data.users.some(u => u.username === "admin");
  if (!hasAdmin) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("admin123", salt);
    
    db.data.users.push({
      id: "admin-vercel-1",
      phone: "0000000000",
      username: "admin",
      password: hashedPassword,
      realBalance: 100000,
      demoBalance: 50000,
      depositTier: 10000,
      demoBonus: 500000,
      currentBalanceMode: 'demo',
      totalStakedReal: 0,
      totalStakedDemo: 0,
      totalWonReal: 0,
      totalWonDemo: 0,
      bankName: 'Demo Bank',
      accountName: 'Admin User',
      accountNumber: '0000000000',
      withdrawalUnlocked: true,
      gamesPlayed: 0,
      isAdmin: true,
      adminRole: "Main Admin",
      createdAt: new Date().toISOString()
    });
    
    console.log("✅ Demo admin account created for Vercel");
  }
})();

// ========== CORS CONFIGURATION ==========
app.use(cors());
app.use(express.json());

// ========== STATIC FILE SERVING FIX ==========
// Serve static files from current directory
app.use(express.static(__dirname));

// Add this middleware to fix HTML content type
app.use((req, res, next) => {
  const url = req.url.toLowerCase();
  if (url.endsWith('.html') || url === '/' || !url.includes('.')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
  }
  next();
});

// ========== ROUTES FOR HTML PAGES ==========
// Main route - serve game.html
app.get("/", (req, res) => {
  const gamePath = path.join(__dirname, 'game.html');
  if (fs.existsSync(gamePath)) {
    res.sendFile(gamePath);
  } else {
    // Fallback if game.html doesn't exist
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Scratch & Win</title></head>
      <body>
        <h1>Game Loading...</h1>
        <p>Check if game.html exists in the project root.</p>
        <a href="/api/status">Check API Status</a>
      </body>
      </html>
    `);
  }
});

// Route for other HTML files
app.get("/*.html", (req, res) => {
  const filePath = path.join(__dirname, req.path);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send(`<h1>Page not found: ${req.path}</h1>`);
  }
});

// API status check
app.get("/api/status", (req, res) => {
  res.json({ 
    success: true, 
    message: "Scratch & Win API", 
    database: "In-memory (Vercel)",
    time: new Date().toISOString(),
    files: fs.readdirSync(__dirname).filter(f => f.endsWith('.html'))
  });
});

// ========== GAME LOGIC (5 wins in 25 games) ==========
class GameLogic {
  constructor() {
    this.sections = {
      'A': { minStake: 150, maxWin: 2250 },
      'B': { minStake: 300, maxWin: 7500 },
      'C': { minStake: 500, maxWin: 10000 },
      'D': { minStake: 1000, maxWin: 15000 }
    };
    
    // Track win counts per user
    this.userGameStats = {};
    
    this.probabilities = {
      demo: {
        'A': { winChance: 0.4, amounts: [150, 300, 450, 600, 750] },
        'B': { winChance: 0.4, amounts: [300, 600, 900, 1200, 1500] },
        'C': { winChance: 0.4, amounts: [500, 1000, 1500, 2000, 2500] },
        'D': { winChance: 0.4, amounts: [1000, 2000, 3000, 4000, 5000] }
      },
      real: {
        'A': { 
          baseWinChance: 0.2,
          amounts: [150, 300, 450, 600, 750, 900]
        },
        'B': { 
          baseWinChance: 0.2,
          amounts: [300, 600, 900, 1200]
        },
        'C': { 
          baseWinChance: 0.2,
          amounts: [500, 1000, 1500, 2000, 2500]
        },
        'D': { 
          baseWinChance: 0.2,
          amounts: [350, 400, 500, 700, 1000, 1300, 1500, 1700, 2000]
        }
      }
    };
  }

  getSectionFromStake(stake) {
    for (const [section, data] of Object.entries(this.sections)) {
      if (stake === data.minStake) return section;
    }
    return 'A';
  }

  // Smart probability system - ensures ~5 wins in 25 games
  getDynamicWinChance(userId, mode) {
    if (!this.userGameStats[userId]) {
      this.userGameStats[userId] = {
        gamesPlayed: 0,
        wins: 0,
        lastWinGame: 0
      };
    }
    
    const stats = this.userGameStats[userId];
    
    if (mode === 'demo') return 0.4;
    
    const gamesSinceLastWin = stats.gamesPlayed - stats.lastWinGame;
    const targetWins = Math.floor(stats.gamesPlayed * 0.2);
    
    let dynamicChance = 0.2;
    
    if (gamesSinceLastWin >= 5) {
      dynamicChance = Math.min(0.8, 0.2 + (gamesSinceLastWin * 0.1));
    }
    
    if (stats.wins > targetWins + 1) {
      dynamicChance = Math.max(0.05, 0.2 - ((stats.wins - targetWins) * 0.05));
    }
    
    return dynamicChance;
  }

  generateGrid(section, mode = 'demo') {
    const sectionProb = this.probabilities[mode][section];
    const grid = [];
    
    for (let i = 0; i < 9; i++) {
      const randomIndex = Math.floor(Math.random() * sectionProb.amounts.length);
      grid.push(sectionProb.amounts[randomIndex]);
    }
    
    return grid;
  }

  checkForWin(grid) {
    const counts = {};
    grid.forEach(amount => { 
      counts[amount] = (counts[amount] || 0) + 1; 
    });
    
    for (const [amount, count] of Object.entries(counts)) {
      if (count >= 3) {
        const amountNum = parseInt(amount);
        const indices = [];
        grid.forEach((value, index) => { 
          if (value === amountNum) indices.push(index); 
        });
        
        return { 
          isWin: true, 
          winAmount: amountNum,
          matchingIndices: indices.slice(0, 3) 
        };
      }
    }
    return { isWin: false, winAmount: 0, matchingIndices: [] };
  }

  determineWin(userId, section, mode) {
    const dynamicChance = this.getDynamicWinChance(userId, mode);
    const willWin = Math.random() < dynamicChance;
    
    if (!this.userGameStats[userId]) {
      this.userGameStats[userId] = {
        gamesPlayed: 0,
        wins: 0,
        lastWinGame: 0
      };
    }
    
    this.userGameStats[userId].gamesPlayed++;
    
    if (willWin) {
      this.userGameStats[userId].wins++;
      this.userGameStats[userId].lastWinGame = this.userGameStats[userId].gamesPlayed;
    }
    
    return willWin;
  }

  applyProbabilityToGrid(grid, userId, section, mode) {
    if (this.determineWin(userId, section, mode)) {
      const amounts = this.probabilities[mode][section].amounts;
      let winAmount;
      
      if (mode === 'real') {
        const rand = Math.random();
        if (rand < 0.6) {
          winAmount = amounts[Math.floor(Math.random() * Math.min(4, amounts.length))];
        } else if (rand < 0.9) {
          const start = Math.max(0, Math.floor(amounts.length / 2) - 2);
          const end = Math.min(amounts.length, start + 4);
          const mediumAmounts = amounts.slice(start, end);
          winAmount = mediumAmounts[Math.floor(Math.random() * mediumAmounts.length)];
        } else {
          const largeAmounts = amounts.slice(-2);
          winAmount = largeAmounts[Math.floor(Math.random() * largeAmounts.length)];
        }
      } else {
        winAmount = amounts[Math.floor(Math.random() * amounts.length)];
      }
      
      const positions = [0, 1, 2, 3, 4, 5, 6, 7, 8];
      for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
      }
      
      grid[positions[0]] = winAmount;
      grid[positions[1]] = winAmount;
      grid[positions[2]] = winAmount;
    }
    
    return grid;
  }
}

const gameLogic = new GameLogic();

// ========== AUTH MIDDLEWARE ==========
const authMiddleware = (req, res, next) => {
  const authHeader = req.header("Authorization");
  if (!authHeader) return res.status(401).json({ success: false, message: "No token" });
  const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;
  try {
    const secret = process.env.JWT_SECRET || "dev_secret_123";
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// ========== ADMIN ACCOUNTS INITIALIZATION ==========
async function initializeAdminAccounts() {
  try {
    await db.read();
    
    const adminAccounts = [
      { username: "admin", password: "admin123", name: "Main Admin", phone: "0000000000" },
      { username: "manager", password: "manager123", name: "Manager", phone: "0000000001" },
      { username: "support", password: "support123", name: "Support", phone: "0000000002" }
    ];
    
    let createdCount = 0;
    
    for (const adminAccount of adminAccounts) {
      const existingAdmin = db.data.users.find(u => u.username === adminAccount.username);
      
      if (!existingAdmin) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(adminAccount.password, salt);
        
        const adminUser = {
          id: `admin-${Date.now()}-${adminAccount.username}`,
          phone: adminAccount.phone,
          username: adminAccount.username,
          password: hashedPassword,
          realBalance: 0,
          demoBalance: 0,
          depositTier: null,
          demoBonus: 0,
          currentBalanceMode: 'demo',
          totalStakedReal: 0,
          totalStakedDemo: 0,
          totalWonReal: 0,
          totalWonDemo: 0,
          bankName: '',
          accountName: '',
          accountNumber: '',
          withdrawalUnlocked: false,
          gamesPlayed: 0,
          isAdmin: true,
          adminRole: adminAccount.name,
          createdAt: new Date().toISOString()
        };
        
        db.data.users.push(adminUser);
        createdCount++;
      } else if (!existingAdmin.isAdmin) {
        existingAdmin.isAdmin = true;
        existingAdmin.adminRole = adminAccount.name;
      }
    }
    
    if (createdCount > 0) {
      await db.write();
    }
    
    console.log(`✅ Admin accounts initialized. Created: ${createdCount}`);
  } catch (error) {
    console.error("❌ Error initializing admin accounts:", error);
  }
}

// Call initialization
initializeAdminAccounts();

// ========== ROUTES ==========
app.get("/", (req, res) => {
  res.json({ success: true, message: "Scratch & Win API", database: "In-memory (Vercel)" });
});

// REGISTER
app.post("/auth/register", async (req, res) => {
  try {
    await db.read();
    const { phone, username, password } = req.body;
    const existing = db.data.users.find(u => u.phone === phone || u.username === username);
    if (existing) return res.status(400).json({ success: false, message: "User exists" });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = {
      id: Date.now().toString(),
      phone, username, password: hashedPassword,
      realBalance: 0, demoBalance: 46800,
      depositTier: null, demoBonus: 0,
      currentBalanceMode: 'demo',
      totalStakedReal: 0, totalStakedDemo: 0,
      totalWonReal: 0, totalWonDemo: 0,
      bankName: '', accountName: '', accountNumber: '',
      withdrawalUnlocked: false, gamesPlayed: 0,
      isAdmin: false,
      createdAt: new Date().toISOString()
    };
    db.data.users.push(user);
    await db.write();
    const token = jwt.sign({ id: user.id, username }, process.env.JWT_SECRET || "dev_secret_123", { expiresIn: "30d" });
    res.json({ success: true, message: "Registered", token, user: { id: user.id, username, balance: 0, demoBalance: 46800 } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// LOGIN
app.post("/auth/login", async (req, res) => {
  try {
    await db.read();
    const { username, password } = req.body;
    const user = db.data.users.find(u => u.username === username);
    if (!user) return res.status(400).json({ success: false, message: "Invalid credentials" });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: "Invalid credentials" });
    const token = jwt.sign({ id: user.id, username }, process.env.JWT_SECRET || "dev_secret_123", { expiresIn: "30d" });
    res.json({ success: true, message: "Logged in", token, user: { id: user.id, username, balance: user.realBalance, demoBalance: user.demoBalance } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET USER INFO
app.get("/user/me", authMiddleware, async (req, res) => {
  try {
    await db.read();
    const user = db.data.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({
      success: true,
      user: {
        id: user.id, username: user.username,
        balance: user.realBalance || 0,
        demoBalance: user.demoBalance || 46800,
        depositTier: user.depositTier,
        currentBalanceMode: user.currentBalanceMode || 'demo',
        totalStakedReal: user.totalStakedReal || 0,
        totalStakedDemo: user.totalStakedDemo || 0
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// CHECK TIER
app.get("/deposit/has-tier", authMiddleware, async (req, res) => {
  try {
    await db.read();
    const user = db.data.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, hasTier: !!user.depositTier, tier: user.depositTier, demoBalance: user.demoBalance || 46800 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// SELECT TIER
app.post("/deposit/select-tier", authMiddleware, async (req, res) => {
  try {
    const { tier } = req.body;
    const bonuses = { 1000: 50000, 5000: 250000, 10000: 500000 };
    if (![1000, 5000, 10000].includes(tier)) return res.status(400).json({ success: false, message: "Invalid tier" });
    await db.read();
    const userIndex = db.data.users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    if (db.data.users[userIndex].depositTier) return res.status(400).json({ success: false, message: "Tier already selected" });
    db.data.users[userIndex].depositTier = tier;
    db.data.users[userIndex].demoBonus = bonuses[tier];
    db.data.users[userIndex].demoBalance = bonuses[tier];
    await db.write();
    res.json({ success: true, message: "Tier selected", demoBonus: bonuses[tier], currentBalance: bonuses[tier] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// SWITCH BALANCE MODE
app.post("/user/switch-balance-mode", authMiddleware, async (req, res) => {
  try {
    const { mode } = req.body;
    if (!['demo', 'real'].includes(mode)) return res.status(400).json({ success: false, message: "Invalid mode" });
    await db.read();
    const userIndex = db.data.users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    db.data.users[userIndex].currentBalanceMode = mode;
    await db.write();
    const currentBalance = mode === 'demo' ? db.data.users[userIndex].demoBalance : db.data.users[userIndex].realBalance;
    res.json({ success: true, message: `Switched to ${mode}`, mode, currentBalance });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// PLAY GAME
app.post("/game/play", authMiddleware, async (req, res) => {
  try {
    const { stake, mode = 'demo' } = req.body;
    if (![150, 300, 500, 1000].includes(stake)) return res.status(400).json({ success: false, message: "Invalid stake" });
    await db.read();
    const userIndex = db.data.users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    const user = db.data.users[userIndex];
    const balance = mode === 'demo' ? user.demoBalance : user.realBalance;
    if (balance < stake) return res.status(400).json({ success: false, message: `Insufficient ${mode} balance` });
    const section = gameLogic.getSectionFromStake(stake);
    let grid = gameLogic.generateGrid(section, mode);
    grid = gameLogic.applyProbabilityToGrid(grid, user.id, section, mode);
    const result = gameLogic.checkForWin(grid);
    
    if (mode === 'demo') {
      db.data.users[userIndex].demoBalance -= stake;
      db.data.users[userIndex].totalStakedDemo = (user.totalStakedDemo || 0) + stake;
      if (result.isWin) {
        db.data.users[userIndex].demoBalance += result.winAmount;
        db.data.users[userIndex].totalWonDemo = (user.totalWonDemo || 0) + result.winAmount;
      }
    } else {
      db.data.users[userIndex].realBalance -= stake;
      db.data.users[userIndex].totalStakedReal = (user.totalStakedReal || 0) + stake;
      if (result.isWin) {
        db.data.users[userIndex].realBalance += result.winAmount;
        db.data.users[userIndex].totalWonReal = (user.totalWonReal || 0) + result.winAmount;
      }
    }
    db.data.users[userIndex].gamesPlayed = (user.gamesPlayed || 0) + 1;
    db.data.users[userIndex].lastGamePlayed = new Date().toISOString();

    const game = {
      id: Date.now().toString(),
      userId: user.id,
      stake,
      mode: mode,
      winAmount: result.winAmount,
      result: result.isWin ? "win" : "loss",
      gridValues: grid,
      newBalance: mode === 'demo' ? 
        (db.data.users[userIndex].demoBalance) : 
        (db.data.users[userIndex].realBalance),
      scratchCount: 0,
      createdAt: new Date().toISOString(),
      matchingIndices: result.matchingIndices || []
    };

    db.data.games.push(game);
    await db.write();
    res.json({
      success: true,
      message: result.isWin ? "You won! 🎉" : "Try again!",
      winAmount: result.winAmount,
      isWin: result.isWin,
      gridValues: grid,
      matchingIndices: result.matchingIndices,
      newBalance: mode === 'demo' ? db.data.users[userIndex].demoBalance : db.data.users[userIndex].realBalance
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Game error" });
  }
});

// GAME HISTORY
app.get("/user/game-history", authMiddleware, async (req, res) => {
  try {
    await db.read();
    
    const userGames = db.data.games
      .filter(g => g.userId === req.user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50);
    
    const history = userGames.map(game => ({
      id: game.id,
      stake: game.stake,
      mode: game.mode || 'demo',
      gridValues: game.gridValues || [],
      winAmount: game.winAmount || 0,
      isWin: game.result === "win",
      newBalance: game.newBalance || 0,
      timestamp: game.createdAt,
      matchingIndices: game.matchingIndices || []
    }));
    
    res.json({ 
      success: true, 
      count: history.length, 
      history: history 
    });
  } catch (error) {
    console.error("Game history error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// SAVE BANK DETAILS
app.post("/user/save-bank-details", authMiddleware, async (req, res) => {
  try {
    const { bankName, accountName, accountNumber } = req.body;
    if (!bankName || !accountName || !accountNumber) return res.status(400).json({ success: false, message: "All details required" });
    await db.read();
    const userIndex = db.data.users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    db.data.users[userIndex].bankName = bankName;
    db.data.users[userIndex].accountName = accountName;
    db.data.users[userIndex].accountNumber = accountNumber;
    await db.write();
    res.json({ success: true, message: "Bank details saved" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// WITHDRAWAL REQUIREMENTS
app.get("/withdrawal/requirements", authMiddleware, async (req, res) => {
  try {
    await db.read();
    const user = db.data.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    const tier = user.depositTier || 1000;
    const requirements = {
      1000: { stakeTarget: 5000, winTarget: 3000 },
      5000: { stakeTarget: 20000, winTarget: 15000 },
      10000: { stakeTarget: 40000, winTarget: 30000 }
    };
    const reqs = requirements[tier] || requirements[1000];
    const staked = user.totalStakedReal || 0;
    const won = user.totalWonReal || 0;
    const stakeProgress = Math.min((staked / reqs.stakeTarget) * 100, 100);
    const winProgress = Math.min((won / reqs.winTarget) * 100, 100);
    const bothMet = staked >= reqs.stakeTarget && won >= reqs.winTarget;
    res.json({
      success: true,
      tier: tier,
      requirements: reqs,
      progress: {
        staked, stakeTarget: reqs.stakeTarget, stakeProgress: Math.floor(stakeProgress),
        won, winTarget: reqs.winTarget, winProgress: Math.floor(winProgress),
        bothRequirementsMet: bothMet
      },
      adminUnlocked: user.withdrawalUnlocked || false,
      canRequestWithdrawal: bothMet && (user.withdrawalUnlocked || false)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ========== ADMIN MIDDLEWARE ==========
const adminMiddleware = async (req, res, next) => {
  const authHeader = req.header("Authorization");
  if (!authHeader) return res.status(401).json({ success: false, message: "No token" });
  
  const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;
  
  try {
    const secret = process.env.JWT_SECRET || "dev_secret_123";
    const decoded = jwt.verify(token, secret);
    
    await db.read();
    const user = db.data.users.find(u => u.id === decoded.id);
    
    if (!user || !user.isAdmin) {
      return res.status(403).json({ success: false, message: "Admin only" });
    }
    
    req.admin = { ...decoded, role: user.adminRole };
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: "Invalid admin token" });
  }
};

// ========== ADMIN ROUTES ==========

// Admin login
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    await db.read();
    
    const user = db.data.users.find(u => u.username === username);
    
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }
    
    if (!user.isAdmin) {
      return res.status(403).json({ success: false, message: "Not an admin account" });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }
    
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        isAdmin: true,
        role: user.adminRole || "admin" 
      },
      process.env.JWT_SECRET || "dev_secret_123",
      { expiresIn: "8h" }
    );
    
    res.json({ 
      success: true, 
      message: "Admin login successful", 
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.adminRole || "admin"
      }
    });
    
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get all users (admin)
app.get("/api/admin/users", adminMiddleware, async (req, res) => {
  try {
    await db.read();
    const users = db.data.users.map(user => ({
      id: user.id,
      username: user.username,
      phone: user.phone,
      depositTier: user.depositTier || 1000,
      realBalance: user.realBalance || 0,
      demoBalance: user.demoBalance || 0,
      totalStakedReal: user.totalStakedReal || 0,
      totalWonReal: user.totalWonReal || 0,
      withdrawalUnlocked: user.withdrawalUnlocked || false,
      bankDetails: user.bankName ? 'Saved' : 'Not saved',
      lastGame: user.lastGamePlayed,
      createdAt: user.createdAt
    }));
    res.json({ success: true, count: users.length, users });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get eligible users for withdrawal unlock
app.get("/api/admin/eligible-users", adminMiddleware, async (req, res) => {
  try {
    await db.read();
    const eligibleUsers = [];
    const targets = {
      1000: { stakeTarget: 5000, winTarget: 3000 },
      5000: { stakeTarget: 20000, winTarget: 15000 },
      10000: { stakeTarget: 40000, winTarget: 30000 }
    };
    
    db.data.users.forEach(user => {
      const tier = user.depositTier || 1000;
      const target = targets[tier] || targets[1000];
      const staked = user.totalStakedReal || 0;
      const won = user.totalWonReal || 0;
      
      if (staked >= target.stakeTarget && won >= target.winTarget) {
        eligibleUsers.push({
          id: user.id,
          username: user.username,
          tier: tier,
          staked: staked,
          stakeTarget: target.stakeTarget,
          won: won,
          winTarget: target.winTarget,
          withdrawalUnlocked: user.withdrawalUnlocked || false
        });
      }
    });
    
    res.json({ success: true, count: eligibleUsers.length, users: eligibleUsers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Unlock withdrawal for user
app.post("/api/admin/unlock-withdrawal/:userId", adminMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;
    await db.read();
    const userIndex = db.data.users.findIndex(u => u.id === userId);
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    
    db.data.users[userIndex].withdrawalUnlocked = true;
    await db.write();
    
    res.json({ 
      success: true, 
      message: `Withdrawal unlocked for ${db.data.users[userIndex].username}`,
      user: { id: userId, username: db.data.users[userIndex].username, withdrawalUnlocked: true }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Lock withdrawal
app.post("/api/admin/lock-withdrawal/:userId", adminMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;
    await db.read();
    const userIndex = db.data.users.findIndex(u => u.id === userId);
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    
    db.data.users[userIndex].withdrawalUnlocked = false;
    await db.write();
    
    res.json({ 
      success: true, 
      message: `Withdrawal locked for ${db.data.users[userIndex].username}`,
      user: { id: userId, username: db.data.users[userIndex].username, withdrawalUnlocked: false }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get withdrawal requests
app.get("/api/admin/withdrawal-requests", adminMiddleware, async (req, res) => {
  try {
    await db.read();
    const requests = db.data.withdrawals || [];
    const fullRequests = requests.map(req => {
      const user = db.data.users.find(u => u.id === req.userId);
      return {
        requestId: req.id,
        userId: req.userId,
        username: user ? user.username : 'Unknown',
        amount: req.amount,
        bankName: req.bankName || user?.bankName || '',
        accountName: req.accountName || user?.accountName || '',
        accountNumber: req.accountNumber || user?.accountNumber || '',
        status: req.status || 'pending',
        requestedAt: req.createdAt,
        approvedAt: req.approvedAt,
        paidAt: req.paidAt,
        adminNotes: req.notes || ''
      };
    });
    
    res.json({ success: true, count: fullRequests.length, requests: fullRequests.reverse() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get user withdrawal history (for admin panel)
app.get("/api/admin/user-withdrawals/:userId", adminMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;
    await db.read();
    
    const withdrawals = db.data.withdrawals.filter(w => w.userId === userId);
    const user = db.data.users.find(u => u.id === userId);
    
    res.json({
      success: true,
      withdrawals: withdrawals.reverse(),
      user: user ? {
        username: user.username,
        realBalance: user.realBalance
      } : null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Approve withdrawal (admin) - BALANCE DEDUCTED IMMEDIATELY
app.post("/api/admin/approve-withdrawal/:requestId", adminMiddleware, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const { notes } = req.body;
    await db.read();
    
    const requestIndex = db.data.withdrawals.findIndex(r => r.id === requestId);
    if (requestIndex === -1) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }
    
    const request = db.data.withdrawals[requestIndex];
    
    if (request.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: `Withdrawal already ${request.status}` 
      });
    }
    
    const userIndex = db.data.users.findIndex(u => u.id === request.userId);
    if (userIndex === -1) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    const user = db.data.users[userIndex];
    
    if (user.realBalance < request.amount) {
      return res.status(400).json({ 
        success: false, 
        message: "User has insufficient balance" 
      });
    }
    
    db.data.users[userIndex].realBalance -= request.amount;
    
    db.data.withdrawals[requestIndex].status = 'approved';
    db.data.withdrawals[requestIndex].approvedAt = new Date().toISOString();
    db.data.withdrawals[requestIndex].notes = notes || "Approved by admin";
    
    await db.write();
    
    res.json({
      success: true,
      message: `Withdrawal approved for ${user.username}. ₦${request.amount} deducted from balance.`,
      request: { 
        id: requestId, 
        status: 'approved', 
        amount: request.amount,
        userBalance: db.data.users[userIndex].realBalance
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Reject withdrawal
app.post("/api/admin/reject-withdrawal/:requestId", adminMiddleware, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const { notes } = req.body;
    await db.read();
    
    const requestIndex = db.data.withdrawals.findIndex(r => r.id === requestId);
    if (requestIndex === -1) return res.status(404).json({ success: false, message: "Request not found" });
    
    db.data.withdrawals[requestIndex].status = 'rejected';
    db.data.withdrawals[requestIndex].notes = notes || "Rejected by admin";
    
    await db.write();
    
    res.json({
      success: true,
      message: "Withdrawal rejected",
      request: { id: requestId, status: 'rejected' }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Mark withdrawal as paid (admin) - NO BALANCE DEDUCTION (already done)
app.post("/api/admin/mark-paid/:requestId", adminMiddleware, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const { paymentProof } = req.body;
    
    await db.read();
    
    const withdrawalIndex = db.data.withdrawals.findIndex(w => w.id === requestId);
    if (withdrawalIndex === -1) {
      return res.status(404).json({ success: false, message: "Withdrawal not found" });
    }
    
    const withdrawal = db.data.withdrawals[withdrawalIndex];
    
    if (withdrawal.status !== 'approved') {
      return res.status(400).json({ 
        success: false, 
        message: "Withdrawal must be approved first" 
      });
    }
    
    db.data.withdrawals[withdrawalIndex].status = 'paid';
    db.data.withdrawals[withdrawalIndex].paidAt = new Date().toISOString();
    db.data.withdrawals[withdrawalIndex].paymentProof = paymentProof || "";
    
    await db.write();
    
    res.json({
      success: true,
      message: "Withdrawal marked as paid",
      withdrawal: db.data.withdrawals[withdrawalIndex]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get all deposit requests (admin)
app.get("/api/admin/deposit-requests", adminMiddleware, async (req, res) => {
  try {
    await db.read();
    const deposits = db.data.deposits || [];
    res.json({ success: true, count: deposits.length, requests: deposits.reverse() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Approve deposit (admin)
app.post("/api/admin/approve-deposit/:requestId", adminMiddleware, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const { notes } = req.body;
    await db.read();
    
    const depositIndex = db.data.deposits.findIndex(d => d.id === requestId);
    if (depositIndex === -1) return res.status(404).json({ success: false, message: "Deposit not found" });
    
    const deposit = db.data.deposits[depositIndex];
    const userIndex = db.data.users.findIndex(u => u.id === deposit.userId);
    
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    
    db.data.deposits[depositIndex].status = 'approved';
    db.data.deposits[depositIndex].approvedAt = new Date().toISOString();
    db.data.deposits[depositIndex].adminNotes = notes || "Approved by admin";
    
    db.data.users[userIndex].realBalance += deposit.amount;
    
    await db.write();
    
    res.json({
      success: true,
      message: `Deposit approved. ₦${deposit.amount} added to ${db.data.users[userIndex].username}'s balance.`,
      deposit: { id: requestId, status: 'approved', amount: deposit.amount }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Reject deposit (admin)
app.post("/api/admin/reject-deposit/:requestId", adminMiddleware, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const { notes } = req.body;
    await db.read();
    
    const depositIndex = db.data.deposits.findIndex(d => d.id === requestId);
    if (depositIndex === -1) return res.status(404).json({ success: false, message: "Deposit not found" });
    
    db.data.deposits[depositIndex].status = 'rejected';
    db.data.deposits[depositIndex].adminNotes = notes || "Rejected by admin";
    
    await db.write();
    
    res.json({
      success: true,
      message: "Deposit rejected",
      deposit: { id: requestId, status: 'rejected' }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ========== USER ROUTES CONTINUED ==========

// User withdrawal request - WITH BETTER VALIDATION
app.post("/withdrawal/request", authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    await db.read();
    
    const userIndex = db.data.users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    
    const user = db.data.users[userIndex];
    
    if (!user.bankName || !user.accountNumber) {
      return res.status(400).json({ success: false, message: "Save bank details first" });
    }
    
    if (!user.withdrawalUnlocked) {
      return res.status(400).json({ success: false, message: "Withdrawal not unlocked by admin" });
    }
    
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }
    
    if (amountNum < 1000) {
      return res.status(400).json({ success: false, message: "Minimum withdrawal is ₦1,000" });
    }
    
    if (amountNum > user.realBalance) {
      return res.status(400).json({ 
        success: false, 
        message: `Amount exceeds your balance of ₦${user.realBalance.toLocaleString()}` 
      });
    }
    
    const pendingWithdrawals = db.data.withdrawals.filter(w => 
      w.userId === user.id && w.status === 'pending'
    );
    
    if (pendingWithdrawals.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "You already have a pending withdrawal. Please wait for it to be processed." 
      });
    }
    
    const withdrawal = {
      id: Date.now().toString(),
      userId: user.id,
      amount: amountNum,
      status: 'pending',
      bankName: user.bankName,
      accountName: user.accountName,
      accountNumber: user.accountNumber,
      createdAt: new Date().toISOString()
    };
    
    db.data.withdrawals.push(withdrawal);
    await db.write();
    
    res.json({
      success: true,
      message: "Withdrawal request submitted",
      requestId: withdrawal.id,
      status: 'pending',
      currentBalance: user.realBalance
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get user withdrawal history
app.get("/user/withdrawal-history", authMiddleware, async (req, res) => {
  try {
    await db.read();
    const withdrawals = (db.data.withdrawals || []).filter(w => w.userId === req.user.id);
    
    res.json({ 
      success: true, 
      withdrawals: withdrawals.map(withdrawal => ({
        id: withdrawal.id,
        amount: withdrawal.amount,
        status: withdrawal.status,
        bankName: withdrawal.bankName,
        accountNumber: withdrawal.accountNumber,
        createdAt: withdrawal.createdAt,
        approvedAt: withdrawal.approvedAt,
        paidAt: withdrawal.paidAt,
        notes: withdrawal.notes
      })).reverse() 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// User deposit request
app.post("/deposit/request", authMiddleware, async (req, res) => {
  try {
    const { amount, paymentProof } = req.body;
    await db.read();
    
    const userIndex = db.data.users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    
    const deposit = {
      id: Date.now().toString(),
      userId: req.user.id,
      username: db.data.users[userIndex].username,
      amount: parseFloat(amount),
      paymentProof: paymentProof || "",
      status: 'pending',
      createdAt: new Date().toISOString(),
      approvedAt: null,
      adminNotes: ""
    };
    
    if (!db.data.deposits) db.data.deposits = [];
    db.data.deposits.push(deposit);
    await db.write();
    
    res.json({
      success: true,
      message: "Deposit request submitted. Admin will review.",
      requestId: deposit.id,
      status: 'pending'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get user deposit history
app.get("/user/deposit-history", authMiddleware, async (req, res) => {
  try {
    await db.read();
    const deposits = (db.data.deposits || []).filter(d => d.userId === req.user.id);
    
    res.json({ 
      success: true, 
      deposits: deposits.map(deposit => ({
        id: deposit.id,
        amount: deposit.amount,
        status: deposit.status,
        paymentProof: deposit.paymentProof,
        createdAt: deposit.createdAt,
        approvedAt: deposit.approvedAt,
        adminNotes: deposit.adminNotes
      })).reverse() 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ========== VERCEl EXPORT ==========
module.exports = app;

// Only start server if running locally
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Database: In-memory (Vercel compatible)`);
    console.log(`⚠️  WARNING: Data resets on server restart!`);
    console.log(`🌐 Open http://localhost:${PORT} in browser`);
  });
}