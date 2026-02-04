const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const User = require("../models/userModel");

// Deposit tier selection (after registration/login)
router.post("/select-tier", authMiddleware, async (req, res) => {
  try {
    const { tier } = req.body;
    const validTiers = [1000, 5000, 10000];
    
    if (!validTiers.includes(tier)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid tier selected" 
      });
    }
    
    const demoBonuses = {
      1000: 50000,
      5000: 250000,
      10000: 500000
    };
    
    const user = await User.findById(req.user.id);
    
    // If user already has a tier, don't change it
    if (user.depositTier) {
      return res.status(400).json({
        success: false,
        message: "Deposit tier already selected"
      });
    }
    
    user.depositTier = tier;
    user.demoBonus = demoBonuses[tier];
    user.demoBalance = demoBonuses[tier];
    user.currentBalanceMode = 'demo';
    
    await user.save();
    
    res.json({
      success: true,
      message: "Deposit tier selected successfully",
      demoBonus: demoBonuses[tier],
      currentBalance: user.demoBalance
    });
    
  } catch (error) {
    console.error("Select tier error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

// Check if user has selected tier
router.get("/has-tier", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    res.json({
      success: true,
      hasTier: !!user.depositTier,
      tier: user.depositTier,
      demoBalance: user.demoBalance
    });
    
  } catch (error) {
    console.error("Check tier error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

module.exports = router;