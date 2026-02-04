const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");  // <-- FIXED PATH

// Add to user.js or create new balance.js route
router.post("/switch-balance-mode", authMiddleware, async (req, res) => {
  try {
    const { mode } = req.body; // 'demo' or 'real'
    
    if (!['demo', 'real'].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid balance mode"
      });
    }
    
    const user = await User.findById(req.user.id);
    
    // Check if demo balance is zero when switching to demo
    if (mode === 'demo' && user.demoBalance <= 0) {
      return res.status(400).json({
        success: false,
        message: "Demo balance is zero. Please use real balance or deposit."
      });
    }
    
    user.currentBalanceMode = mode;
    await user.save();
    
    const currentBalance = mode === 'demo' ? user.demoBalance : user.realBalance;
    
    res.json({
      success: true,
      message: `Switched to ${mode} balance`,
      mode: mode,
      currentBalance: currentBalance
    });
    
  } catch (error) {
    console.error("Switch balance error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

module.exports = router;