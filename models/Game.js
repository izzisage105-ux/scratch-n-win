const mongoose = require("mongoose");

const GameSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    stake: { type: Number, required: true },
    winAmount: { type: Number, default: 0 },
    result: { type: String, enum: ["win", "loss"], required: true },
    gridValues: { type: [Number], required: true },
    scratchCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
  }
);

module.exports = mongoose.models.Game || mongoose.model("Game", GameSchema);