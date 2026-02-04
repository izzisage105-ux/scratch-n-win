const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/userModel");  // Make sure this path is correct

// Register endpoint
router.post("/register", async (req, res) => {
  try {
    const { phone, username, password } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ phone }, { username }] });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: "Phone or username already exists" 
      });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user
    const user = new User({
      phone,
      username,
      password: hashedPassword,
      balance: 0,
      demoBalance: 46800
    });
    
    await user.save();
    
    // Create token
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );
    
    res.json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        balance: user.balance,
        demoBalance: user.demoBalance
      }
    });
    
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

// Login endpoint
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid credentials" 
      });
    }
    
    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid credentials" 
      });
    }
    
    // Create token
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );
    
    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        balance: user.balance,
        demoBalance: user.demoBalance
      }
    });
    
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

module.exports = router;