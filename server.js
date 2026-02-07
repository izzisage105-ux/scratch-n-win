const express = require("express");
const cors = require("cors");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const fs = require("fs");
require("dotenv").config();

const app = express();

// ========== SIMPLE IN-MEMORY DATABASE ==========
// This will keep data during server uptime
let users = [];
let games = [];
let deposits = [];
let withdrawals = [];
let referrals = [];

// ========== DATABASE WRAPPER ==========
const db = {
  // USERS
  async getUserById(id) {
    return users.find(u => u.id === id);
  },

  async getUserByUsername(username) {
    return users.find(u => u.username === username);
  },

  async getUserByPhone(phone) {
    return users.find(u => u.phone === phone);
  },

  async createUser(userData) {
    const user = { 
      id: Date.now().toString(), 
      ...userData, 
      created_at: new Date().toISOString() 
    };
    users.push(user);
    return user;
  },

  async updateUser(id, updates) {
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
      users[index] = { ...users[index], ...updates };
      return users[index];
    }
    return null;
  },

  async getAllUsers() {
    return users;
  },

  async deleteUser(id) {
    users = users.filter(u => u.id !== id);
    return true;
  },

  async getUserByReferralCode(referralCode) {
    return users.find(u => u.referral_code === referralCode);
  },

  // GAMES
  async createGame(gameData) {
    const game = { 
      id: Date.now().toString(), 
      ...gameData, 
      created_at: new Date().toISOString() 
    };
    games.push(game);
    return game;
  },

  async getUserGames(userId, limit = 50) {
    return games
      .filter(g => g.user_id === userId)
      .slice(0, limit)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async getAllGames(limit = 100) {
    return games
      .slice(0, limit)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  // DEPOSITS
  async createDeposit(depositData) {
    const deposit = { 
      id: Date.now().toString(), 
      ...depositData, 
      created_at: new Date().toISOString() 
    };
    deposits.push(deposit);
    return deposit;
  },

  async getUserDeposits(userId) {
    return deposits
      .filter(d => d.user_id === userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async getAllDeposits() {
    return deposits
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async updateDeposit(id, updates) {
    const index = deposits.findIndex(d => d.id === id);
    if (index !== -1) {
      deposits[index] = { ...deposits[index], ...updates };
      return deposits[index];
    }
    return null;
  },

  // WITHDRAWALS
  async createWithdrawal(withdrawalData) {
    const withdrawal = { 
      id: Date.now().toString(), 
      ...withdrawalData, 
      created_at: new Date().toISOString() 
    };
    withdrawals.push(withdrawal);
    return withdrawal;
  },

  async getUserWithdrawals(userId) {
    return withdrawals
      .filter(w => w.user_id === userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async getAllWithdrawals() {
    return withdrawals
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async updateWithdrawal(id, updates) {
    const index = withdrawals.findIndex(w => w.id === id);
    if (index !== -1) {
      withdrawals[index] = { ...withdrawals[index], ...updates };
      return withdrawals[index];
    }
    return null;
  },

  // REFERRALS
  async createReferral(referralData) {
    const referral = { 
      id: Date.now().toString(), 
      ...referralData, 
      joined_at: new Date().toISOString() 
    };
    referrals.push(referral);
    return referral;
  },

  async getReferralsByReferrer(referrerId) {
    return referrals
      .filter(r => r.referrer_id === referrerId)
      .sort((a, b) => new Date(b.joined_at) - new Date(a.joined_at));
  },

  async updateReferral(id, updates) {
    const index = referrals.findIndex(r => r.id === id);
    if (index !== -1) {
      referrals[index] = { ...referrals[index], ...updates };
      return referrals[index];
    }
    return null;
  }
};

// ========== CREATE ADMIN ACCOUNTS ==========
const createAdminAccounts = () => {
  console.log("👑 Checking admin accounts...");
  
  const adminAccounts = [
    { 
      username: "admin", 
      password: "admin123", 
      role: "Main Admin",
      referral_code: "ADMINREF001"
    },
    { 
      username: "manager", 
      password: "manager123", 
      role: "Manager",
      referral_code: "MANAGERREF001"
    },
    { 
      username: "support", 
      password: "support123", 
      role: "Support",
      referral_code: "SUPPORTREF001"
    }
  ];

  let createdCount = 0;
  
  for (const account of adminAccounts) {
    const existingAdmin = users.find(u => u.username === account.username);
    
    if (!existingAdmin) {
      const adminUser = {
        id: `admin_${account.username}`,
        phone: "0000000000",
        username: account.username,
        password: bcrypt.hashSync(account.password, 10),
        real_balance: 100000,
        demo_balance: 50000,
        deposit_tier: 10000,
        demo_bonus: 500000,
        current_balance_mode: 'demo',
        total_staked_real: 0,
        total_staked_demo: 0,
        total_won_real: 0,
        total_won_demo: 0,
        bank_name: 'Demo Bank',
        account_name: account.role + ' User',
        account_number: '0000000000',
        withdrawal_unlocked: true,
        games_played: 0,
        is_admin: true,
        admin_role: account.role,
        referral_code: account.referral_code,
        referred_by: null,
        total_referral_deposits: 0,
        last_game_played: null,
        created_at: new Date().toISOString()
      };
      
      users.push(adminUser);
      createdCount++;
      console.log(`✅ Created admin: ${account.username}`);
    } else {
      console.log(`✅ Admin exists: ${account.username}`);
    }
  }
  
  console.log(`\n🔑 ADMIN CREDENTIALS:`);
  console.log(`   Username: admin | Password: admin123 | Code: ADMINREF001`);
  console.log(`   Username: manager | Password: manager123 | Code: MANAGERREF001`);
  console.log(`   Username: support | Password: support123 | Code: SUPPORTREF001`);
};

// Create admins on server start
createAdminAccounts();

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
app.options('*', cors());

// ========== STATIC FILES ==========
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

if (!fs.existsSync(publicPath)) {
  console.warn("⚠️  Public folder not found! Creating it...");
  fs.mkdirSync(publicPath, { recursive: true });
}

// ========== ROUTES ==========
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
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Scratch & Win</title></head>
    <body>
      <h1>Game Loading...</h1>
      <p>Server is running with In-Memory Database</p>
      <p>Data is now persistent!</p>
      <a href="/api/status">Check API Status</a>
    </body>
    </html>
  `);
});

// API status
app.get("/api/status", async (req, res) => {
  try {
    const users = await db.getAllUsers();
    const games = await db.getAllGames(10);
    
    res.json({ 
      success: true, 
      message: "Scratch & Win API",
      database: "In-Memory (Persists during session)",
      usersCount: users.length,
      gamesCount: games.length,
      admins: users.filter(u => u.is_admin).map(a => ({
        username: a.username,
        referralCode: a.referral_code
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error getting status" });
  }
});

// ========== GAME LOGIC (SAME AS BEFORE) ==========
class GameLogic {
  constructor() {
    this.sections = {
      'A': { minStake: 150, maxWin: 2250 },
      'B': { minStake: 300, maxWin: 7500 },
      'C': { minStake: 500, maxWin: 10000 },
      'D': { minStake: 1000, maxWin: 15000 }
    };
    
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
    
    const user = await db.getUserById(decoded.id);
    
    if (!user || !user.is_admin) {
      return res.status(403).json({ success: false, message: "Admin only" });
    }
    
    req.admin = { ...decoded, role: user.admin_role };
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: "Invalid admin token" });
  }
};

// ========== API ROUTES ==========

// REGISTER WITH REFERRAL SYSTEM
app.post("/auth/register", async (req, res) => {
  try {
    const { phone, username, password, referralCode } = req.body;
    
    // VALIDATION
    if (!phone || !username || !password || !referralCode) {
      return res.status(400).json({ 
        success: false, 
        message: "All fields required: phone, username, password, referral code" 
      });
    }
    
    if (!/^\d+$/.test(phone)) {
      return res.status(400).json({ 
        success: false, 
        message: "Phone must contain only numbers" 
      });
    }
    
    if (!/^[a-z0-9_]+$/.test(username)) {
      return res.status(400).json({ 
        success: false, 
        message: "Username must be lowercase letters, numbers, or underscores only" 
      });
    }
    
    // Check if referral code exists
    let referrer = await db.getUserByReferralCode(referralCode);
    if (!referrer) {
      // Try to find any admin as default referrer
      const users = await db.getAllUsers();
      referrer = users.find(u => u.is_admin);
      if (!referrer) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid referral code. Try: ADMINREF001, MANAGERREF001, or SUPPORTREF001" 
        });
      }
    }
    
    // Check if user already exists
    const existingUser = await db.getUserByUsername(username);
    const existingPhone = await db.getUserByPhone(phone);
    
    if (existingUser || existingPhone) {
      return res.status(400).json({ 
        success: false, 
        message: "Phone or username already exists" 
      });
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Generate unique referral code for new user
    const newReferralCode = "REF" + Date.now().toString().slice(-6);
    
    const userData = {
      phone, 
      username, 
      password: hashedPassword,
      real_balance: 0, 
      demo_balance: 46800,
      deposit_tier: null, 
      demo_bonus: 0,
      current_balance_mode: 'demo',
      total_staked_real: 0, 
      total_staked_demo: 0,
      total_won_real: 0, 
      total_won_demo: 0,
      bank_name: '', 
      account_name: '', 
      account_number: '',
      withdrawal_unlocked: false, 
      games_played: 0,
      is_admin: false,
      referral_code: newReferralCode,
      referred_by: referrer.id,
      total_referral_deposits: 0
    };
    
    // Create user
    const user = await db.createUser(userData);
    
    // Create referral record
    await db.createReferral({
      referrer_id: referrer.id,
      referrer_username: referrer.username,
      referred_user_id: user.id,
      referred_username: user.username,
      referral_code: referralCode,
      has_deposited: false,
      total_deposited: 0
    });
    
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
    console.error("Registration error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// LOGIN
app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await db.getUserByUsername(username);
    
    if (!user) return res.status(400).json({ success: false, message: "Invalid credentials" });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: "Invalid credentials" });
    
    const token = jwt.sign({ id: user.id, username }, process.env.JWT_SECRET || "dev_secret_123", { expiresIn: "30d" });
    
    res.json({ 
      success: true, 
      message: "Logged in", 
      token, 
      user: { 
        id: user.id, 
        username, 
        balance: user.real_balance, 
        demoBalance: user.demo_balance,
        referralCode: user.referral_code || "N/A"
      } 
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET USER INFO
app.get("/user/me", authMiddleware, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    res.json({
      success: true,
      user: {
        id: user.id, 
        username: user.username,
        balance: user.real_balance || 0,
        demoBalance: user.demo_balance || 46800,
        depositTier: user.deposit_tier,
        currentBalanceMode: user.current_balance_mode || 'demo',
        totalStakedReal: user.total_staked_real || 0,
        totalStakedDemo: user.total_staked_demo || 0,
        referralCode: user.referral_code || "N/A",
        bankName: user.bank_name || "",
        accountName: user.account_name || "",
        accountNumber: user.account_number || "",
        withdrawalUnlocked: user.withdrawal_unlocked || false,
        gamesPlayed: user.games_played || 0
      }
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// CHECK TIER
app.get("/deposit/has-tier", authMiddleware, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    res.json({ 
      success: true, 
      hasTier: !!user.deposit_tier, 
      tier: user.deposit_tier, 
      demoBalance: user.demo_balance || 46800 
    });
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
    
    if (![1000, 5000, 10000].includes(tier)) {
      return res.status(400).json({ success: false, message: "Invalid tier" });
    }
    
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    if (user.deposit_tier) {
      return res.status(400).json({ success: false, message: "Tier already selected" });
    }
    
    await db.updateUser(user.id, {
      deposit_tier: tier,
      demo_bonus: bonuses[tier],
      demo_balance: bonuses[tier]
    });
    
    res.json({ 
      success: true, 
      message: "Tier selected", 
      demoBonus: bonuses[tier], 
      currentBalance: bonuses[tier] 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// SWITCH BALANCE MODE
app.post("/user/switch-balance-mode", authMiddleware, async (req, res) => {
  try {
    const { mode } = req.body;
    if (!['demo', 'real'].includes(mode)) {
      return res.status(400).json({ success: false, message: "Invalid mode" });
    }
    
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    await db.updateUser(user.id, { current_balance_mode: mode });
    
    const currentBalance = mode === 'demo' ? user.demo_balance : user.real_balance;
    
    res.json({ 
      success: true, 
      message: `Switched to ${mode}`, 
      mode, 
      currentBalance 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// PLAY GAME
app.post("/game/play", authMiddleware, async (req, res) => {
  try {
    const { stake, mode = 'demo' } = req.body;
    
    if (![150, 300, 500, 1000].includes(stake)) {
      return res.status(400).json({ success: false, message: "Invalid stake" });
    }
    
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    const balance = mode === 'demo' ? user.demo_balance : user.real_balance;
    if (balance < stake) {
      return res.status(400).json({ success: false, message: `Insufficient ${mode} balance` });
    }
    
    const section = gameLogic.getSectionFromStake(stake);
    let grid = gameLogic.generateGrid(section, mode);
    grid = gameLogic.applyProbabilityToGrid(grid, user.id, section, mode);
    const result = gameLogic.checkForWin(grid);
    
    // Calculate new balances
    let updates = {};
    let newBalance;
    
    if (mode === 'demo') {
      newBalance = user.demo_balance - stake;
      updates.demo_balance = newBalance;
      updates.total_staked_demo = (user.total_staked_demo || 0) + stake;
      
      if (result.isWin) {
        updates.demo_balance = newBalance + result.winAmount;
        updates.total_won_demo = (user.total_won_demo || 0) + result.winAmount;
      }
    } else {
      newBalance = user.real_balance - stake;
      updates.real_balance = newBalance;
      updates.total_staked_real = (user.total_staked_real || 0) + stake;
      
      if (result.isWin) {
        updates.real_balance = newBalance + result.winAmount;
        updates.total_won_real = (user.total_won_real || 0) + result.winAmount;
      }
    }
    
    updates.games_played = (user.games_played || 0) + 1;
    updates.last_game_played = new Date().toISOString();
    
    // Update user
    await db.updateUser(user.id, updates);
    
    // Create game record
    const game = await db.createGame({
      user_id: user.id,
      stake,
      mode: mode,
      win_amount: result.winAmount,
      result: result.isWin ? "win" : "loss",
      grid_values: grid,
      new_balance: mode === 'demo' ? 
        (updates.demo_balance) : 
        (updates.real_balance),
      scratch_count: 0,
      matching_indices: result.matchingIndices || []
    });
    
    res.json({
      success: true,
      message: result.isWin ? "You won! 🎉" : "Try again!",
      winAmount: result.winAmount,
      isWin: result.isWin,
      gridValues: grid,
      matchingIndices: result.matchingIndices,
      newBalance: mode === 'demo' ? updates.demo_balance : updates.real_balance
    });
  } catch (error) {
    console.error("Game play error:", error);
    res.status(500).json({ success: false, message: "Game error" });
  }
});

// GAME HISTORY
app.get("/user/game-history", authMiddleware, async (req, res) => {
  try {
    const games = await db.getUserGames(req.user.id, 50);
    
    const history = games.map(game => ({
      id: game.id,
      stake: game.stake,
      mode: game.mode || 'demo',
      gridValues: game.grid_values || [],
      winAmount: game.win_amount || 0,
      isWin: game.result === "win",
      newBalance: game.new_balance || 0,
      timestamp: game.created_at,
      matchingIndices: game.matching_indices || []
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
    
    if (!bankName || !accountName || !accountNumber) {
      return res.status(400).json({ success: false, message: "All details required" });
    }
    
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    await db.updateUser(user.id, {
      bank_name: bankName,
      account_name: accountName,
      account_number: accountNumber
    });
    
    res.json({ success: true, message: "Bank details saved" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// WITHDRAWAL REQUIREMENTS
app.get("/withdrawal/requirements", authMiddleware, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    const tier = user.deposit_tier || 1000;
    const requirements = {
      1000: { stakeTarget: 10000, winTarget: 30000 },
      5000: { stakeTarget: 50000, winTarget: 100000 },
      10000: { stakeTarget: 150000, winTarget: 300000 }
    };
    
    const reqs = requirements[tier] || requirements[1000];
    const staked = user.total_staked_real || 0;
    const won = user.total_won_real || 0;
    const stakeProgress = Math.min((staked / reqs.stakeTarget) * 100, 100);
    const winProgress = Math.min((won / reqs.winTarget) * 100, 100);
    const bothMet = staked >= reqs.stakeTarget && won >= reqs.winTarget;
    
    res.json({
      success: true,
      tier: tier,
      requirements: reqs,
      progress: {
        staked, 
        stakeTarget: reqs.stakeTarget, 
        stakeProgress: Math.floor(stakeProgress),
        won, 
        winTarget: reqs.winTarget, 
        winProgress: Math.floor(winProgress),
        bothRequirementsMet: bothMet
      },
      adminUnlocked: user.withdrawal_unlocked || false,
      canRequestWithdrawal: bothMet && (user.withdrawal_unlocked || false)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET USER'S REFERRAL INFO
app.get("/user/referral-info", authMiddleware, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    // Get referrals made by this user
    const referrals = await db.getReferralsByReferrer(user.id);
    
    res.json({
      success: true,
      referralCode: user.referral_code,
      referralLink: `${req.headers.origin || 'https://your-site.vercel.app'}/register?ref=${user.referral_code}`,
      totalReferrals: referrals.length,
      referrals: referrals.map(r => ({
        username: r.referred_username,
        joinedAt: r.joined_at,
        hasDeposited: r.has_deposited,
        totalDeposited: r.total_deposited
      })),
      totalReferralDeposits: user.total_referral_deposits || 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ========== ADMIN ROUTES ==========

// ADMIN LOGIN
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password required"
      });
    }

    const admin = await db.getUserByUsername(username);

    if (!admin || !admin.is_admin) {
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
        role: admin.admin_role,
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
        role: admin.admin_role
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

// Get all users (admin)
app.get("/api/admin/users", adminMiddleware, async (req, res) => {
  try {
    const users = await db.getAllUsers();
    
    const formattedUsers = await Promise.all(users.map(async (user) => {
      // Get referrer info
      let referrerName = "Direct";
      if (user.referred_by) {
        const referrer = await db.getUserById(user.referred_by);
        if (referrer) referrerName = referrer.username;
      }
      
      // Get referral count
      const referrals = await db.getReferralsByReferrer(user.id);
      
      return {
        id: user.id,
        username: user.username,
        phone: user.phone,
        depositTier: user.deposit_tier || 1000,
        realBalance: user.real_balance || 0,
        demoBalance: user.demo_balance || 0,
        totalStakedReal: user.total_staked_real || 0,
        totalWonReal: user.total_won_real || 0,
        withdrawalUnlocked: user.withdrawal_unlocked || false,
        bankDetails: user.bank_name ? 'Saved' : 'Not saved',
        lastGame: user.last_game_played,
        createdAt: user.created_at,
        referralCode: user.referral_code || "N/A",
        referredBy: referrerName,
        totalReferrals: referrals.length,
        totalReferralDeposits: user.total_referral_deposits || 0,
        isAdmin: user.is_admin || false
      };
    }));
    
    res.json({ success: true, count: formattedUsers.length, users: formattedUsers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get user's referral stats for admin
app.get("/api/admin/user-referrals/:userId", adminMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;
    
    const user = await db.getUserById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    const referrals = await db.getReferralsByReferrer(userId);
    
    res.json({
      success: true,
      user: {
        username: user.username,
        referralCode: user.referral_code,
        totalReferrals: referrals.length,
        totalReferralDeposits: user.total_referral_deposits || 0
      },
      referrals: referrals.map(r => ({
        referredUser: r.referred_username,
        joinedAt: r.joined_at,
        hasDeposited: r.has_deposited,
        totalDeposited: r.total_deposited,
        depositCount: r.total_deposited > 0 ? 1 : 0
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
    const users = await db.getAllUsers();
    const eligibleUsers = [];
    const targets = {
      1000: { stakeTarget: 10000, winTarget: 30000 },
      5000: { stakeTarget: 50000, winTarget: 100000 },
      10000: { stakeTarget: 150000, winTarget: 300000 }
    };
    
    for (const user of users) {
      const tier = user.deposit_tier || 1000;
      const target = targets[tier] || targets[1000];
      const staked = user.total_staked_real || 0;
      const won = user.total_won_real || 0;
      
      if (staked >= target.stakeTarget && won >= target.winTarget) {
        eligibleUsers.push({
          id: user.id,
          username: user.username,
          tier: tier,
          staked: staked,
          stakeTarget: target.stakeTarget,
          won: won,
          winTarget: target.winTarget,
          withdrawalUnlocked: user.withdrawal_unlocked || false
        });
      }
    }
    
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
    
    const user = await db.getUserById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    await db.updateUser(userId, { withdrawal_unlocked: true });
    
    res.json({ 
      success: true, 
      message: `Withdrawal unlocked for ${user.username}`,
      user: { id: userId, username: user.username, withdrawalUnlocked: true }
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
    
    const user = await db.getUserById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    await db.updateUser(userId, { withdrawal_unlocked: false });
    
    res.json({ 
      success: true, 
      message: `Withdrawal locked for ${user.username}`,
      user: { id: userId, username: user.username, withdrawalUnlocked: false }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get withdrawal requests
app.get("/api/admin/withdrawal-requests", adminMiddleware, async (req, res) => {
  try {
    const withdrawals = await db.getAllWithdrawals();
    
    const fullRequests = await Promise.all(withdrawals.map(async (req) => {
      const user = await db.getUserById(req.user_id);
      return {
        requestId: req.id,
        userId: req.user_id,
        username: user ? user.username : 'Unknown',
        amount: req.amount,
        bankName: req.bank_name || user?.bank_name || '',
        accountName: req.account_name || user?.account_name || '',
        accountNumber: req.account_number || user?.account_number || '',
        status: req.status || 'pending',
        requestedAt: req.created_at,
        approvedAt: req.approved_at,
        paidAt: req.paid_at,
        adminNotes: req.notes || ''
      };
    }));
    
    res.json({ success: true, count: fullRequests.length, requests: fullRequests });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Approve withdrawal (admin)
app.post("/api/admin/approve-withdrawal/:requestId", adminMiddleware, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const { notes } = req.body;
    
    const withdrawal = await db.updateWithdrawal(requestId, {
      status: 'approved',
      approved_at: new Date().toISOString(),
      notes: notes || "Approved by admin"
    });
    
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }
    
    // Deduct balance from user
    const user = await db.getUserById(withdrawal.user_id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    if (user.real_balance < withdrawal.amount) {
      return res.status(400).json({ 
        success: false, 
        message: "User has insufficient balance" 
      });
    }
    
    await db.updateUser(user.id, {
      real_balance: user.real_balance - withdrawal.amount
    });
    
    res.json({
      success: true,
      message: `Withdrawal approved for ${user.username}. ₦${withdrawal.amount} deducted from balance.`,
      request: { 
        id: requestId, 
        status: 'approved', 
        amount: withdrawal.amount
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
    
    const withdrawal = await db.updateWithdrawal(requestId, {
      status: 'rejected',
      notes: notes || "Rejected by admin"
    });
    
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }
    
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

// Mark withdrawal as paid
app.post("/api/admin/mark-paid/:requestId", adminMiddleware, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const { paymentProof } = req.body;
    
    const withdrawal = await db.updateWithdrawal(requestId, {
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_proof: paymentProof || ""
    });
    
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: "Withdrawal not found" });
    }
    
    res.json({
      success: true,
      message: "Withdrawal marked as paid",
      withdrawal: withdrawal
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get all deposit requests
app.get("/api/admin/deposit-requests", adminMiddleware, async (req, res) => {
  try {
    const deposits = await db.getAllDeposits();
    res.json({ success: true, count: deposits.length, requests: deposits });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Approve deposit with referral tracking
app.post("/api/admin/approve-deposit/:requestId", adminMiddleware, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const { notes } = req.body;
    
    const deposit = await db.updateDeposit(requestId, {
      status: 'approved',
      approved_at: new Date().toISOString(),
      admin_notes: notes || "Approved by admin"
    });
    
    if (!deposit) {
      return res.status(404).json({ success: false, message: "Deposit not found" });
    }
    
    // Add balance to user
    const user = await db.getUserById(deposit.user_id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    await db.updateUser(user.id, {
      real_balance: (user.real_balance || 0) + deposit.amount
    });
    
    // 🔥 REFERRAL TRACKING
    if (user.referred_by) {
      // Find referrer
      const referrer = await db.getUserById(user.referred_by);
      if (referrer) {
        // Update referrer's total referral deposits
        await db.updateUser(referrer.id, {
          total_referral_deposits: (referrer.total_referral_deposits || 0) + deposit.amount
        });
        
        // Update referral record
        const referrals = await db.getReferralsByReferrer(referrer.id);
        const userReferral = referrals.find(r => r.referred_user_id === user.id);
        
        if (userReferral) {
          await db.updateReferral(userReferral.id, {
            has_deposited: true,
            total_deposited: (userReferral.total_deposited || 0) + deposit.amount
          });
        }
      }
    }
    
    res.json({
      success: true,
      message: `Deposit approved. ₦${deposit.amount} added to ${user.username}'s balance.`,
      deposit: { id: requestId, status: 'approved', amount: deposit.amount }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Reject deposit
app.post("/api/admin/reject-deposit/:requestId", adminMiddleware, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const { notes } = req.body;
    
    const deposit = await db.updateDeposit(requestId, {
      status: 'rejected',
      admin_notes: notes || "Rejected by admin"
    });
    
    if (!deposit) {
      return res.status(404).json({ success: false, message: "Deposit not found" });
    }
    
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

// DELETE USER ROUTE
app.delete("/api/admin/delete-user/:userId", adminMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;
    
    const user = await db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    if (user.is_admin) {
      return res.status(400).json({ success: false, message: "Cannot delete admin accounts" });
    }
    
    await db.deleteUser(userId);
    
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

// ========== USER ROUTES CONTINUED ==========

// User withdrawal request
app.post("/withdrawal/request", authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    if (!user.bank_name || !user.account_number) {
      return res.status(400).json({ success: false, message: "Save bank details first" });
    }
    
    if (!user.withdrawal_unlocked) {
      return res.status(400).json({ success: false, message: "Withdrawal not unlocked by admin" });
    }
    
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }
    
    if (amountNum < 1000) {
      return res.status(400).json({ success: false, message: "Minimum withdrawal is ₦1,000" });
    }
    
    if (amountNum > user.real_balance) {
      return res.status(400).json({ 
        success: false, 
        message: `Amount exceeds your balance of ₦${user.real_balance.toLocaleString()}` 
      });
    }
    
    // Check for pending withdrawals
    const withdrawals = await db.getUserWithdrawals(user.id);
    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending');
    
    if (pendingWithdrawals.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "You already have a pending withdrawal. Please wait for it to be processed." 
      });
    }
    
    const withdrawal = await db.createWithdrawal({
      user_id: user.id,
      amount: amountNum,
      status: 'pending',
      bank_name: user.bank_name,
      account_name: user.account_name,
      account_number: user.account_number
    });
    
    res.json({
      success: true,
      message: "Withdrawal request submitted",
      requestId: withdrawal.id,
      status: 'pending',
      currentBalance: user.real_balance
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get user withdrawal history
app.get("/user/withdrawal-history", authMiddleware, async (req, res) => {
  try {
    const withdrawals = await db.getUserWithdrawals(req.user.id);
    
    res.json({ 
      success: true, 
      withdrawals: withdrawals.map(withdrawal => ({
        id: withdrawal.id,
        amount: withdrawal.amount,
        status: withdrawal.status,
        bankName: withdrawal.bank_name,
        accountNumber: withdrawal.account_number,
        createdAt: withdrawal.created_at,
        approvedAt: withdrawal.approved_at,
        paidAt: withdrawal.paid_at,
        notes: withdrawal.notes
      }))
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
    
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    const deposit = await db.createDeposit({
      user_id: user.id,
      username: user.username,
      amount: parseFloat(amount),
      payment_proof: paymentProof || "",
      status: 'pending'
    });
    
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
    const deposits = await db.getUserDeposits(req.user.id);
    
    res.json({ 
      success: true, 
      deposits: deposits.map(deposit => ({
        id: deposit.id,
        amount: deposit.amount,
        status: deposit.status,
        paymentProof: deposit.payment_proof,
        createdAt: deposit.created_at,
        approvedAt: deposit.approved_at,
        adminNotes: deposit.admin_notes
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ========== SIMPLE FILE PERSISTENCE ==========
const dataFile = path.join(__dirname, 'data.json');

// Load existing data on startup
if (fs.existsSync(dataFile)) {
  try {
    const savedData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    users = savedData.users || [];
    games = savedData.games || [];
    deposits = savedData.deposits || [];
    withdrawals = savedData.withdrawals || [];
    referrals = savedData.referrals || [];
    console.log(`📊 Loaded ${users.length} users, ${games.length} games from file`);
  } catch (e) {
    console.log("⚠️  Could not load saved data");
  }
}

// Save data every 30 seconds
setInterval(() => {
  const data = {
    users,
    games,
    deposits,
    withdrawals,
    referrals,
    lastSaved: new Date().toISOString()
  };
  
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  console.log(`💾 Saved ${users.length} users, ${games.length} games to file`);
}, 30000);

// ========== VERCEl EXPORT ==========
module.exports = app;

// Only start server if running locally
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Database: In-Memory with File Backup`);
    console.log(`✅ Data is now persistent!`);
    console.log(`🔑 ADMIN CREDENTIALS:`);
    console.log(`   Username: admin | Password: admin123 | Referral Code: ADMINREF001`);
    console.log(`   Username: manager | Password: manager123 | Referral Code: MANAGERREF001`);
    console.log(`   Username: support | Password: support123 | Referral Code: SUPPORTREF001`);
    console.log(`🌐 Open http://localhost:${PORT} in browser`);
  });
}