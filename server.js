const express = require("express");
const cors = require("cors");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const fs = require("fs");
require("dotenv").config();

const app = express();

/// ========== IN-MEMORY DATABASE FOR VERCEL ==========
// On Vercel, file system is ephemeral. Use memory storage.
let memoryDb = {
  users: [],
  games: [],
  withdrawals: [],
  deposits: [],
  settings: {},
  winCounters: {},
  referrals: []
};

// Simple database wrapper for Vercel
const db = {
  data: {...memoryDb},
  
  async read() {
    // Always return current data
    return this.data;
  },
  
  async write() {
    // Nothing to save on Vercel (memory only)
    console.log("💾 Database would be saved (but Vercel can't persist files)");
    return true;
  },
  
  async forceReload() {
    return this.data;
  }
};

// ========== CREATE ADMIN ACCOUNTS ON STARTUP ==========
(async () => {
  console.log("🚀 Initializing Scratch & Win Server on Vercel");
  console.log("⚠️  WARNING: Using in-memory database (data resets on server restart)");
  
  // Always create fresh admin accounts
  const adminAccounts = [
    { 
      username: "admin", 
      password: "admin123", 
      role: "Main Admin",
      referralCode: "ADMINREF001"
    },
    { 
      username: "manager", 
      password: "manager123", 
      role: "Manager",
      referralCode: "MANAGERREF001"
    },
    { 
      username: "support", 
      password: "support123", 
      role: "Support",
      referralCode: "SUPPORTREF001"
    }
  ];
  
  console.log("🔄 Creating admin accounts...");
  
  for (const account of adminAccounts) {
    // Check if admin already exists
    const exists = db.data.users.some(u => u.username === account.username && u.isAdmin);
    
    if (!exists) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(account.password, salt);
      
      const adminUser = {
        id: "admin-" + Date.now() + "-" + account.username,
        phone: "0000000000",
        username: account.username,
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
        accountName: account.role + ' User',
        accountNumber: '0000000000',
        withdrawalUnlocked: true,
        gamesPlayed: 0,
        isAdmin: true,
        adminRole: account.role,
        referralCode: account.referralCode,
        referredBy: null,
        referrals: [],
        totalReferralDeposits: 0,
        createdAt: new Date().toISOString(),
        lastGamePlayed: null
      };
      
      db.data.users.push(adminUser);
      console.log(`✅ Created admin: ${account.username} (${account.referralCode})`);
    } else {
      console.log(`✅ Admin exists: ${account.username}`);
    }
  }
  
  console.log("✅ Server ready!");
  console.log("🔑 ADMIN CREDENTIALS:");
  console.log("   Username: admin | Password: admin123 | Code: ADMINREF001");
  console.log("   Username: manager | Password: manager123 | Code: MANAGERREF001");
  console.log("   Username: support | Password: support123 | Code: SUPPORTREF001");
  console.log("📊 Total users:", db.data.users.length);
})();

// ========== MIDDLEWARE ==========
app.use(cors({
  origin: function(origin, callback) {
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());

// Handle preflight requests
app.options('*', cors());

// ========== STATIC FILES FROM PUBLIC FOLDER ==========
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Check if public folder exists
if (!fs.existsSync(publicPath)) {
  console.warn("⚠️  Public folder not found! Creating it...");
  fs.mkdirSync(publicPath, { recursive: true });
}

// ========== ROUTES ==========
// Main page - try public/game.html first, then root
app.get("/", (req, res) => {
  const pathsToTry = [
    path.join(publicPath, 'game.html'),
    path.join(publicPath, 'index.html'),
    path.join(__dirname, 'game.html'),
    path.join(__dirname, 'index.html')
  ];
  
  for (const filePath of pathsToTry) {
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }
  
  // Fallback
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Scratch & Win</title></head>
    <body>
      <h1>Game Loading...</h1>
      <p>Server is running on Vercel</p>
      <p>Admin accounts are automatically created on startup</p>
      <a href="/api/debug/database">Check Database Status</a>
    </body>
    </html>
  `);
});

// Serve HTML files from public folder
app.get("/*.html", (req, res) => {
  const filePath = path.join(publicPath, req.path);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send(`<h1>404: ${req.path} not found in public folder</h1>`);
  }
});

// API status
app.get("/api/status", async (req, res) => {
  try {
    const data = await db.read();
    
    res.json({ 
      success: true, 
      message: "Scratch & Win API", 
      database: "In-Memory Storage (Vercel)",
      storageWarning: "Data resets on server restart. For production, use MongoDB Atlas or Supabase.",
      usersCount: data.users.length,
      gamesCount: data.games.length,
      admins: data.users.filter(u => u.isAdmin).map(a => ({
        username: a.username,
        referralCode: a.referralCode
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error getting status" });
  }
});

// API root endpoint
app.get("/api", (req, res) => {
  res.json({ 
    success: true, 
    message: "Scratch & Win API", 
    database: "In-Memory Storage",
    warning: "Data is not persistent on Vercel",
    adminReferralCodes: ["ADMINREF001", "MANAGERREF001", "SUPPORTREF001"]
  });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const data = await db.read();
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'scratch-win-game',
      version: '1.0.0',
      storage: 'in-memory-vercel',
      users: data.users.length,
      games: data.games.length,
      warning: 'Data resets on server restart'
    });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
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

// ========== ADMIN MIDDLEWARE ==========
const adminMiddleware = async (req, res, next) => {
  const authHeader = req.header("Authorization");
  if (!authHeader) return res.status(401).json({ success: false, message: "No token" });
  
  const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;
  
  try {
    const secret = process.env.JWT_SECRET || "dev_secret_123";
    const decoded = jwt.verify(token, secret);
    
    const data = await db.read();
    const user = data.users.find(u => u.id === decoded.id);
    
    if (!user || !user.isAdmin) {
      return res.status(403).json({ success: false, message: "Admin only" });
    }
    
    req.admin = { ...decoded, role: user.adminRole };
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: "Invalid admin token" });
  }
};

// ========== API ROUTES ==========

// REGISTER WITH REFERRAL SYSTEM
app.post("/auth/register", async (req, res) => {
  try {
    const data = await db.read();
    const { phone, username, password, referralCode } = req.body;
    
    // VALIDATION: All 4 fields required
    if (!phone || !username || !password || !referralCode) {
      return res.status(400).json({ 
        success: false, 
        message: "All fields required: phone, username, password, referral code" 
      });
    }
    
    // VALIDATION: Phone must be only numbers
    if (!/^\d+$/.test(phone)) {
      return res.status(400).json({ 
        success: false, 
        message: "Phone must contain only numbers" 
      });
    }
    
    // VALIDATION: Username must be lowercase only
    if (!/^[a-z0-9_]+$/.test(username)) {
      return res.status(400).json({ 
        success: false, 
        message: "Username must be lowercase letters, numbers, or underscores only" 
      });
    }
    
    // Check if referral code exists
    let referrer = data.users.find(u => u.referralCode === referralCode);
    if (!referrer) {
      // Try to find any admin as default referrer
      referrer = data.users.find(u => u.isAdmin);
      if (!referrer) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid referral code. Try: ADMINREF001, MANAGERREF001, or SUPPORTREF001" 
        });
      }
    }
    
    // Check if user already exists
    const existing = data.users.find(u => u.phone === phone || u.username === username);
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: "Phone or username already exists" 
      });
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Generate unique referral code for new user
    const newReferralCode = "REF" + Date.now().toString().slice(-6);
    
    const user = {
      id: Date.now().toString(),
      phone, 
      username, 
      password: hashedPassword,
      realBalance: 0, 
      demoBalance: 46800,
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
      isAdmin: false,
      referralCode: newReferralCode,
      referredBy: referrer.id,
      referrals: [],
      totalReferralDeposits: 0,
      createdAt: new Date().toISOString()
    };
    
    // Add new user
    data.users.push(user);
    
    // Update referrer's referrals list
    const referrerIndex = data.users.findIndex(u => u.id === referrer.id);
    if (referrerIndex !== -1) {
      if (!data.users[referrerIndex].referrals) {
        data.users[referrerIndex].referrals = [];
      }
      data.users[referrerIndex].referrals.push({
        userId: user.id,
        username: user.username,
        phone: user.phone,
        joinedAt: new Date().toISOString(),
        hasDeposited: false,
        totalDeposited: 0
      });
    }
    
    // Create referral record
    if (!data.referrals) data.referrals = [];
    data.referrals.push({
      id: Date.now().toString(),
      referrerId: referrer.id,
      referrerUsername: referrer.username,
      referredUserId: user.id,
      referredUsername: user.username,
      referralCode: referralCode,
      joinedAt: new Date().toISOString(),
      hasDeposited: false,
      totalDeposited: 0
    });
    
    // Save (in memory)
    await db.write();
    
    const token = jwt.sign({ id: user.id, username }, process.env.JWT_SECRET || "dev_secret_123", { expiresIn: "30d" });
    
    res.json({ 
      success: true, 
      message: "Registered successfully with referral",
      token, 
      user: { 
        id: user.id, 
        username, 
        balance: 0, 
        demoBalance: 46800,
        referralCode: newReferralCode
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// LOGIN
app.post("/auth/login", async (req, res) => {
  try {
    const data = await db.read();
    const { username, password } = req.body;
    const user = data.users.find(u => u.username === username);
    if (!user) return res.status(400).json({ success: false, message: "Invalid credentials" });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: "Invalid credentials" });
    const token = jwt.sign({ id: user.id, username }, process.env.JWT_SECRET || "dev_secret_123", { expiresIn: "30d" });
    res.json({ success: true, message: "Logged in", token, user: { 
      id: user.id, 
      username, 
      balance: user.realBalance, 
      demoBalance: user.demoBalance,
      referralCode: user.referralCode || "N/A"
    } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET USER INFO
app.get("/user/me", authMiddleware, async (req, res) => {
  try {
    const data = await db.read();
    const user = data.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({
      success: true,
      user: {
        id: user.id, 
        username: user.username,
        balance: user.realBalance || 0,
        demoBalance: user.demoBalance || 46800,
        depositTier: user.depositTier,
        currentBalanceMode: user.currentBalanceMode || 'demo',
        totalStakedReal: user.totalStakedReal || 0,
        totalStakedDemo: user.totalStakedDemo || 0,
        referralCode: user.referralCode || "N/A", // ✅ ADDED: Referral code
        bankName: user.bankName || "", // ✅ ADDED: For bank check
        accountName: user.accountName || "", // ✅ ADDED
        accountNumber: user.accountNumber || "", // ✅ ADDED
        withdrawalUnlocked: user.withdrawalUnlocked || false, // ✅ ADDED
        gamesPlayed: user.gamesPlayed || 0 // ✅ ADDED
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
    const data = await db.read();
    const user = data.users.find(u => u.id === req.user.id);
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
    const data = await db.read();
    const userIndex = data.users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    if (data.users[userIndex].depositTier) return res.status(400).json({ success: false, message: "Tier already selected" });
    data.users[userIndex].depositTier = tier;
    data.users[userIndex].demoBonus = bonuses[tier];
    data.users[userIndex].demoBalance = bonuses[tier];
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
    const data = await db.read();
    const userIndex = data.users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    data.users[userIndex].currentBalanceMode = mode;
    await db.write();
    const currentBalance = mode === 'demo' ? data.users[userIndex].demoBalance : data.users[userIndex].realBalance;
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
    const data = await db.read();
    const userIndex = data.users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    const user = data.users[userIndex];
    const balance = mode === 'demo' ? user.demoBalance : user.realBalance;
    if (balance < stake) return res.status(400).json({ success: false, message: `Insufficient ${mode} balance` });
    const section = gameLogic.getSectionFromStake(stake);
    let grid = gameLogic.generateGrid(section, mode);
    grid = gameLogic.applyProbabilityToGrid(grid, user.id, section, mode);
    const result = gameLogic.checkForWin(grid);
    
    if (mode === 'demo') {
      data.users[userIndex].demoBalance -= stake;
      data.users[userIndex].totalStakedDemo = (user.totalStakedDemo || 0) + stake;
      if (result.isWin) {
        data.users[userIndex].demoBalance += result.winAmount;
        data.users[userIndex].totalWonDemo = (user.totalWonDemo || 0) + result.winAmount;
      }
    } else {
      data.users[userIndex].realBalance -= stake;
      data.users[userIndex].totalStakedReal = (user.totalStakedReal || 0) + stake;
      if (result.isWin) {
        data.users[userIndex].realBalance += result.winAmount;
        data.users[userIndex].totalWonReal = (user.totalWonReal || 0) + result.winAmount;
      }
    }
    data.users[userIndex].gamesPlayed = (user.gamesPlayed || 0) + 1;
    data.users[userIndex].lastGamePlayed = new Date().toISOString();

    const game = {
      id: Date.now().toString(),
      userId: user.id,
      stake,
      mode: mode,
      winAmount: result.winAmount,
      result: result.isWin ? "win" : "loss",
      gridValues: grid,
      newBalance: mode === 'demo' ? 
        (data.users[userIndex].demoBalance) : 
        (data.users[userIndex].realBalance),
      scratchCount: 0,
      createdAt: new Date().toISOString(),
      matchingIndices: result.matchingIndices || []
    };

    data.games.push(game);
    await db.write();
    res.json({
      success: true,
      message: result.isWin ? "You won! 🎉" : "Try again!",
      winAmount: result.winAmount,
      isWin: result.isWin,
      gridValues: grid,
      matchingIndices: result.matchingIndices,
      newBalance: mode === 'demo' ? data.users[userIndex].demoBalance : data.users[userIndex].realBalance
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Game error" });
  }
});

// GAME HISTORY
app.get("/user/game-history", authMiddleware, async (req, res) => {
  try {
    const data = await db.read();
    
    const userGames = data.games
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
    const data = await db.read();
    const userIndex = data.users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    data.users[userIndex].bankName = bankName;
    data.users[userIndex].accountName = accountName;
    data.users[userIndex].accountNumber = accountNumber;
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
    const data = await db.read();
    const user = data.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    const tier = user.depositTier || 1000;
    const requirements = {
      1000: { stakeTarget: 10000, winTarget: 30000 },   // Changed: 1k deposit → 10k staked, 30k won
      5000: { stakeTarget: 50000, winTarget: 100000 },  // Changed: 5k deposit → 50k staked, 100k won
      10000: { stakeTarget: 150000, winTarget: 300000 } // Changed: 10k deposit → 150k staked, 300k won
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

// GET USER'S REFERRAL INFO
app.get("/user/referral-info", authMiddleware, async (req, res) => {
  try {
    const data = await db.read();
    const user = data.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    // Get referrals made by this user
    const userReferrals = data.referrals.filter(r => r.referrerId === user.id);
    
    res.json({
      success: true,
      referralCode: user.referralCode,
      referralLink: `${req.headers.origin || 'https://your-site.vercel.app'}/register?ref=${user.referralCode}`,
      totalReferrals: userReferrals.length,
      referrals: userReferrals.map(r => ({
        username: r.referredUsername,
        joinedAt: r.joinedAt,
        hasDeposited: r.hasDeposited,
        totalDeposited: r.totalDeposited
      })),
      totalReferralDeposits: user.totalReferralDeposits || 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ========== ADMIN ROUTES ==========

// ADMIN LOGIN - SIMPLIFIED AND WORKING
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password required"
      });
    }

    await db.read();

    const admin = db.data.users.find(
      u =>
        u.username.toLowerCase() === username.toLowerCase() &&
        u.isAdmin === true
    );

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Admin account not found"
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password"
      });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        role: admin.adminRole,
        isAdmin: true
      },
      process.env.JWT_SECRET || "dev_secret_123",
      { expiresIn: "8h" }
    );

    res.json({
      success: true,
      token,
      admin: {
        username: admin.username,
        role: admin.adminRole
      }
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});


// Get all users (admin) - WITH REFERRAL FIELDS
app.get("/api/admin/users", adminMiddleware, async (req, res) => {
  try {
    const data = await db.read();
    const users = data.users.map(user => ({
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
      createdAt: user.createdAt,
      // REFERRAL FIELDS ADDED
      referralCode: user.referralCode || "N/A",
      referredBy: user.referredBy ? data.users.find(u => u.id === user.referredBy)?.username || "Unknown" : "Direct",
      totalReferrals: user.referrals?.length || 0,
      totalReferralDeposits: user.totalReferralDeposits || 0,
      isAdmin: user.isAdmin || false
    }));
    res.json({ success: true, count: users.length, users });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET USER'S REFERRAL STATS FOR ADMIN
app.get("/api/admin/user-referrals/:userId", adminMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;
    const data = await db.read();
    
    const user = data.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    const referrals = data.referrals.filter(r => r.referrerId === userId);
    
    res.json({
      success: true,
      user: {
        username: user.username,
        referralCode: user.referralCode,
        totalReferrals: referrals.length,
        totalReferralDeposits: user.totalReferralDeposits || 0
      },
      referrals: referrals.map(r => ({
        referredUser: r.referredUsername,
        joinedAt: r.joinedAt,
        hasDeposited: r.hasDeposited,
        totalDeposited: r.totalDeposited,
        depositCount: r.totalDeposited > 0 ? 1 : 0
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get eligible users for withdrawal unlock
app.get("/api/admin/eligible-users", adminMiddleware, async (req, res) => {
  try {
    const data = await db.read();
    const eligibleUsers = [];
    const targets = {
      1000: { stakeTarget: 10000, winTarget: 30000 },   // Updated
      5000: { stakeTarget: 50000, winTarget: 100000 },  // Updated
      10000: { stakeTarget: 150000, winTarget: 300000 } // Updated
    };
    
    data.users.forEach(user => {
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
    const data = await db.read();
    const userIndex = data.users.findIndex(u => u.id === userId);
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    
    data.users[userIndex].withdrawalUnlocked = true;
    await db.write();
    
    res.json({ 
      success: true, 
      message: `Withdrawal unlocked for ${data.users[userIndex].username}`,
      user: { id: userId, username: data.users[userIndex].username, withdrawalUnlocked: true }
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
    const data = await db.read();
    const userIndex = data.users.findIndex(u => u.id === userId);
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    
    data.users[userIndex].withdrawalUnlocked = false;
    await db.write();
    
    res.json({ 
      success: true, 
      message: `Withdrawal locked for ${data.users[userIndex].username}`,
      user: { id: userId, username: data.users[userIndex].username, withdrawalUnlocked: false }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get withdrawal requests
app.get("/api/admin/withdrawal-requests", adminMiddleware, async (req, res) => {
  try {
    const data = await db.read();
    const requests = data.withdrawals || [];
    const fullRequests = requests.map(req => {
      const user = data.users.find(u => u.id === req.userId);
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
    const data = await db.read();
    
    const withdrawals = data.withdrawals.filter(w => w.userId === userId);
    const user = data.users.find(u => u.id === userId);
    
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
    const data = await db.read();
    
    const requestIndex = data.withdrawals.findIndex(r => r.id === requestId);
    if (requestIndex === -1) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }
    
    const request = data.withdrawals[requestIndex];
    
    if (request.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: `Withdrawal already ${request.status}` 
      });
    }
    
    const userIndex = data.users.findIndex(u => u.id === request.userId);
    if (userIndex === -1) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    const user = data.users[userIndex];
    
    if (user.realBalance < request.amount) {
      return res.status(400).json({ 
        success: false, 
        message: "User has insufficient balance" 
      });
    }
    
    data.users[userIndex].realBalance -= request.amount;
    
    data.withdrawals[requestIndex].status = 'approved';
    data.withdrawals[requestIndex].approvedAt = new Date().toISOString();
    data.withdrawals[requestIndex].notes = notes || "Approved by admin";
    
    await db.write();
    
    res.json({
      success: true,
      message: `Withdrawal approved for ${user.username}. ₦${request.amount} deducted from balance.`,
      request: { 
        id: requestId, 
        status: 'approved', 
        amount: request.amount,
        userBalance: data.users[userIndex].realBalance
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
    const data = await db.read();
    
    const requestIndex = data.withdrawals.findIndex(r => r.id === requestId);
    if (requestIndex === -1) return res.status(404).json({ success: false, message: "Request not found" });
    
    data.withdrawals[requestIndex].status = 'rejected';
    data.withdrawals[requestIndex].notes = notes || "Rejected by admin";
    
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
    
    const data = await db.read();
    
    const withdrawalIndex = data.withdrawals.findIndex(w => w.id === requestId);
    if (withdrawalIndex === -1) {
      return res.status(404).json({ success: false, message: "Withdrawal not found" });
    }
    
    const withdrawal = data.withdrawals[withdrawalIndex];
    
    if (withdrawal.status !== 'approved') {
      return res.status(400).json({ 
        success: false, 
        message: "Withdrawal must be approved first" 
      });
    }
    
    data.withdrawals[withdrawalIndex].status = 'paid';
    data.withdrawals[withdrawalIndex].paidAt = new Date().toISOString();
    data.withdrawals[withdrawalIndex].paymentProof = paymentProof || "";
    
    await db.write();
    
    res.json({
      success: true,
      message: "Withdrawal marked as paid",
      withdrawal: data.withdrawals[withdrawalIndex]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get all deposit requests (admin)
app.get("/api/admin/deposit-requests", adminMiddleware, async (req, res) => {
  try {
    const data = await db.read();
    const deposits = data.deposits || [];
    res.json({ success: true, count: deposits.length, requests: deposits.reverse() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Approve deposit (admin) - WITH REFERRAL TRACKING
app.post("/api/admin/approve-deposit/:requestId", adminMiddleware, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const { notes } = req.body;
    const data = await db.read();
    
    const depositIndex = data.deposits.findIndex(d => d.id === requestId);
    if (depositIndex === -1) return res.status(404).json({ success: false, message: "Deposit not found" });
    
    const deposit = data.deposits[depositIndex];
    const userIndex = data.users.findIndex(u => u.id === deposit.userId);
    
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    
    data.deposits[depositIndex].status = 'approved';
    data.deposits[depositIndex].approvedAt = new Date().toISOString();
    data.deposits[depositIndex].adminNotes = notes || "Approved by admin";
    
    data.users[userIndex].realBalance += deposit.amount;
    
    // 🔥 REFERRAL TRACKING - Check if user was referred and update referral stats
    const referredUser = data.users[userIndex];
    if (referredUser && referredUser.referredBy) {
      // Find referrer
      const referrerIndex = data.users.findIndex(u => u.id === referredUser.referredBy);
      if (referrerIndex !== -1) {
        // Update referrer's total referral deposits
        data.users[referrerIndex].totalReferralDeposits = (data.users[referrerIndex].totalReferralDeposits || 0) + deposit.amount;
        
        // Update referral record
        const referralIndex = data.referrals.findIndex(r => r.referredUserId === deposit.userId);
        if (referralIndex !== -1) {
          data.referrals[referralIndex].hasDeposited = true;
          data.referrals[referralIndex].totalDeposited = (data.referrals[referralIndex].totalDeposited || 0) + deposit.amount;
        }
        
        // Update in referrer's referrals array
        if (data.users[referrerIndex].referrals) {
          const refInArray = data.users[referrerIndex].referrals.find(r => r.userId === deposit.userId);
          if (refInArray) {
            refInArray.hasDeposited = true;
            refInArray.totalDeposited = (refInArray.totalDeposited || 0) + deposit.amount;
          }
        }
      }
    }
    
    await db.write();
    
    res.json({
      success: true,
      message: `Deposit approved. ₦${deposit.amount} added to ${data.users[userIndex].username}'s balance.`,
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
    const data = await db.read();
    
    const depositIndex = data.deposits.findIndex(d => d.id === requestId);
    if (depositIndex === -1) return res.status(404).json({ success: false, message: "Deposit not found" });
    
    data.deposits[depositIndex].status = 'rejected';
    data.deposits[depositIndex].adminNotes = notes || "Rejected by admin";
    
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
    const data = await db.read();
    
    const userIndex = data.users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    
    const user = data.users[userIndex];
    
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
    
    const pendingWithdrawals = data.withdrawals.filter(w => 
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
    
    data.withdrawals.push(withdrawal);
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

// DELETE USER ROUTE
app.delete("/api/admin/delete-user/:userId", adminMiddleware, async (req, res) => {
    try {
        const userId = req.params.userId;
        const data = await db.read();
        
        const userIndex = data.users.findIndex(u => u.id === userId);
        if (userIndex === -1) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        
        const user = data.users[userIndex];
        
        // Prevent deleting admin accounts
        if (user.isAdmin) {
            return res.status(400).json({ success: false, message: "Cannot delete admin accounts" });
        }
        
        // Delete user and their data
        data.users.splice(userIndex, 1);
        data.games = data.games.filter(g => g.userId !== userId);
        data.deposits = (data.deposits || []).filter(d => d.userId !== userId);
        data.withdrawals = (data.withdrawals || []).filter(w => w.userId !== userId);
        data.referrals = (data.referrals || []).filter(r => r.referrerId !== userId && r.referredUserId !== userId);
        
        await db.write();
        
        res.json({ 
            success: true, 
            message: `User ${user.username} deleted successfully`,
            deletedUser: { id: userId, username: user.username }
        });
    } catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({ success: false, message: "Server error deleting user" });
    }
});

// Get user withdrawal history
app.get("/user/withdrawal-history", authMiddleware, async (req, res) => {
  try {
    const data = await db.read();
    const withdrawals = (data.withdrawals || []).filter(w => w.userId === req.user.id);
    
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
    const data = await db.read();
    
    const userIndex = data.users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).json({ success: false, message: "User not found" });
    
    const deposit = {
      id: Date.now().toString(),
      userId: req.user.id,
      username: data.users[userIndex].username,
      amount: parseFloat(amount),
      paymentProof: paymentProof || "",
      status: 'pending',
      createdAt: new Date().toISOString(),
      approvedAt: null,
      adminNotes: ""
    };
    
    if (!data.deposits) data.deposits = [];
    data.deposits.push(deposit);
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
    const data = await db.read();
    const deposits = (data.deposits || []).filter(d => d.userId === req.user.id);
    
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

// ========== DIAGNOSTIC ENDPOINT ==========
app.get("/api/debug/database", async (req, res) => {
  try {
    const data = await db.read();
    const admins = data.users.filter(u => u.isAdmin);
    
    res.json({
      success: true,
      environment: "Vercel Serverless",
      storageType: "In-Memory (data resets on restart)",
      totalUsers: data.users.length,
      admins: admins.map(a => ({
        username: a.username,
        referralCode: a.referralCode,
        role: a.adminRole,
        id: a.id
      })),
      allReferralCodes: data.users.map(u => u.referralCode).filter(code => code),
      availableReferralCodes: ["ADMINREF001", "MANAGERREF001", "SUPPORTREF001"],
      message: "For persistent storage, add MongoDB Atlas or Supabase database."
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== VERCEl EXPORT ==========
module.exports = app;

// Only start server if running locally
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Database: In-Memory Storage`);
    console.log(`⚠️  WARNING: Data resets on server restart`);
    console.log(`🔑 ADMIN CREDENTIALS:`);
    console.log(`   Username: admin | Password: admin123 | Referral Code: ADMINREF001`);
    console.log(`   Username: manager | Password: manager123 | Referral Code: MANAGERREF001`);
    console.log(`   Username: support | Password: support123 | Referral Code: SUPPORTREF001`);
    console.log(`🌐 Open http://localhost:${PORT} in browser`);
  });
}