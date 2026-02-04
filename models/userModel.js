const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    
    // Balances (RENAMED from previous fields)
    realBalance: { type: Number, default: 0 },
    demoBalance: { type: Number, default: 0 }, // Changed from demoBalance default
    
    // Deposit Tier System
    depositTier: { 
      type: Number, 
      enum: [1000, 5000, 10000], 
      default: null 
    },
    demoBonus: { type: Number, default: 0 },
    
    // Staking Gauge
    totalStakedReal: { type: Number, default: 0 },
    totalStakedDemo: { type: Number, default: 0 },
    
    // Withdrawal Tracking
    totalWonReal: { type: Number, default: 0 },
    totalWonDemo: { type: Number, default: 0 },
    
    // Balance Mode
    currentBalanceMode: { 
      type: String, 
      enum: ['demo', 'real'], 
      default: 'demo' 
    },
    
    // Bank Details (for withdrawal)
    bankName: { type: String, default: '' },
    accountName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    
    gamesPlayed: { type: Number, default: 0 },
    lastGamePlayed: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);