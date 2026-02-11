/*
====================================================
SCRATCH & WIN — FULL SERVER.JS
SUPABASE-BACKED FULL REPLACEMENT
====================================================
*/

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const supabase = require("./lib/supabase");

const app = express();

const path = require("path");

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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

const adminMiddleware = async (req, res, next) => {
  await authMiddleware(req, res, async () => {
    const { data: user } = await supabase
      .from("users")
      .select("is_admin, admin_role")
      .eq("id", req.user.id)
      .single();

    if (!user || !user.is_admin) {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    req.admin = user;
    next();
  });
};

/* ===================== AUTH: REGISTER ===================== */
app.post("/auth/register", async (req, res) => {
  try {
    const { phone, username, password, referralCode } = req.body;

    if (!phone || !username || !password || !referralCode) {
      return res.status(400).json({ success: false, message: "All fields required" });
    }

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .or(`username.eq.${username},phone.eq.${phone}`)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ success: false, message: "User already exists" });
    }

    const { data: referrer } = await supabase
      .from("users")
      .select("id, username")
      .eq("referral_code", referralCode)
      .maybeSingle();

    if (!referrer) {
      return res.status(400).json({ success: false, message: "Invalid referral code" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const newReferralCode = "REF" + Date.now().toString().slice(-6);

    const { data: user } = await supabase
      .from("users")
      .insert({
        phone,
        username,
        password: hashed,
        referral_code: newReferralCode,
        referred_by: referrer.id,
        real_balance: 0,
        demo_balance: 46800,
        deposit_tier: null,
        demo_bonus: 0,
        current_balance_mode: "demo",
        total_staked_real: 0,
        total_staked_demo: 0,
        total_won_real: 0,
        total_won_demo: 0,
        total_referral_deposits: 0,
        withdrawal_unlocked: false,
        games_played: 0,
        is_admin: false,
        real_game_plays: 0,
        real_game_wins: 0
      })
      .select()
      .single();

    await supabase.from("referrals").insert({
      referrer_id: referrer.id,
      referrer_username: referrer.username,
      referred_user_id: user.id,
      referred_username: user.username,
      has_deposited: false,
      total_deposited: 0
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });

    res.json({ success: true, token });
  } catch (e) {
    res.status(500).json({ success: false, message: "Registration error" });
  }
});

/* ===================== AUTH: LOGIN ===================== */
app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .single();

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
    res.json({ success: true, token });
  } catch {
    res.status(500).json({ success: false, message: "Login failed" });
  }
});

/* ===================== USER PROFILE ===================== */
app.get("/user/me", authMiddleware, async (req, res) => {
  const { data: user } = await supabase
    .from("users")
    .select(`
      id, username, phone, referral_code, referred_by,
      real_balance, demo_balance, deposit_tier,
      demo_bonus, current_balance_mode,
      total_staked_real, total_staked_demo,
      total_won_real, total_won_demo,
      total_referral_deposits,
      withdrawal_unlocked, games_played,
      real_game_plays, real_game_wins,
      is_admin
    `)
    .eq("id", req.user.id)
    .single();

  res.json({ success: true, user });
});

/* ===================== BALANCE MODE SWITCH ===================== */
app.post("/user/switch-balance", authMiddleware, async (req, res) => {
  const { mode } = req.body;
  if (!["demo", "real"].includes(mode)) {
    return res.status(400).json({ success: false, message: "Invalid mode" });
  }

  await supabase
    .from("users")
    .update({ current_balance_mode: mode })
    .eq("id", req.user.id);

  res.json({ success: true });
});

/* ===================== TIER SELECTION ===================== */
app.post("/deposit/select-tier", authMiddleware, async (req, res) => {
  const { tier } = req.body;

  const tiers = {
    basic: 5000,
    silver: 15000,
    gold: 30000
  };

  if (!tiers[tier]) {
    return res.status(400).json({ success: false, message: "Invalid tier" });
  }

  await supabase
    .from("users")
    .update({
      deposit_tier: tier,
      demo_bonus: tiers[tier]
    })
    .eq("id", req.user.id);

  res.json({ success: true });
});

/* ===================== CHECK IF USER HAS TIER ===================== */
app.get("/deposit/has-tier", authMiddleware, async (req, res) => {
  const { data: user } = await supabase
    .from("users")
    .select("deposit_tier")
    .eq("id", req.user.id)
    .single();

  res.json({ success: true, hasTier: !!user.deposit_tier });
});

/* ===================== USER REFERRALS DASHBOARD ===================== */
app.get("/referrals/my", authMiddleware, async (req, res) => {
  const { data } = await supabase
    .from("referrals")
    .select("*")
    .eq("referrer_id", req.user.id);

  res.json({ success: true, referrals: data });
});

/* ===================== GAME HELPERS ===================== */
const generateGrid = () => {
  const symbols = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  return Array.from({ length: 9 }, () => symbols[Math.floor(Math.random() * symbols.length)]);
};

const checkWin = (grid) => {
  const counts = {};
  for (const s of grid) counts[s] = (counts[s] || 0) + 1;
  return Object.values(counts).some((v) => v >= 3);
};

/* ===================== PLAY GAME ===================== */
app.post("/game/play", authMiddleware, async (req, res) => {
  const { stake, mode } = req.body;

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", req.user.id)
    .single();

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  const balance =
    mode === "real" ? user.real_balance : user.demo_balance;

  if (balance < stake) {
    return res.status(400).json({ success: false, message: "Insufficient balance" });
  }

  // Generate grid ONCE
  const grid = generateGrid();
  const isMatch = checkWin(grid);

  let isWin = false;

  if (mode === "demo") {
    isWin = isMatch;
  } else {
    const plays = user.real_game_plays || 0;
    const wins = user.real_game_wins || 0;

    if (plays < 100 && wins < 9 && isMatch) {
      isWin = true;
    }
  }

  const winAmount = isWin ? stake * 2 : 0;
  const newBalance = balance - stake + winAmount;

  await supabase
    .from("users")
    .update({
      real_balance:
        mode === "real" ? newBalance : user.real_balance,
      demo_balance:
        mode === "demo" ? newBalance : user.demo_balance,
      real_game_plays:
        mode === "real" ? (user.real_game_plays || 0) + 1 : user.real_game_plays,
      real_game_wins:
        mode === "real" && isWin
          ? (user.real_game_wins || 0) + 1
          : user.real_game_wins
    })
    .eq("id", user.id);

  await supabase.from("game_history").insert({
    user_id: user.id,
    stake,
    mode,
    win_amount: winAmount,
    grid,
    result: isWin ? "win" : "loss"
  });

  res.json({
    success: true,
    grid,
    isWin,
    winAmount,
    newBalance
  });
});

/* ===================== GAME HISTORY ===================== */
app.get("/game/history", authMiddleware, async (req, res) => {
  const { data } = await supabase
    .from("game_history")
    .select("*")
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  res.json({ success: true, history: data });
});

/* ===================== CREATE DEPOSIT ===================== */
app.post("/deposit/create", authMiddleware, async (req, res) => {
  try {
    const { amount, proof } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    await supabase.from("deposits").insert({
      user_id: req.user.id,
      amount,
      proof,
      status: "pending"
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: "Deposit error" });
  }
});

/* ===================== USER DEPOSIT HISTORY ===================== */
app.get("/deposit/history", authMiddleware, async (req, res) => {
  const { data } = await supabase
    .from("deposits")
    .select("*")
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false });

  res.json({ success: true, deposits: data });
});

/* ===================== ADMIN VIEW DEPOSITS ===================== */
app.get("/admin/deposits", adminMiddleware, async (req, res) => {
  const { data } = await supabase
    .from("deposits")
    .select("*, users(username)")
    .order("created_at", { ascending: false });

  res.json({ success: true, deposits: data });
});

// ADMIN APPROVE DEPOSIT
app.post("/admin/deposits/approve/:id", adminMiddleware, async (req, res) => {
  const depositId = req.params.id;

  // Get deposit
  const { data: deposit } = await supabase
    .from("deposits")
    .select("*")
    .eq("id", depositId)
    .single();

  if (!deposit || deposit.status !== "pending") {
    return res.status(400).json({ success: false, message: "Invalid deposit" });
  }

  // Get user
  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", deposit.user_id)
    .single();

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  // Update user balance
  await supabase
    .from("users")
    .update({
      real_balance: user.real_balance + deposit.amount
    })
    .eq("id", user.id);

  // Referral reward
  if (user.referred_by) {
    const bonus = Math.floor(deposit.amount * 0.05); // 5%

    const { data: referrer } = await supabase
      .from("users")
      .select("real_balance, total_referral_deposits")
      .eq("id", user.referred_by)
      .single();

    if (referrer) {
      await supabase
        .from("users")
        .update({
          real_balance: referrer.real_balance + bonus,
          total_referral_deposits:
            (referrer.total_referral_deposits || 0) + deposit.amount
        })
        .eq("id", user.referred_by);
    }

    // Update referral record
    const { data: referral } = await supabase
      .from("referrals")
      .select("*")
      .eq("referred_user_id", user.id)
      .single();

    if (referral) {
      await supabase
        .from("referrals")
        .update({
          has_deposited: true,
          total_deposited:
            (referral.total_deposited || 0) + deposit.amount
        })
        .eq("id", referral.id);
    }
  }

  // Mark deposit approved
  await supabase
    .from("deposits")
    .update({
      status: "approved",
      approved_at: new Date().toISOString()
    })
    .eq("id", depositId);

  res.json({ success: true });
});

/* ===================== ADMIN REJECT DEPOSIT ===================== */
app.post("/admin/deposit/reject", adminMiddleware, async (req, res) => {
  const { depositId } = req.body;

  await supabase
    .from("deposits")
    .update({ status: "rejected" })
    .eq("id", depositId);

  res.json({ success: true });
});

/* ===================== SAVE BANK DETAILS ===================== */
app.post("/withdrawal/bank", authMiddleware, async (req, res) => {
  const { bank_name, account_name, account_number } = req.body;

  if (!bank_name || !account_name || !account_number) {
    return res.status(400).json({ success: false, message: "All bank fields required" });
  }

  await supabase
    .from("users")
    .update({
      bank_name,
      account_name,
      account_number
    })
    .eq("id", req.user.id);

  res.json({ success: true });
});

/* ===================== REQUEST WITHDRAWAL ===================== */
app.post("/withdrawal/request", authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", req.user.id)
      .single();

    if (!user.withdrawal_unlocked) {
      return res.status(403).json({ success: false, message: "Withdrawals locked" });
    }

    if (user.real_balance < amount) {
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }

    // prevent multiple pending withdrawals
    const { data: pending } = await supabase
      .from("withdrawals")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (pending) {
      return res.status(400).json({ success: false, message: "Pending withdrawal exists" });
    }

    await supabase.from("withdrawals").insert({
      user_id: user.id,
      amount,
      bank_name: user.bank_name,
      account_name: user.account_name,
      account_number: user.account_number,
      status: "pending"
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: "Withdrawal error" });
  }
});

/* ===================== USER WITHDRAWAL HISTORY ===================== */
app.get("/withdrawal/history", authMiddleware, async (req, res) => {
  const { data } = await supabase
    .from("withdrawals")
    .select("*")
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false });

  res.json({ success: true, withdrawals: data });
});

/* ===================== ADMIN VIEW WITHDRAWALS ===================== */
app.get("/admin/withdrawals", adminMiddleware, async (req, res) => {
  const { data } = await supabase
    .from("withdrawals")
    .select("*, users(username)")
    .order("created_at", { ascending: false });

  res.json({ success: true, withdrawals: data });
});

/* ===================== ADMIN APPROVE WITHDRAWAL ===================== */
app.post("/admin/withdrawal/approve", adminMiddleware, async (req, res) => {
  const { withdrawalId } = req.body;

  const { data: withdrawal } = await supabase
    .from("withdrawals")
    .select("*")
    .eq("id", withdrawalId)
    .single();

  if (!withdrawal || withdrawal.status !== "pending") {
    return res.status(400).json({ success: false, message: "Invalid withdrawal" });
  }

  const { data: user } = await supabase
    .from("users")
    .select("real_balance")
    .eq("id", withdrawal.user_id)
    .single();

  await supabase
    .from("users")
    .update({
      real_balance: user.real_balance - withdrawal.amount
    })
    .eq("id", withdrawal.user_id);

  await supabase
    .from("withdrawals")
    .update({ status: "approved" })
    .eq("id", withdrawal.id);

  res.json({ success: true });
});

/* ===================== ADMIN REJECT WITHDRAWAL ===================== */
app.post("/admin/withdrawal/reject", adminMiddleware, async (req, res) => {
  const { withdrawalId } = req.body;

  await supabase
    .from("withdrawals")
    .update({ status: "rejected" })
    .eq("id", withdrawalId);

  res.json({ success: true });
});

/* ===================== ADMIN LOCK / UNLOCK WITHDRAWALS ===================== */
app.post("/admin/user/withdrawal-toggle", adminMiddleware, async (req, res) => {
  const { userId, unlock } = req.body;

  await supabase
    .from("users")
    .update({ withdrawal_unlocked: unlock })
    .eq("id", userId);

  res.json({ success: true });
});

/* ===================== ADMIN LIST USERS ===================== */
app.get("/admin/users", adminMiddleware, async (req, res) => {
  const { data } = await supabase
    .from("users")
    .select(`
      id, username, phone,
      real_balance, demo_balance,
      deposit_tier, withdrawal_unlocked,
      total_referral_deposits,
      games_played,
      is_admin,
      created_at
    `)
    .order("created_at", { ascending: false });

  res.json({ success: true, users: data });
});

/* ===================== ADMIN DELETE USER ===================== */
app.post("/admin/user/delete", adminMiddleware, async (req, res) => {
  const { userId } = req.body;

  const { data: user } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", userId)
    .single();

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  if (user.is_admin) {
    return res.status(403).json({ success: false, message: "Cannot delete admin" });
  }

  await supabase.from("withdrawals").delete().eq("user_id", userId);
  await supabase.from("deposits").delete().eq("user_id", userId);
  await supabase.from("game_history").delete().eq("user_id", userId);
  await supabase.from("referrals").delete().eq("referred_user_id", userId);
  await supabase.from("users").delete().eq("id", userId);

  res.json({ success: true });
});

/* ===================== ADMIN REFERRAL STATS ===================== */
app.get("/admin/referrals", adminMiddleware, async (req, res) => {
  const { data } = await supabase
    .from("referrals")
    .select("*")
    .order("created_at", { ascending: false });

  res.json({ success: true, referrals: data });
});

/* ===================== ADMIN DASHBOARD STATS ===================== */
app.get("/admin/stats", adminMiddleware, async (req, res) => {
  const [{ count: users }, { count: deposits }, { count: withdrawals }] =
    await Promise.all([
      supabase.from("users").select("*", { count: "exact", head: true }),
      supabase.from("deposits").select("*", { count: "exact", head: true }),
      supabase.from("withdrawals").select("*", { count: "exact", head: true })
    ]);

  res.json({
    success: true,
    stats: {
      users,
      deposits,
      withdrawals
    }
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "auth.html"));
});

/* ===================== SERVER START ===================== */
const PORT = process.env.PORT || 4000;

module.exports = app;