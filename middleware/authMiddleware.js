const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  console.log("🔐 Auth middleware called for:", req.method, req.url);
  
  // Get token from header
  const authHeader = req.header("Authorization");
  
  if (!authHeader) {
    console.log("❌ No Authorization header found");
    return res.status(401).json({ 
      success: false,
      message: "No token, access denied" 
    });
  }
  
  // Check if it has Bearer prefix
  const token = authHeader.startsWith("Bearer ") 
    ? authHeader.substring(7) 
    : authHeader;
  
  console.log("🔐 Token length:", token.length);
  
   try {
    const secret = process.env.JWT_SECRET || "dev_secret_123";
    const decoded = jwt.verify(token, secret);
    
    console.log("✅ Token valid for:", decoded);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("❌ Token invalid:", err.message);
    res.status(401).json({ 
      success: false,
      message: "Token is invalid or expired" 
    });
  }
};