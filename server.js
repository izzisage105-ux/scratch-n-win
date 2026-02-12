/*
====================================================
SCRATCH & WIN — FINAL COMPLETE SERVER.JS
SUPABASE EDITION (Replaces all old route files)
====================================================
*/

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");
require("dotenv").config();

// Initialize Supabase
const supabase = require("./lib/supabase"); // Make sure this file exists!

const app = express();

// Serve static files (HTML/CSS/JS)
app.use(express.static(path.join(__dirname, "public")));

/* ===================== GLOBAL MIDDLEWARE ===================== */
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

/* ===================== AUTH MIDDLEWARE ===================== */
const authMiddleware = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ success: false, message: "No token" });

  try {
    const token = auth.replace("Bearer ", "");
    // Use a fallback secret if .env is missing (for safety)
    const secret = process.env.JWT_SECRET || "dev_secret_123";
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

const adminMiddleware = async (req, res, next) => {
  await authMiddleware(req, res, async () => {
    // Check if user is actually an admin in the database
    const { data: user } = await supabase
      .from("users")
      .select("is_admin, admin_role")
      .eq("id", req.user.id)
      .single();

    if (!user || !user.is_admin) {
      return res.status(403).json({ success: false, message: "Admin only" });
    }
    next();
  });
};

/* ===================== AUTH ROUTES ===================== */

// REGISTER
app.post("/api/auth/register", async (req, res) => {
  try {
    const { phone, username, password, referralCode } = req.body;

    if (!phone || !username || !password) {
      return res.status(400).json({ success: false, message: "All fields required" });
    }

    // 1. Check if user exists
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .or(`username.eq.${username},phone.eq.${phone}`)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ success: false, message: "Username or Phone already exists" });
    }

    // 2. Handle Referral
    let referrerId = null;
    if (referralCode) {
      const { data: referrer } = await supabase
        .from("users")
        .select("id")
        .eq("referral_code", referralCode)
        .maybeSingle();
      if (referrer) referrerId = referrer.id;
    }

    // 3. Create User
    const hashedPassword = await bcrypt.hash(password, 10);
    const newReferralCode = "REF" + Math.floor(100000 + Math.random() * 900000);

    const { data: user, error } = await supabase
      .from("users")
      .insert({
        username,
        password: hashedPassword,
        phone,
        referral_code: newReferralCode,
        referred_by: referrerId,
        real_balance: 0,
        demo_balance: 46800,
        is_admin: false
      })
      .select()
      .single();

    if (error) throw error;

    // 4. Create Referral Record if applicable
    if (referrerId) {
      await supabase.from("referrals").insert({
        referrer_id: referrerId,
        referred_user_id: user.id
      });
    }

    // 5. Generate Token
    const token = jwt.sign({ id: user.id, username }, process.env.JWT_SECRET || "dev_secret_123");
    
    res.json({ success: true, token, user: { ...user, realBalance: user.real_balance, demoBalance: user.demo_balance } });

  } catch (e) {
    console.error("Register Error:", e);
    res.status(500).json({ success: false, message: "Registration failed" });
  }
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .single();

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, username, is_admin: user.is_admin }, process.env.JWT_SECRET || "dev_secret_123");
    
    // CamelCase mapping for frontend
    const userResponse = {
        ...user,
        realBalance: user.real_balance,
        demoBalance: user.demo_balance,
        referralCode: user.referral_code,
        isAdmin: user.is_admin
    };

    res.json({ success: true, token, user: userResponse });
  } catch (e) {
    res.status(500).json({ success: false, message: "Login failed" });
  }
});

// ADMIN LOGIN
app.post("/api/admin/login", async (req, res) => {
    const { username, password } = req.body;
    const { data: user } = await supabase.from("users").select("*").eq("username", username).single();
    
    if (!user || !user.is_admin || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ success: false, message: "Unauthorized Admin" });
    }
    
    const token = jwt.sign({ id: user.id, is_admin: true }, process.env.JWT_SECRET || "dev_secret_123");
    res.json({ success: true, token });
});

/* ===================== USER DATA & TIERS ===================== */

// GET USER PROFILE
app.get("/api/user/me", authMiddleware, async (req, res) => {
  const { data: user } = await supabase.from("users").select("*").eq("id", req.user.id).single();
  
  if (!user) return res.status(404).json({ success: false, message: "User not found" });

  res.json({ 
    success: true, 
    user: {
        ...user,
        realBalance: user.real_balance,
        demoBalance: user.demo_balance,
        depositTier: user.deposit_tier,
        referralCode: user.referral_code,
        bankName: user.bank_name,
        accountNumber: user.account_number
    } 
  });
});

// CHECK TIER
app.get("/api/deposit/has-tier", authMiddleware, async (req, res) => {
  const { data: user } = await supabase.from("users").select("deposit_tier").eq("id", req.user.id).single();
  res.json({ success: true, hasTier: !!user.deposit_tier });
});

// SELECT TIER
app.post("/api/deposit/select-tier", authMiddleware, async (req, res) => {
  const { tier } = req.body;
  const bonuses = { 1000: 50000, 5000: 250000, 10000: 500000 };
  
  if (!bonuses[tier]) return res.status(400).json({ success: false, message: "Invalid tier" });

  await supabase.from("users").update({
      deposit_tier: tier,
      demo_balance: bonuses[tier] // Reset demo balance to bonus amount
  }).eq("id", req.user.id);

  res.json({ success: true, demoBonus: bonuses[tier] });
});

// SWITCH BALANCE MODE
app.post("/api/user/switch-balance-mode", authMiddleware, async (req, res) => {
    // This is mainly for frontend state, backend usually just trusts the 'mode' sent in game/play
    res.json({ success: true });
});

// SAVE BANK DETAILS
app.post("/api/user/save-bank-details", authMiddleware, async (req, res) => {
    const { bankName, accountName, accountNumber } = req.body;
    
    const { error } = await supabase.from("users").update({
        bank_name: bankName,
        account_name: accountName,
        account_number: accountNumber
    }).eq("id", req.user.id);

    if (error) return res.status(500).json({ success: false, message: "Failed to save" });
    res.json({ success: true });
});

/* ===================== GAME LOGIC ===================== */

const generateGrid = () => {
    // Generates 9 random numbers for the scratch card
    return Array.from({ length: 9 }, () => Math.floor(Math.random() * 1000) + 100);
};

// PLAY GAME
app.post("/api/game/play", authMiddleware, async (req, res) => {
  const { stake, mode } = req.body; // mode is 'real' or 'demo'
  
  const { data: user } = await supabase.from("users").select("*").eq("id", req.user.id).single();
  
  const currentBalance = mode === 'real' ? user.real_balance : user.demo_balance;
  
  if (currentBalance < stake) {
      return res.status(400).json({ success: false, message: "Insufficient balance" });
  }

  // --- GAME ALGORITHM ---
  let isWin = false;
  let gridValues = generateGrid();
  let matchingIndices = [];
  
  // Logic from your provided file: Real wins are harder
  if (mode === 'demo') {
      // 30% chance to win in demo
      if (Math.random() < 0.3) isWin = true;
  } else {
      // Real mode logic: Check plays count
      const plays = user.real_game_plays || 0;
      const wins = user.real_game_wins || 0;
      
      // Example logic: Only win if plays < 100 AND wins < 9 (prevent farming)
      // You can adjust this probability
      if (plays < 100 && wins < 9 && Math.random() < 0.15) {
          isWin = true;
      }
  }

  // If win, force grid to have 3 matching numbers
  let winAmount = 0;
  if (isWin) {
      winAmount = stake * 2; // Double money on win
      const winVal = stake; // The number that appears 3 times
      gridValues[0] = winVal; gridValues[4] = winVal; gridValues[8] = winVal; // Diagonal win
      matchingIndices = [0, 4, 8];
  }

  const newBalance = currentBalance - stake + winAmount;

  // Update Database
  const updateData = {};
  if (mode === 'real') {
      updateData.real_balance = newBalance;
      updateData.real_game_plays = (user.real_game_plays || 0) + 1;
      if (isWin) updateData.real_game_wins = (user.real_game_wins || 0) + 1;
  } else {
      updateData.demo_balance = newBalance;
  }

  await supabase.from("users").update(updateData).eq("id", user.id);

  // Save History
  await supabase.from("game_history").insert({
      user_id: user.id,
      stake,
      win_amount: winAmount,
      mode,
      result: isWin ? 'win' : 'loss',
      grid_values: gridValues,
      matching_indices: matchingIndices
  });

  res.json({
      success: true,
      isWin,
      winAmount,
      newBalance,
      gridValues,
      matchingIndices,
      totalStaked: mode === 'real' ? user.real_game_plays * stake : 0 // approx
  });
});

// GAME HISTORY
app.get("/api/user/game-history", authMiddleware, async (req, res) => {
    const { data } = await supabase.from("game_history")
        .select("*")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false })
        .limit(20);
        
    // Format for frontend
    const history = data.map(g => ({
        ...g,
        isWin: g.result === 'win',
        winAmount: g.win_amount,
        gridValues: g.grid_values,
        timestamp: g.created_at
    }));

    res.json({ success: true, history });
});

/* ===================== DEPOSITS ===================== */

// CREATE DEPOSIT REQUEST
app.post("/api/deposit/request", authMiddleware, async (req, res) => {
    const { amount, paymentProof } = req.body;
    
    await supabase.from("deposits").insert({
        user_id: req.user.id,
        username: req.user.username,
        amount,
        payment_proof: paymentProof,
        status: 'pending'
    });
    
    res.json({ success: true, message: "Deposit request created" });
});

// GET USER DEPOSIT HISTORY
app.get("/api/user/deposit-history", authMiddleware, async (req, res) => {
    const { data } = await supabase.from("deposits").select("*").eq("user_id", req.user.id).order("created_at", { ascending: false });
    // Map snake_case to CamelCase
    const deposits = data.map(d => ({ ...d, paymentProof: d.payment_proof, adminNotes: d.admin_notes, createdAt: d.created_at }));
    res.json({ success: true, deposits });
});

/* ===================== WITHDRAWALS ===================== */

// CHECK REQUIREMENTS
app.get("/api/withdrawal/requirements", authMiddleware, async (req, res) => {
    const { data: user } = await supabase.from("users").select("*").eq("id", req.user.id).single();
    
    // Logic: Target is 10x deposit tier for stake, 20x for wins (Example)
    const tier = user.deposit_tier || 1000;
    const stakeTarget = tier * 10;
    const winTarget = tier * 20; // Harder to reach
    
    // Check if unlocked
    const bothMet = (user.real_game_plays * 100) > stakeTarget; // Approximation based on plays
    
    res.json({
        success: true,
        requirements: { stakeTarget, winTarget },
        progress: { 
            stakeProgress: Math.min(100, (user.real_game_plays / 100) * 100), 
            winProgress: 50, // Placeholder logic
            bothRequirementsMet: bothMet 
        },
        adminUnlocked: user.withdrawal_unlocked
    });
});

// REQUEST WITHDRAWAL
app.post("/api/withdrawal/request", authMiddleware, async (req, res) => {
    const { amount } = req.body;
    const { data: user } = await supabase.from("users").select("*").eq("id", req.user.id).single();
    
    if (!user.withdrawal_unlocked) return res.status(400).json({ success: false, message: "Withdrawal locked by admin" });
    if (user.real_balance < amount) return res.status(400).json({ success: false, message: "Insufficient balance" });
    
    await supabase.from("withdrawals").insert({
        user_id: user.id,
        username: user.username,
        amount,
        bank_name: user.bank_name,
        account_number: user.account_number,
        account_name: user.account_name,
        status: 'pending'
    });
    
    res.json({ success: true });
});

// GET WITHDRAWAL HISTORY
app.get("/api/user/withdrawal-history", authMiddleware, async (req, res) => {
    const { data } = await supabase.from("withdrawals").select("*").eq("user_id", req.user.id).order("created_at", { ascending: false });
    const withdrawals = data.map(w => ({ 
        ...w, 
        bankName: w.bank_name, 
        accountNumber: w.account_number, 
        createdAt: w.created_at 
    }));
    res.json({ success: true, withdrawals });
});

/* ===================== ADMIN PANEL ROUTES ===================== */

// GET ALL STATS
app.get("/api/admin/stats", adminMiddleware, async (req, res) => {
    const { count: users } = await supabase.from("users").select("*", { count: 'exact', head: true });
    const { count: deposits } = await supabase.from("deposits").select("*", { count: 'exact', head: true });
    const { count: withdrawals } = await supabase.from("withdrawals").select("*", { count: 'exact', head: true });
    
    res.json({ success: true, stats: { users, deposits, withdrawals } });
});

// GET ALL USERS
app.get("/api/admin/users", adminMiddleware, async (req, res) => {
    const { data } = await supabase.from("users").select("*").order("created_at", { ascending: false });
    const users = data.map(u => ({
        ...u,
        realBalance: u.real_balance,
        depositTier: u.deposit_tier,
        withdrawalUnlocked: u.withdrawal_unlocked,
        totalReferrals: 0, // You can add a separate count query if needed
        isAdmin: u.is_admin
    }));
    res.json({ success: true, users, count: users.length });
});

// GET DEPOSIT REQUESTS
app.get("/api/admin/deposit-requests", adminMiddleware, async (req, res) => {
    const { data } = await supabase.from("deposits").select("*").order("created_at", { ascending: false });
    const requests = data.map(d => ({ ...d, paymentProof: d.payment_proof, createdAt: d.created_at }));
    res.json({ success: true, requests });
});

// APPROVE DEPOSIT (Inc. Referral Bonus)
app.post("/api/admin/approve-deposit/:id", adminMiddleware, async (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;
    
    // 1. Get Deposit
    const { data: dep } = await supabase.from("deposits").select("*").eq("id", id).single();
    if (!dep || dep.status !== 'pending') return res.status(400).json({ success: false, message: "Invalid deposit" });
    
    // 2. Get User
    const { data: user } = await supabase.from("users").select("*").eq("id", dep.user_id).single();
    
    // 3. Update User Balance
    const newBalance = (user.real_balance || 0) + dep.amount;
    await supabase.from("users").update({ real_balance: newBalance }).eq("id", user.id);
    
    // 4. Handle Referral Bonus (5%)
    if (user.referred_by) {
        const bonus = dep.amount * 0.05;
        // Fetch referrer
        const { data: referrer } = await supabase.from("users").select("real_balance").eq("id", user.referred_by).single();
        if (referrer) {
            // Add bonus to referrer
            await supabase.from("users").update({ 
                real_balance: referrer.real_balance + bonus,
                total_referral_deposits: (referrer.total_referral_deposits || 0) + dep.amount 
            }).eq("id", user.referred_by);
            
            // Update Referral Record
            await supabase.from("referrals")
                .update({ status: 'completed', total_deposited: dep.amount, has_deposited: true })
                .match({ referrer_id: user.referred_by, referred_user_id: user.id });
        }
    }
    
    // 5. Update Deposit Status
    await supabase.from("deposits").update({ status: 'approved', admin_notes: notes }).eq("id", id);
    
    res.json({ success: true });
});

// REJECT DEPOSIT
app.post("/api/admin/reject-deposit/:id", adminMiddleware, async (req, res) => {
    const { notes } = req.body;
    await supabase.from("deposits").update({ status: 'rejected', admin_notes: notes }).eq("id", req.params.id);
    res.json({ success: true });
});

// GET WITHDRAWAL REQUESTS
app.get("/api/admin/withdrawal-requests", adminMiddleware, async (req, res) => {
    const { data } = await supabase.from("withdrawals").select("*").order("created_at", { ascending: false });
    const requests = data.map(w => ({ 
        ...w, 
        requestId: w.id, 
        bankName: w.bank_name,
        accountNumber: w.account_number,
        userBalance: 0, // Ideally fetch current user balance here if needed
        requestedAt: w.created_at 
    }));
    res.json({ success: true, requests });
});

// APPROVE WITHDRAWAL (Deduct Balance)
app.post("/api/admin/approve-withdrawal/:id", adminMiddleware, async (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;
    
    const { data: w } = await supabase.from("withdrawals").select("*").eq("id", id).single();
    const { data: user } = await supabase.from("users").select("real_balance").eq("id", w.user_id).single();
    
    // Deduct
    const newBal = user.real_balance - w.amount;
    await supabase.from("users").update({ real_balance: newBal }).eq("id", w.user_id);
    
    // Update Status
    await supabase.from("withdrawals").update({ status: 'approved', notes }).eq("id", id);
    
    res.json({ success: true, message: "Approved", request: { userBalance: newBal } });
});

// MARK WITHDRAWAL PAID
app.post("/api/admin/mark-paid/:id", adminMiddleware, async (req, res) => {
    const { paymentProof } = req.body;
    await supabase.from("withdrawals").update({ status: 'paid', payment_proof: paymentProof }).eq("id", req.params.id);
    res.json({ success: true });
});

// UNLOCK/LOCK USER
app.post("/api/admin/unlock-withdrawal/:userId", adminMiddleware, async (req, res) => {
    await supabase.from("users").update({ withdrawal_unlocked: true }).eq("id", req.params.userId);
    res.json({ success: true });
});

app.post("/api/admin/lock-withdrawal/:userId", adminMiddleware, async (req, res) => {
    await supabase.from("users").update({ withdrawal_unlocked: false }).eq("id", req.params.userId);
    res.json({ success: true });
});

// DELETE USER
app.delete("/api/admin/delete-user/:userId", adminMiddleware, async (req, res) => {
    const { error } = await supabase.from("users").delete().eq("id", req.params.userId);
    if (error) return res.status(500).json({ success: false, message: error.message });
    res.json({ success: true });
});

/* ===================== FRONTEND ROUTING ===================== */
// Serves auth.html for root, avoiding 404s
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "auth.html"));
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));