// game-logic.js
class ScratchGameLogic {
    constructor() {
        // Section stakes
        this.sections = {
            'A': { minStake: 150, maxWin: 2250 },
            'B': { minStake: 300, maxWin: 7500 },
            'C': { minStake: 500, maxWin: 10000 },
            'D': { minStake: 1000, maxWin: 15000 }
        };
        
        // Default probabilities (will be configurable by admin)
        this.probabilities = {
            demo: {
                'A': { winChance: 0.4, amounts: [150, 300, 450, 600, 750] },
                'B': { winChance: 0.35, amounts: [300, 600, 900, 1200, 1500] },
                'C': { winChance: 0.3, amounts: [500, 1000, 1500, 2000, 2500] },
                'D': { winChance: 0.25, amounts: [1000, 2000, 3000, 4000, 5000] }
            },
            real: {
                'A': { winChance: 0.2, amounts: [150, 300, 450, 600, 750] },
                'B': { winChance: 0.18, amounts: [300, 600, 900, 1200, 1500] },
                'C': { winChance: 0.15, amounts: [500, 1000, 1500, 2000, 2500] },
                'D': { winChance: 0.12, amounts: [1000, 2000, 3000, 4000, 5000] }
            }
        };
    }
    
    // Determine which section based on stake
    getSectionFromStake(stake) {
        for (const [section, data] of Object.entries(this.sections)) {
            if (stake === data.minStake) {
                return section;
            }
        }
        return 'A'; // Default
    }
    
    // Generate 9 scratch boxes
    generateGrid(section, mode = 'demo') {
        const sectionProb = this.probabilities[mode][section];
        const grid = [];
        
        // Generate 9 random amounts
        for (let i = 0; i < 9; i++) {
            const randomAmount = sectionProb.amounts[
                Math.floor(Math.random() * sectionProb.amounts.length)
            ];
            grid.push(randomAmount);
        }
        
        // Check for win (3 matching amounts)
        const winResult = this.checkForWin(grid);
        
        return {
            grid: grid,
            winAmount: winResult.winAmount,
            isWin: winResult.isWin,
            matchingIndices: winResult.matchingIndices
        };
    }
    
    // Check if 3 matching amounts exist
    checkForWin(grid) {
        const counts = {};
        
        // Count occurrences of each amount
        grid.forEach(amount => {
            counts[amount] = (counts[amount] || 0) + 1;
        });
        
        // Find amounts with 3 or more occurrences
        for (const [amount, count] of Object.entries(counts)) {
            if (count >= 3) {
                const amountNum = parseInt(amount);
                const indices = [];
                
                // Find indices of matching amounts
                grid.forEach((value, index) => {
                    if (value === amountNum) {
                        indices.push(index);
                    }
                });
                
                return {
                    isWin: true,
                    winAmount: amountNum * 3, // 3 matches
                    matchingAmount: amountNum,
                    matchingIndices: indices.slice(0, 3) // First 3 matches
                };
            }
        }
        
        return {
            isWin: false,
            winAmount: 0,
            matchingIndices: []
        };
    }
    
    // Calculate if user wins based on probability
    determineWin(section, mode) {
        const winChance = this.probabilities[mode][section].winChance;
        return Math.random() < winChance;
    }
    
    // Apply probability to potentially create a win
    applyProbabilityToGrid(grid, section, mode) {
        const shouldWin = this.determineWin(section, mode);
        
        if (shouldWin) {
            // Force a win by ensuring 3 matching amounts
            const amounts = this.probabilities[mode][section].amounts;
            const winAmount = amounts[Math.floor(Math.random() * amounts.length)];
            
            // Replace random positions with winning amount
            const positions = [0, 1, 2, 3, 4, 5, 6, 7, 8];
            // Shuffle positions
            for (let i = positions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [positions[i], positions[j]] = [positions[j], positions[i]];
            }
            
            // Set first 3 positions to winning amount
            grid[positions[0]] = winAmount;
            grid[positions[1]] = winAmount;
            grid[positions[2]] = winAmount;
        }
        
        return grid;
    }
}

module.exports = ScratchGameLogic;