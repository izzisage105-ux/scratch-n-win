// In admin-panel.js
async function loadDeposits() {
    try {
        const response = await fetch(API + "/api/admin/deposit-requests", {
            headers: adminHeaders
        });
        
        const data = await response.json();
        
        if (data.success) {
            const tbody = document.getElementById('deposits-list');
            tbody.innerHTML = '';
            
            data.requests.forEach(request => {
                const statusColors = {
                    'pending': '#ffc107',
                    'approved': '#28a745',
                    'rejected': '#dc3545'
                };
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${request.requestId}</td>
                    <td>${request.username}</td>
                    <td>₦${request.amount.toLocaleString()}</td>
                    <td>${request.paymentProof || 'No proof'}</td>
                    <td style="color: ${statusColors[request.status]}">
                        ${request.status.toUpperCase()}
                    </td>
                    <td>${new Date(request.requestedAt).toLocaleString()}</td>
                    <td>
                        ${request.status === 'pending' ? `
                            <button class="btn btn-approve" onclick="approveDeposit(${request.requestId})">✅ Approve</button>
                            <button class="btn btn-reject" onclick="rejectDeposit(${request.requestId})">❌ Reject</button>
                        ` : 'No actions'}
                    </td>
                `;
                tbody.appendChild(row);
            });
        }
    } catch (error) {
        console.error("Load deposits error:", error);
        alert("Failed to load deposits");
    }
}

async function approveDeposit(requestId) {
    const notes = prompt("Approval notes (optional):");
    
    try {
        const response = await fetch(API + `/api/admin/approve-deposit/${requestId}`, {
            method: "POST",
            headers: adminHeaders,
            body: JSON.stringify({ notes })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert("✅ Deposit approved! User's balance updated.");
            loadDeposits();
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error("Approve deposit error:", error);
        alert("Failed to approve deposit");
    }
}

async function rejectDeposit(requestId) {
    const notes = prompt("Rejection reason:");
    
    try {
        const response = await fetch(API + `/api/admin/reject-deposit/${requestId}`, {
            method: "POST",
            headers: adminHeaders,
            body: JSON.stringify({ notes })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert("✅ Deposit rejected!");
            loadDeposits();
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error("Reject deposit error:", error);
        alert("Failed to reject deposit");
    }
}

// Update showTab function
function showTab(tabName) {
    // ... existing code ...
    
    switch(tabName) {
        case 'users': loadUsers(); break;
        case 'deposits': loadDeposits(); break;
        case 'withdrawals': loadWithdrawals(); break;
        case 'unlock': loadEligibleUsers(); break;
    }
}