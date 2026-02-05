const fs = require('fs');
const path = require('path');

// Find all HTML files
const htmlFiles = [];
function findHtmlFiles(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            findHtmlFiles(filePath);
        } else if (file.endsWith('.html')) {
            htmlFiles.push(filePath);
        }
    });
}

// Start from current directory
findHtmlFiles('.');

console.log(`Found ${htmlFiles.length} HTML files`);

// Fix each file
htmlFiles.forEach(filePath => {
    console.log(`Processing: ${filePath}`);
    
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Replace hardcoded API URLs with window.location.origin
        content = content.replace(/const API = "https:\/\/scratch-n-win\.vercel\.app";/g, 'const API = window.location.origin;');
        content = content.replace(/const API = 'https:\/\/scratch-n-win\.vercel\.app';/g, "const API = window.location.origin;");
        content = content.replace(/API = "https:\/\/scratch-n-win\.vercel\.app"/g, 'API = window.location.origin');
        content = content.replace(/API = 'https:\/\/scratch-n-win\.vercel\.app'/g, "API = window.location.origin");
        
        // Also handle any fetch calls with the full URL
        content = content.replace(/fetch\("https:\/\/scratch-n-win\.vercel\.app/g, 'fetch(window.location.origin');
        content = content.replace(/fetch\('https:\/\/scratch-n-win\.vercel\.app/g, "fetch(window.location.origin");
        
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✓ Fixed: ${filePath}`);
    } catch (error) {
        console.error(`✗ Error processing ${filePath}:`, error.message);
    }
});

console.log('\n✅ All HTML files updated!');