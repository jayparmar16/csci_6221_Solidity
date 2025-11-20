// Profile Dashboard JavaScript

const API_BASE_URL = 'http://localhost:8000';
let currentWallet = null;
let profileData = null;

// ========== Initialization ==========

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    checkWalletConnection();
});

function setupEventListeners() {
    // Wallet connection
    document.getElementById('connectWalletBtn').addEventListener('click', connectWallet);
    document.getElementById('disconnectWalletBtn').addEventListener('click', disconnectWallet);
    
    // Claim rewards
    document.getElementById('claimAllBtn').addEventListener('click', claimAllRewards);
    
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    // Filter badges
    document.querySelectorAll('.badge-filter').forEach(btn => {
        btn.addEventListener('click', () => filterVotes(btn.dataset.filter));
    });
}

// ========== Wallet Connection ==========

async function connectWallet() {
    try {
        if (!window.ethereum) {
            alert('Please install MetaMask to use this feature');
            return;
        }

        addLog('info', '🦊 Connecting to MetaMask...');
        
        const accounts = await window.ethereum.request({ 
            method: 'eth_requestAccounts' 
        });
        
        if (!accounts || accounts.length === 0) {
            throw new Error('No accounts found');
        }

        currentWallet = accounts[0];
        addLog('success', `✅ Connected: ${formatAddress(currentWallet)}`);
        
        // Update UI
        document.getElementById('walletDisconnected').style.display = 'none';
        document.getElementById('walletConnected').style.display = 'flex';
        document.getElementById('walletAddress').textContent = formatAddress(currentWallet);
        
        // Get balance
        const balance = await window.ethereum.request({
            method: 'eth_getBalance',
            params: [currentWallet, 'latest']
        });
        const ethBalance = (parseInt(balance, 16) / 1e18).toFixed(4);
        document.getElementById('walletBalance').textContent = `${ethBalance} ETH`;
        
        // Load profile
        await loadProfile();
        
    } catch (error) {
        console.error('Wallet connection error:', error);
        addLog('error', `❌ Connection failed: ${error.message}`);
    }
}

async function disconnectWallet() {
    currentWallet = null;
    profileData = null;
    
    document.getElementById('walletDisconnected').style.display = 'block';
    document.getElementById('walletConnected').style.display = 'none';
    document.getElementById('profileSection').style.display = 'none';
    document.getElementById('notConnectedSection').style.display = 'block';
    
    addLog('info', '👋 Wallet disconnected');
}

async function checkWalletConnection() {
    if (window.ethereum) {
        try {
            const accounts = await window.ethereum.request({ 
                method: 'eth_accounts' 
            });
            
            if (accounts && accounts.length > 0) {
                currentWallet = accounts[0];
                document.getElementById('walletDisconnected').style.display = 'none';
                document.getElementById('walletConnected').style.display = 'flex';
                document.getElementById('walletAddress').textContent = formatAddress(currentWallet);
                
                // Get balance
                const balance = await window.ethereum.request({
                    method: 'eth_getBalance',
                    params: [currentWallet, 'latest']
                });
                const ethBalance = (parseInt(balance, 16) / 1e18).toFixed(4);
                document.getElementById('walletBalance').textContent = `${ethBalance} ETH`;
                
                await loadProfile();
            }
        } catch (error) {
            console.error('Check wallet error:', error);
        }
    }
}

// ========== Profile Loading ==========

async function loadProfile() {
    if (!currentWallet) return;
    
    try {
        addLog('info', '📊 Loading profile data...');
        
        // Show profile section, hide not connected
        document.getElementById('profileSection').style.display = 'block';
        document.getElementById('notConnectedSection').style.display = 'none';
        
        // Fetch profile data
        const response = await fetch(`${API_BASE_URL}/api/profile/${currentWallet}`);
        if (!response.ok) throw new Error('Failed to load profile');
        
        profileData = await response.json();
        
        // Update stats
        document.getElementById('totalVotes').textContent = profileData.total_votes;
        document.getElementById('correctVotes').textContent = profileData.correct_votes;
        document.getElementById('accuracyRate').textContent = `${profileData.accuracy_rate}%`;
        document.getElementById('totalRewards').textContent = `${profileData.total_rewards_earned} AIVT`;
        
        // Load claimable rewards
        await loadClaimableRewards();
        
        // Load voting history
        await loadVotingHistory();
        
        addLog('success', '✅ Profile loaded successfully');
        
    } catch (error) {
        console.error('Load profile error:', error);
        addLog('error', `❌ Failed to load profile: ${error.message}`);
    }
}

async function loadClaimableRewards() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/profile/${currentWallet}/claimable`);
        if (!response.ok) throw new Error('Failed to load claimable rewards');
        
        const data = await response.json();
        
        // Update pending summary
        document.getElementById('pendingAmount').textContent = `${data.total_amount} AIVT`;
        document.getElementById('pendingCount').textContent = 
            `${data.count} reward${data.count !== 1 ? 's' : ''} ready to claim`;
        
        // Enable/disable claim all button
        const claimAllBtn = document.getElementById('claimAllBtn');
        claimAllBtn.disabled = data.count === 0;
        
        // Render claimable list
        renderClaimableList(data.claimable);
        
    } catch (error) {
        console.error('Load claimable rewards error:', error);
        addLog('error', `❌ Failed to load claimable rewards: ${error.message}`);
    }
}

function renderClaimableList(claimable) {
    const container = document.getElementById('claimableList');
    
    if (claimable.length === 0) {
        container.innerHTML = `
            <div class="empty-message">
                <div class="empty-message-icon">🎁</div>
                <p>No rewards to claim yet. Vote correctly on finalized images to earn rewards!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = claimable.map(reward => {
        const voteType = reward.is_ai ? 'AI Generated' : 'Human Created';
        const correctAnswer = reward.correct_answer ? 'AI Generated' : 'Human Created';
        
        return `
            <div class="claimable-item">
                <div class="claimable-info">
                    <div class="claimable-image">
                        🖼️ Image #${reward.blockchain_id} - ${reward.sha256.substring(0, 12)}...
                    </div>
                    <div class="claimable-vote">
                        Voted: ${voteType} | Correct Answer: ${correctAnswer}
                    </div>
                </div>
                <div class="claimable-reward">+10 AIVT</div>
                <button class="claim-btn" onclick="claimSingleReward(${reward.vote_id})">
                    Claim
                </button>
            </div>
        `;
    }).join('');
}

async function loadVotingHistory(filter = 'all') {
    const container = document.getElementById('votesHistory');
    const loading = document.getElementById('votesLoading');
    
    try {
        loading.style.display = 'block';
        container.innerHTML = '';
        
        const response = await fetch(`${API_BASE_URL}/api/profile/${currentWallet}/votes`);
        if (!response.ok) throw new Error('Failed to load voting history');
        
        const data = await response.json();
        let votes = data.votes;
        
        // Apply filter
        if (filter === 'correct') {
            votes = votes.filter(v => v.is_finalized && v.is_ai === v.correct_answer);
        } else if (filter === 'pending') {
            votes = votes.filter(v => !v.is_finalized);
        }
        
        loading.style.display = 'none';
        
        if (votes.length === 0) {
            container.innerHTML = `
                <div class="empty-message">
                    <div class="empty-message-icon">📊</div>
                    <p>No votes found. Start voting on images to build your history!</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = votes.map(vote => {
            const voteType = vote.is_ai ? 'AI Generated' : 'Human Created';
            const isCorrect = vote.is_finalized && vote.is_ai === vote.correct_answer;
            const isPending = !vote.is_finalized;
            const rewardClaimed = vote.reward_claimed === 1;
            
            let badge = '';
            if (isPending) {
                badge = '<span class="history-item-badge pending">Pending</span>';
            } else if (isCorrect) {
                badge = rewardClaimed 
                    ? '<span class="history-item-badge claimed">Claimed</span>'
                    : '<span class="history-item-badge correct">Claimable</span>';
            } else {
                badge = '<span class="history-item-badge incorrect">Incorrect</span>';
            }
            
            const date = new Date(vote.created_at).toLocaleString();
            
            return `
                <div class="history-item">
                    <div class="history-item-header">
                        <div>
                            <div class="history-item-title">
                                🖼️ Image #${vote.blockchain_id || vote.image_id}
                            </div>
                            <div class="history-item-date">${date}</div>
                        </div>
                        ${badge}
                    </div>
                    <div class="history-item-details">
                        <div class="history-item-detail">
                            <div class="history-item-detail-label">Your Vote</div>
                            <div class="history-item-detail-value">${voteType}</div>
                        </div>
                        <div class="history-item-detail">
                            <div class="history-item-detail-label">Status</div>
                            <div class="history-item-detail-value">
                                ${isPending ? 'Voting Period Active' : 
                                  isCorrect ? '✅ Correct!' : '❌ Incorrect'}
                            </div>
                        </div>
                        ${vote.vote_tx_hash ? `
                        <div class="history-item-detail">
                            <div class="history-item-detail-label">Transaction</div>
                            <div class="history-item-detail-value">
                                <a href="https://sepolia.etherscan.io/tx/${vote.vote_tx_hash}" 
                                   target="_blank" 
                                   class="history-item-tx">
                                    ${vote.vote_tx_hash.substring(0, 10)}...
                                </a>
                            </div>
                        </div>
                        ` : ''}
                        ${isCorrect && !isPending ? `
                        <div class="history-item-detail">
                            <div class="history-item-detail-label">Reward</div>
                            <div class="history-item-detail-value" style="color: var(--success-color);">
                                ${rewardClaimed ? '✓ Claimed: 10 AIVT' : '💰 10 AIVT'}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Load voting history error:', error);
        loading.style.display = 'none';
        container.innerHTML = `
            <div class="empty-message">
                <div class="empty-message-icon">❌</div>
                <p>Failed to load voting history: ${error.message}</p>
            </div>
        `;
    }
}

async function loadRewardHistory() {
    const container = document.getElementById('rewardsHistory');
    const loading = document.getElementById('rewardsLoading');
    
    try {
        loading.style.display = 'block';
        container.innerHTML = '';
        
        const response = await fetch(`${API_BASE_URL}/api/profile/${currentWallet}/rewards`);
        if (!response.ok) throw new Error('Failed to load reward history');
        
        const data = await response.json();
        
        loading.style.display = 'none';
        
        if (data.rewards.length === 0) {
            container.innerHTML = `
                <div class="empty-message">
                    <div class="empty-message-icon">💰</div>
                    <p>No rewards claimed yet. Vote correctly and claim your rewards!</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = data.rewards.map(reward => {
            const date = new Date(reward.claimed_at).toLocaleString();
            
            return `
                <div class="history-item">
                    <div class="history-item-header">
                        <div>
                            <div class="history-item-title">
                                💰 Reward Claimed
                            </div>
                            <div class="history-item-date">${date}</div>
                        </div>
                        <span class="history-item-badge claimed">+${reward.reward_amount} AIVT</span>
                    </div>
                    <div class="history-item-details">
                        <div class="history-item-detail">
                            <div class="history-item-detail-label">Image</div>
                            <div class="history-item-detail-value">
                                #${reward.blockchain_id} - ${reward.sha256.substring(0, 12)}...
                            </div>
                        </div>
                        <div class="history-item-detail">
                            <div class="history-item-detail-label">Transaction</div>
                            <div class="history-item-detail-value">
                                <a href="https://sepolia.etherscan.io/tx/${reward.claim_tx_hash}" 
                                   target="_blank" 
                                   class="history-item-tx">
                                    ${reward.claim_tx_hash.substring(0, 10)}...
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Load reward history error:', error);
        loading.style.display = 'none';
        container.innerHTML = `
            <div class="empty-message">
                <div class="empty-message-icon">❌</div>
                <p>Failed to load reward history: ${error.message}</p>
            </div>
        `;
    }
}

// ========== Claiming Rewards ==========

async function claimSingleReward(voteId) {
    try {
        addLog('info', `💰 Claiming reward for vote #${voteId}...`);
        
        // Here you would call the smart contract to claim the reward
        // For now, we'll simulate it
        
        // In production, this would be:
        // const tx = await rewardsContract.claimReward(imageId);
        // await tx.wait();
        
        // Simulate transaction
        const txHash = '0x' + Array(64).fill(0).map(() => 
            Math.floor(Math.random() * 16).toString(16)
        ).join('');
        
        // Update backend
        const response = await fetch(`${API_BASE_URL}/api/rewards/claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vote_id: voteId,
                claim_tx_hash: txHash
            })
        });
        
        if (!response.ok) throw new Error('Failed to claim reward');
        
        addLog('success', `✅ Reward claimed successfully! TX: ${txHash.substring(0, 10)}...`);
        
        // Reload profile and claimable rewards
        await loadProfile();
        
    } catch (error) {
        console.error('Claim reward error:', error);
        addLog('error', `❌ Failed to claim reward: ${error.message}`);
    }
}

async function claimAllRewards() {
    try {
        addLog('info', '💰 Claiming all rewards...');
        
        // Get claimable rewards
        const response = await fetch(`${API_BASE_URL}/api/profile/${currentWallet}/claimable`);
        if (!response.ok) throw new Error('Failed to get claimable rewards');
        
        const data = await response.json();
        
        if (data.claimable.length === 0) {
            addLog('warning', '⚠️ No rewards to claim');
            return;
        }
        
        // Claim each reward
        for (const reward of data.claimable) {
            await claimSingleReward(reward.vote_id);
            // Add delay to avoid overwhelming the network
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        addLog('success', `✅ All ${data.claimable.length} rewards claimed!`);
        
    } catch (error) {
        console.error('Claim all rewards error:', error);
        addLog('error', `❌ Failed to claim rewards: ${error.message}`);
    }
}

// ========== UI Functions ==========

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}Tab`);
    });
    
    // Load data for the tab
    if (tabName === 'votes') {
        loadVotingHistory();
    } else if (tabName === 'rewards') {
        loadRewardHistory();
    }
}

function filterVotes(filter) {
    // Update filter buttons
    document.querySelectorAll('.badge-filter').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    
    // Reload voting history with filter
    loadVotingHistory(filter);
}

function formatAddress(address) {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

// ========== Console Log ==========

function addLog(type, message) {
    const consoleLog = document.getElementById('consoleLog');
    const timestamp = new Date().toLocaleTimeString();
    
    const logEntry = document.createElement('div');
    logEntry.className = `console-entry console-${type}`;
    logEntry.innerHTML = `<span class="console-time">[${timestamp}]</span> ${message}`;
    
    consoleLog.appendChild(logEntry);
    consoleLog.scrollTop = consoleLog.scrollHeight;
    
    // Keep only last 50 entries
    while (consoleLog.children.length > 50) {
        consoleLog.removeChild(consoleLog.firstChild);
    }
}
