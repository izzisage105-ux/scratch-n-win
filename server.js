const express = require("express");
const cors = require("cors");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const fs = require("fs");
require("dotenv").config();

const app = express();

/// ========== PERSISTENT DATABASE SETUP ==========
const DB_FILE = path.join(__dirname, "database.json");

// Initialize or load database
let memoryDb = {
  users: [],
  games: [],
  withdrawals: [],
  deposits: [],
  settings: {},
  winCounters: {},
  referrals: []
};

// Database wrapper with persistence - CORRECTED VERSION
const db = {
  data: null,
  lastReadTime: 0,
  readInterval: 5000, // Cache for 5 seconds
  
  async read() {
    // If data is cached and recent, return cached data
    if (this.data !== null && (Date.now() - this.lastReadTime) < this.readInterval) {
      return this.data;
    }
    
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, "utf8");
        const parsedData = JSON.parse(fileContent);
        
        // Merge with defaults to ensure all fields exist
        this.data = {
          users: parsedData.users || [],
          games: parsedData.games || [],
          withdrawals: parsedData.withdrawals || [],
          deposits: parsedData.deposits || [],
          settings: parsedData.settings || {},
          winCounters: parsedData.winCounters || {},
          referrals: parsedData.referrals || []
        };
        console.log("📂 Loaded database from file - Users:", this.data.users.length);
      } else {
        this.data = {...memoryDb};
        console.log("📂 Created new database file");
      }
      
      this.lastReadTime = Date.now();
    } catch (error) {
      console.error("❌ Error loading database:", error);
      this.data = {...memoryDb};
      this.lastReadTime = Date.now();
    }
    return this.data;
  },
  
  async write() {
    try {
      if (this.data === null) {
        await this.read();
      }
      
      // Create backup of existing file
      if (fs.existsSync(DB_FILE)) {
        const backupFile = DB_FILE + '.backup-' + Date.now();
        fs.copyFileSync(DB_FILE, backupFile);
      }
      
      // Write with pretty formatting
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), "utf8");
      console.log("💾 Database saved to file - Users:", this.data.users.length);
      
      // Update last read time to force fresh read next time
      this.lastReadTime = 0;
      return true;
    } catch (error) {
      console.error("❌ Error saving database:", error);
      return false;
    }
  },
  
  // Force reload from file (use sparingly)
  async forceReload() {
    this.data = null;
    this.lastReadTime = 0;
    return await this.read();
  }
};

// ========== DATABASE INTEGRITY CHECK ==========
async function checkDatabaseIntegrity() {
  console.log("🔄 Checking database integrity...");
  try {
    const data = await db.read();
    
    // Ensure all users have required fields
    let fixedCount = 0;
    data.users = data.users.map(user => {
      const fixedUser = {
        id: user.id || Date.now().toString() + Math.random().toString(36).substr(2, 9),
        phone: user.phone || "",
        username: user.username || "",
        password: user.password || "",
        realBalance: user.realBalance || 0,
        demoBalance: user.demoBalance || 46800,
        depositTier: user.depositTier || null,
        demoBonus: user.demoBonus || 0,
        currentBalanceMode: user.currentBalanceMode || 'demo',
        totalStakedReal: user.totalStakedReal || 0,
        totalStakedDemo: user.totalStakedDemo || 0,
        totalWonReal: user.totalWonReal || 0,
        totalWonDemo: user.totalWonDemo || 0,
        bankName: user.bankName || "",
        accountName: user.accountName || "",
        accountNumber: user.accountNumber || "",
        withdrawalUnlocked: user.withdrawalUnlocked || false,
        gamesPlayed: user.gamesPlayed || 0,
        isAdmin: user.isAdmin || false,
        adminRole: user.adminRole || "",
        referralCode: user.referralCode || ("REF" + Date.now().toString().slice(-6)),
        referredBy: user.referredBy || null,
        referrals: user.referrals || [],
        totalReferralDeposits: user.totalReferralDeposits || 0,
        createdAt: user.createdAt || new Date().toISOString(),
        lastGamePlayed: user.lastGamePlayed || null
      };
      
      if (JSON.stringify(user) !== JSON.stringify(fixedUser)) {
        fixedCount++;
      }
      
      return fixedUser;
    });
    
    if (fixedCount > 0) {
      console.log(`✅ Fixed ${fixedCount} user records`);
      await db.write();
    }
    
    console.log("✅ Database integrity check complete");
    return true;
  } catch (error) {
    console.error("❌ Database integrity check failed:", error);
    return false;
  }
}

// Initialize database on startup
(async () => {
  console.log("🔄 Initializing database...");
  const data = await db.read();
  
  // Run integrity check first
  await checkDatabaseIntegrity();
  
  // Create ALL admin accounts if they don't exist
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
  
  let createdCount = 0;
  
  for (const account of adminAccounts) {
    const exists = data.users.some(u => u.username === account.username && u.isAdmin);
    
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
      
      data.users.push(adminUser);
      createdCount++;
      console.log(`✅ Created admin account: ${account.username}`);
    } else {
      console.log(`✅ Admin account exists: ${account.username}`);
    }
  }
  
  if (createdCount > 0) {
    await db.write();
    console.log(`✅ Created ${createdCount} admin accounts`);
  }
  
  console.log("✅ Database ready - Total users:", data.users.length);
  console.log("📊 Admin users:", data.users.filter(u => u.isAdmin).length);
  console.log("📊 Regular users:", data.users.filter(u => !u.isAdmin).length);
  
  // Log admin credentials for debugging
  const admins = data.users.filter(u => u.isAdmin);
  admins.forEach(admin => {
    console.log(`🔑 ${admin.username} (${admin.adminRole}): ${admin.referralCode}`);
  });
  
  // Run integrity check again after 10 seconds to catch any issues
  setTimeout(() => {
    checkDatabaseIntegrity();
  }, 10000);
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
      <p>Looking in: ${publicPath}</p>
      <p>Files found: ${fs.existsSync(publicPath) ? fs.readdirSync(publicPath).join(', ') : 'No public folder'}</p>
      <a href="/api/status">API Status</a>
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
    const hasPublic = fs.existsSync(publicPath);
    const publicFiles = hasPublic ? fs.readdirSync(publicPath) : [];
    const rootFiles = fs.readdirSync(__dirname);
    
    res.json({ 
      success: true, 
      message: "Scratch & Win API", 
      database: "Persistent File Storage",
      databaseFile: DB_FILE,
      usersCount: data.users.length,
      gamesCount: data.games.length,
      publicFolder: hasPublic,
      publicFiles: publicFiles.filter(f => f.endsWith('.html')),
      rootFiles: rootFiles.filter(f => f.endsWith('.html')),
      paths: {
        publicPath: publicPath,
        rootPath: __dirname
      }
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
    database: "Persistent File Storage",
    databasePath: DB_FILE
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
      storage: 'persistent-file',
      users: data.users.length,
      games: data.games.length
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

// REGISTER WITH REFERRAL SYSTEM - ONLY THIS ONE SHOULD EXIST
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
    const referrer = data.users.find(u => u.referralCode === referralCode);
    if (!referrer) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid referral code" 
      });
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
    
    // Quick validation
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password required" });
    }
    
    const data = await db.read();
    
    // Find user - case insensitive
    const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid username or password" });
    }
    
    // Check if admin - with fallback
    if (!user.isAdmin) {
      // Special case: if username is admin/manager/support, auto-grant admin
      const adminUsernames = ["admin", "manager", "support"];
      if (adminUsernames.includes(username.toLowerCase())) {
        // Update user to admin
        const userIndex = data.users.findIndex(u => u.id === user.id);
        data.users[userIndex].isAdmin = true;
        data.users[userIndex].adminRole = username === "admin" ? "Main Admin" : 
                                         username === "manager" ? "Manager" : "Support";
        data.users[userIndex].referralCode = username.toUpperCase() + "REF001";
        await db.write();
      } else {
        return res.status(403).json({ success: false, message: "Not an admin account" });
      }
    }
    
        // DIRECT PASSWORD CHECK - FIXED
    let isMatch;
    
    // First try bcrypt compare
    try {
      isMatch = await bcrypt.compare(password, user.password);
    } catch (bcryptError) {
      console.error("❌ Bcrypt compare error:", bcryptError);
      isMatch = false;
    }
    
    // If bcrypt fails, debug and try emergency check
    if (!isMatch) {
      console.log("🔍 Bcrypt comparison failed. Debug info:");
      console.log("   Username:", username);
      console.log("   Provided password:", password);
      console.log("   Stored hash exists:", !!user.password);
      console.log("   User ID:", user.id);
      console.log("   Is admin:", user.isAdmin);
      
      // EMERGENCY FIX: If password matches known passwords, update hash
      const knownPasswords = {
        "admin": "admin123",
        "manager": "manager123", 
        "support": "support123"
      };
      
      const lowerUsername = username.toLowerCase();
      if (knownPasswords[lowerUsername] && password === knownPasswords[lowerUsername]) {
        console.log("⚠️  Emergency password match - updating hash");
        isMatch = true;
        
        // Re-hash the password properly
        try {
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash(password, salt);
          
          // Update user with proper hash
          const userIndex = data.users.findIndex(u => u.id === user.id);
          if (userIndex !== -1) {
            data.users[userIndex].password = hashedPassword;
            await db.write();
            console.log("✅ Password hash updated for", username);
          }
        } catch (hashError) {
          console.error("❌ Error updating hash:", hashError);
        }
      }
    }
    
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid username or password" });
    }
    
    // Generate token
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

// ========== EMERGENCY ADMIN RESET ==========
app.post("/api/admin/force-reset", async (req, res) => {
  try {
    const data = await db.read();
    
    // Clear all existing users except non-admins
    const nonAdmins = data.users.filter(u => !u.isAdmin);
    data.users = nonAdmins;
    
    // Create fresh admin accounts with CORRECT passwords
    const adminAccounts = [
      { username: "admin", password: "admin123", role: "Main Admin" },
      { username: "manager", password: "manager123", role: "Manager" },
      { username: "support", password: "support123", role: "Support" }
    ];
    
    for (const acc of adminAccounts) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(acc.password, salt);
      
      const adminUser = {
        id: `admin-${Date.now()}-${acc.username}`,
        phone: "0000000000",
        username: acc.username,
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
        adminRole: acc.role,
        referralCode: acc.username.toUpperCase() + "REF001",
        referredBy: null,
        referrals: [],
        totalReferralDeposits: 0,
        createdAt: new Date().toISOString(),
        lastGamePlayed: null
      };
      
      data.users.push(adminUser);
    }
    
    await db.write();
    
    res.json({
      success: true,
      message: "Admin accounts reset successfully!",
      accounts: adminAccounts.map(acc => ({
        username: acc.username,
        password: acc.password,
        role: acc.role,
        referralCode: acc.username.toUpperCase() + "REF001"
      }))
    });
    
  } catch (error) {
    console.error("Reset error:", error);
    res.status(500).json({ success: false, message: "Reset failed" });
  }
});

// ========== DEBUG ENDPOINT ==========
app.get("/api/debug/admin-check", async (req, res) => {
  try {
    const data = await db.read();
    const admins = data.users.filter(u => u.isAdmin);
    
    // Test password hashes
    const hashTests = await Promise.all(
      admins.map(async admin => {
        const knownPasswords = {
          "admin": "admin123",
          "manager": "manager123", 
          "support": "support123"
        };
        
        let passwordMatch = false;
        if (admin.password) {
          try {
            passwordMatch = await bcrypt.compare(knownPasswords[admin.username] || "", admin.password);
          } catch (e) {
            passwordMatch = false;
          }
        }
        
        return {
          username: admin.username,
          role: admin.adminRole,
          hasPassword: !!admin.password,
          passwordLength: admin.password?.length || 0,
          passwordMatch: passwordMatch,
          referralCode: admin.referralCode,
          id: admin.id
        };
      })
    );
    
    res.json({
      success: true,
      message: "Admin debug info",
      adminCount: admins.length,
      totalUsers: data.users.length,
      admins: hashTests,
      fileExists: fs.existsSync(DB_FILE),
      filePath: DB_FILE
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========== VERCEl EXPORT ==========
module.exports = app;

// Only start server if running locally
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Database: Persistent File Storage`);
    console.log(`📊 Referral System: ACTIVE`);
    console.log(`🔑 ADMIN CREDENTIALS:`);
    console.log(`   Username: admin | Password: admin123`);
    console.log(`   Username: manager | Password: manager123`);
    console.log(`   Username: support | Password: support123`);
    console.log(`🌐 Open http://localhost:${PORT} in browser`);
  });
}