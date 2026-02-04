const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");  // <-- FIXED PATH

// User info endpoint (with auth middleware)
router.get("/me", authMiddleware, (req, res) => {
  console.log("User/me request for user:", req.user);
  
  res.json({ 
    success: true,
    message: "User data retrieved",
    user: {
      id: req.user.id,
      username: req.user.username,
      balance: 1500,
      demoBalance: 46800,
      totalStaked: 0,
      totalWon: 0,
      gamesPlayed: 0
    }
  });
});

module.exports = router;