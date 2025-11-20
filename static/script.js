// Configuration
const API_BASE_URL = 'http://localhost:8000';
let allImages = [];
let currentFilter = 'all';
let currentImageData = null; // Store current image for blockchain operations

// Authentication state
let authenticatedAddress = null;
let authSignature = null;

// DOM Elements
const imageInput = document.getElementById('imageInput');
const fileName = document.getElementById('fileName');
const uploadBtn = document.getElementById('uploadBtn');
const analyzeCheckbox = document.getElementById('analyzeCheckbox');
const uploadStatus = document.getElementById('uploadStatus');
const imagesGrid = document.getElementById('imagesGrid');
const loadingSpinner = document.getElementById('loadingSpinner');
const noImages = document.getElementById('noImages');
const filterBtns = document.querySelectorAll('.filter-btn');
const modal = document.getElementById('imageModal');
const modalImage = document.getElementById('modalImage');
const modalInfo = document.getElementById('modalInfo');
const closeModal = document.querySelector('.close');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔵 [Init] DOM Content Loaded');
    console.log('🔵 [Init] Checking dependencies...');
    console.log('  - window.ethereum:', typeof window.ethereum !== 'undefined' ? '✅ Found' : '❌ Not found');
    console.log('  - ethers:', typeof ethers !== 'undefined' ? '✅ Loaded' : '❌ Not loaded');
    console.log('  - web3Manager:', typeof window.web3Manager !== 'undefined' ? '✅ Loaded' : '❌ Not loaded');
    
    loadImages();
    setupEventListeners();
    setupWalletListeners();
    checkWalletConnection();
    checkAuthOnLoad(); // Check if user was previously authenticated
    
    console.log('✅ [Init] Initialization complete');
});

// Wallet Management Functions
function setupWalletListeners() {
    const connectBtn = document.getElementById('connectWalletBtn');
    const disconnectBtn = document.getElementById('disconnectWalletBtn');

    console.log('🔵 [Setup] Setting up wallet listeners...');
    console.log('🔵 [Setup] Connect button:', connectBtn ? '✅ Found' : '❌ Not found');
    console.log('🔵 [Setup] Disconnect button:', disconnectBtn ? '✅ Found' : '❌ Not found');

    if (connectBtn) {
        console.log('🔵 [Setup] Adding click listener to connect button');
        connectBtn.addEventListener('click', () => {
            console.log('🔵 [Click] Connect button clicked!');
            connectWallet();
        });
        console.log('✅ [Setup] Connect button listener added');
    } else {
        console.error('❌ [Setup] Connect button not found in DOM!');
    }

    if (disconnectBtn) {
        console.log('🔵 [Setup] Adding click listener to disconnect button');
        disconnectBtn.addEventListener('click', disconnectWallet);
        console.log('✅ [Setup] Disconnect button listener added');
    }

    // Listen for account changes
    if (window.ethereum) {
        console.log('✅ [Setup] window.ethereum found, adding event listeners');
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);
    } else {
        console.warn('⚠️ [Setup] window.ethereum not found');
    }
    
    console.log('✅ [Setup] Wallet listeners setup complete');
}

async function checkWalletConnection() {
    if (!window.web3Manager || !window.web3Manager.isMetaMaskInstalled()) {
        console.log('MetaMask not installed');
        return;
    }

    // Check if previously connected
    try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
            await connectWallet();
        }
    } catch (error) {
        console.error('Error checking wallet connection:', error);
    }
}

async function connectWallet() {
    try {
        console.log('🔵 Starting wallet connection...');
        
        // Check if web3Manager is loaded
        if (!window.web3Manager) {
            console.error('❌ web3Manager not initialized');
            showWalletStatus('Error: Web3 manager not loaded. Please refresh the page.', 'error');
            return;
        }
        
        // Check if ethers is loaded
        if (typeof ethers === 'undefined') {
            console.error('❌ Ethers.js not loaded');
            showWalletStatus('Error: Ethers.js library not loaded. Please refresh the page.', 'error');
            return;
        }
        
        console.log('✅ All dependencies loaded');
        showWalletStatus('Connecting to MetaMask...', 'pending');
        
        const account = await window.web3Manager.connectWallet();
        console.log('✅ Account connected:', account);
        
        // Request authentication signature
        showWalletStatus('Please sign message to authenticate...', 'pending');
        addLog('info', '🔐 Requesting authentication signature...');
        
        const signature = await signAuthMessage(account);
        if (!signature) {
            throw new Error('Authentication signature required');
        }
        
        console.log('✅ Message signed');
        addLog('success', '✅ Authentication signature received');
        
        // Store authentication
        authenticatedAddress = account;
        authSignature = signature;
        localStorage.setItem('authenticatedAddress', account);
        localStorage.setItem('authSignature', signature);
        localStorage.setItem('authTimestamp', Date.now().toString());
        
        // Switch to Sepolia if needed
        await window.web3Manager.switchToSepolia();
        console.log('✅ Network checked/switched');
        
        // Get balance
        const balance = await window.web3Manager.getBalance();
        console.log('✅ Balance retrieved:', balance);
        
        const network = await window.web3Manager.getNetwork();
        console.log('✅ Network name:', network);
        
        console.log('🔵 Updating wallet UI...');
        updateWalletUI(account, balance, network);
        console.log('✅ Wallet UI updated');
        
        showWalletStatus('Wallet authenticated successfully! 🎉', 'success');
        addLog('success', `🔐 Authenticated as ${formatAddress(account)}`);
        
        // Reload current modal if open to show blockchain vote options
        if (modal.classList.contains('show') && currentImageData) {
            console.log('🔵 Reloading modal blockchain info...');
            loadImageBlockchainInfo(currentImageData.id);
        }
        
    } catch (error) {
        console.error('❌ Wallet authentication error:', error);
        if (error.code === 4001) {
            showWalletStatus('Authentication cancelled by user', 'error');
            addLog('warning', '⚠️ User rejected authentication signature');
        } else {
            showWalletStatus(`Authentication failed: ${error.message}`, 'error');
            addLog('error', `❌ Authentication failed: ${error.message}`);
        }
    }
}

async function disconnectWallet() {
    // Clear authentication
    authenticatedAddress = null;
    authSignature = null;
    localStorage.removeItem('authenticatedAddress');
    localStorage.removeItem('authSignature');
    localStorage.removeItem('authTimestamp');
    
    // Clear UI
    document.getElementById('walletDisconnected').style.display = 'flex';
    document.getElementById('walletConnected').style.display = 'none';
    
    // Clear blockchain vote section if modal is open
    const blockchainVoteSection = document.getElementById('blockchainVoteSection');
    if (blockchainVoteSection) {
        blockchainVoteSection.style.display = 'none';
    }
    
    showWalletStatus('Wallet disconnected', 'success');
    addLog('info', '👋 Wallet disconnected and authentication cleared');
}

// ============ Authentication Helper Functions ============

/**
 * Sign authentication message
 */
async function signAuthMessage(address) {
    try {
        const timestamp = new Date().toISOString();
        const message = `Welcome to AI Image Voting Platform!

Sign this message to authenticate your wallet.

Wallet: ${address}
Timestamp: ${timestamp}

This request will not trigger a blockchain transaction or cost any gas fees.`;
        
        // Request signature from MetaMask
        const signature = await window.ethereum.request({
            method: 'personal_sign',
            params: [message, address]
        });
        
        return signature;
    } catch (error) {
        console.error('Signature error:', error);
        if (error.code === 4001) {
            throw new Error('You must sign the message to authenticate');
        }
        throw error;
    }
}

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
    if (!authenticatedAddress) {
        // Check localStorage
        const storedAddress = localStorage.getItem('authenticatedAddress');
        const authTimestamp = localStorage.getItem('authTimestamp');
        
        if (storedAddress && authTimestamp) {
            // Check if auth is still valid (24 hours)
            const now = Date.now();
            const authTime = parseInt(authTimestamp);
            const hoursSinceAuth = (now - authTime) / (1000 * 60 * 60);
            
            if (hoursSinceAuth < 24) {
                authenticatedAddress = storedAddress;
                authSignature = localStorage.getItem('authSignature');
                return true;
            }
        }
        return false;
    }
    return true;
}

/**
 * Get authenticated user address
 */
function getAuthenticatedAddress() {
    if (isAuthenticated()) {
        return authenticatedAddress;
    }
    return null;
}

/**
 * Format address for display
 */
function formatAddress(address) {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

/**
 * Auto-reconnect on page load if previously authenticated
 */
async function checkAuthOnLoad() {
    const storedAddress = localStorage.getItem('authenticatedAddress');
    const authTimestamp = localStorage.getItem('authTimestamp');
    
    if (storedAddress && authTimestamp) {
        const now = Date.now();
        const authTime = parseInt(authTimestamp);
        const hoursSinceAuth = (now - authTime) / (1000 * 60 * 60);
        
        if (hoursSinceAuth < 24) {
            // Try to auto-reconnect
            try {
                if (window.ethereum) {
                    const accounts = await window.ethereum.request({ 
                        method: 'eth_accounts' 
                    });
                    
                    if (accounts.length > 0 && accounts[0].toLowerCase() === storedAddress.toLowerCase()) {
                        // Auto-reconnect
                        console.log('🔵 Auto-reconnecting authenticated wallet...');
                        addLog('info', '🔄 Auto-reconnecting wallet...');
                        
                        // Restore auth state
                        authenticatedAddress = storedAddress;
                        authSignature = localStorage.getItem('authSignature');
                        
                        // Connect wallet (will skip signature since already authenticated)
                        if (window.web3Manager) {
                            await window.web3Manager.connectWallet();
                            const balance = await window.web3Manager.getBalance();
                            const network = await window.web3Manager.getNetwork();
                            updateWalletUI(storedAddress, balance, network);
                            addLog('success', `✅ Auto-reconnected as ${formatAddress(storedAddress)}`);
                        }
                    }
                }
            } catch (error) {
                console.error('Auto-reconnect failed:', error);
                // Clear invalid auth
                localStorage.removeItem('authenticatedAddress');
                localStorage.removeItem('authSignature');
                localStorage.removeItem('authTimestamp');
            }
        } else {
            // Auth expired
            console.log('⏰ Authentication expired (>24 hours)');
            localStorage.removeItem('authenticatedAddress');
            localStorage.removeItem('authSignature');
            localStorage.removeItem('authTimestamp');
        }
    }
}

function updateWalletUI(account, balance, network) {
    console.log('🔵 updateWalletUI called with:', { account, balance, network });
    
    // Show connected state
    const disconnectedEl = document.getElementById('walletDisconnected');
    const connectedEl = document.getElementById('walletConnected');
    
    console.log('🔵 Elements found:', { 
        disconnectedEl: !!disconnectedEl, 
        connectedEl: !!connectedEl 
    });
    
    if (disconnectedEl) {
        disconnectedEl.style.display = 'none';
        console.log('✅ Hidden walletDisconnected');
    }
    
    if (connectedEl) {
        connectedEl.style.display = 'flex';
        console.log('✅ Showing walletConnected');
    }
    
    // Update wallet details
    const addressEl = document.getElementById('walletAddress');
    const balanceEl = document.getElementById('walletBalance');
    const networkEl = document.getElementById('walletNetwork');
    
    console.log('🔵 Detail elements found:', { 
        addressEl: !!addressEl, 
        balanceEl: !!balanceEl, 
        networkEl: !!networkEl 
    });
    
    if (addressEl) {
        // Show authentication indicator + address
        const authStatus = isAuthenticated() 
            ? '<span class="auth-dot"></span> Authenticated • ' 
            : '';
        addressEl.innerHTML = `${authStatus}${window.web3Manager.formatAddress(account)}`;
        console.log('✅ Set address with auth status');
    }
    
    if (balanceEl) {
        balanceEl.textContent = `${parseFloat(balance).toFixed(4)} ETH`;
        console.log('✅ Set balance:', balanceEl.textContent);
    }
    
    if (networkEl) {
        networkEl.textContent = network;
        networkEl.className = 'network-badge';
        if (network === 'Sepolia') {
            networkEl.classList.add('sepolia');
        }
        console.log('✅ Set network:', networkEl.textContent);
    }
    
    console.log('✅ updateWalletUI complete');
}

function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        disconnectWallet();
    } else {
        // Reconnect with new account
        connectWallet();
    }
}

function handleChainChanged() {
    // Reload page when chain changes
    window.location.reload();
}

function showWalletStatus(message, type) {
    // You can add a toast notification here if desired
    console.log(`[Wallet ${type}]`, message);
}

// Event Listeners
function setupEventListeners() {
    imageInput.addEventListener('change', handleFileSelect);
    uploadBtn.addEventListener('click', handleUpload);
    
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderImages();
        });
    });

    closeModal.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
}

// File Selection
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        fileName.textContent = file.name;
        uploadBtn.disabled = false;
    } else {
        fileName.textContent = 'Choose an image...';
        uploadBtn.disabled = true;
    }
}

// Upload Image
async function handleUpload() {
    const file = imageInput.files[0];
    if (!file) return;

    const analyze = analyzeCheckbox.checked;
    const formData = new FormData();
    formData.append('file', file);

    // Show loading state
    uploadBtn.disabled = true;
    document.querySelector('.btn-text').style.display = 'none';
    document.querySelector('.loader').style.display = 'block';
    hideStatus();

    try {
        // Step 1: Upload image
        if (analyze) {
            showStatus('pending', '⏳ Step 1/3: Uploading image...');
            addLog('info', `📤 Uploading image with AI analysis enabled...`);
        } else {
            showStatus('pending', '⏳ Uploading image...');
            addLog('info', `📤 Uploading image...`);
        }
        
        const response = await fetch(`${API_BASE_URL}/images/upload?analyze=${analyze}`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        console.log('📦 Upload response:', data);

        if (response.ok) {
            // Check if this is a duplicate image
            if (data.duplicate || (data.exists && !analyze)) {
                const imageId = data.image_id || (data.image && data.image.id);
                
                addLog('warning', `⚠️ Duplicate image detected - Image #${imageId} already exists in database`);
                
                showStatus('warning', `
                    <div style="line-height: 1.6;">
                        <strong>⚠️ Duplicate Image Detected!</strong>
                        <div style="margin-top: 8px;">
                            This image already exists in the database.
                        </div>
                        <div style="margin-top: 8px;">
                            <button 
                                onclick="viewExistingImage(${imageId})" 
                                style="background: #f59e0b; color: white; padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                                View Existing Image →
                            </button>
                        </div>
                    </div>
                `);
                
                // Reset form
                imageInput.value = '';
                fileName.textContent = 'Choose an image...';
                uploadBtn.disabled = true;
                
                // Reload images to ensure the duplicate is visible
                setTimeout(() => loadImages(), 1000);
                
                return;
            }
            
            if (analyze) {
                // Check if analysis failed during upload
                if (data.analysis_error) {
                    console.error('❌ Analysis error:', data.analysis_error);
                    showStatus('error', `❌ Upload successful but analysis failed: ${data.analysis_error}`);
                    setTimeout(() => loadImages(), 3000);
                    return;
                }
                
                // If analysis completed immediately (e.g., duplicate image)
                if (data.analysis && data.analysis.is_ai !== null && data.analysis.is_ai !== undefined) {
                    const result = data.analysis.is_ai ? 'AI-Generated' : 'Human-Created';
                    const confidence = data.analysis.ai_score ? ` (${Math.round(data.analysis.ai_score)}%)` : '';
                    const imageId = data.image_id || data.id;
                    
                    // Log analysis result
                    addLog('success', `✅ Image #${imageId} analyzed: ${result}${confidence}`);
                    if (data.analysis.model_used) {
                        addLog('info', `🤖 Model used: ${data.analysis.model_used}`);
                    }
                    
                    // Log blockchain registration if available
                    if (data.blockchain && data.blockchain.registered && data.blockchain.tx_hash) {
                        const txHash = data.blockchain.tx_hash.startsWith('0x') ? data.blockchain.tx_hash : `0x${data.blockchain.tx_hash}`;
                        const etherscanUrl = `https://sepolia.etherscan.io/tx/${txHash}`;
                        addLog('blockchain', 
                            `⛓️ Image #${imageId} registered on blockchain! TX: <a href="${etherscanUrl}" target="_blank" class="console-link">${txHash.substring(0, 10)}...${txHash.substring(txHash.length - 8)}</a> | Block: #${data.blockchain.block_number || 'pending'} | Chain ID: ${data.blockchain.blockchain_id}`
                        );
                    } else if (data.blockchain_error) {
                        addLog('warning', `⚠️ Blockchain registration failed: ${data.blockchain_error}`);
                    }
                    
                    // Check if this is a duplicate (re-analysis)
                    if (data.exists) {
                        showStatus('success', `
                            <div style="line-height: 1.6;">
                                <strong>✅ Duplicate Image Re-analyzed!</strong>
                                <div style="margin-top: 8px;">
                                    Result: ${result}${confidence}
                                </div>
                                <div style="margin-top: 8px;">
                                    <button 
                                        onclick="viewExistingImage(${imageId})" 
                                        style="background: #10b981; color: white; padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                                        View Image Details →
                                    </button>
                                </div>
                            </div>
                        `);
                    } else {
                        showStatus('success', `✅ Complete! Image analyzed as ${result}${confidence}`);
                    }
                    
                    // Reset form
                    imageInput.value = '';
                    fileName.textContent = 'Choose an image...';
                    uploadBtn.disabled = true;
                    
                    setTimeout(() => loadImages(), 2000);
                    return;
                }
                
                // Show analysis progress
                showStatus('pending', '⏳ Step 2/3: Analyzing with AI...');
                
                // Wait a bit for analysis to start
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Get image ID from response - could be 'image_id', 'id', or nested in 'image'
                const imageId = data.image_id || data.id || (data.image && data.image.id);
                
                if (!imageId) {
                    console.error('❌ No image ID in response:', data);
                    showStatus('warning', '⚠️ Upload successful but cannot track analysis progress. Refreshing...');
                    setTimeout(() => loadImages(), 2000);
                    return;
                }
                
                console.log('✅ Image ID:', imageId);
                let attempts = 0;
                const maxAttempts = 30; // 30 seconds max
                
                while (attempts < maxAttempts) {
                    const checkResponse = await fetch(`${API_BASE_URL}/images/${imageId}`);
                    const imageData = await checkResponse.json();
                    
                    console.log(`🔍 Check attempt ${attempts + 1}:`, imageData);
                    
                    // The response structure is { image: {...}, votes: {...} }
                    const img = imageData.image || imageData;
                    
                    if (img.analysis_is_ai !== null && img.analysis_is_ai !== undefined) {
                        // Analysis complete
                        const result = img.analysis_is_ai === 1 ? 'AI-Generated' : 'Human-Created';
                        const confidence = img.analysis_score ? ` (${Math.round(img.analysis_score)}%)` : '';
                        
                        // Log completion
                        addLog('success', `✅ Image #${imageId} analysis complete: ${result}${confidence}`);
                        if (img.model) {
                            addLog('info', `🤖 Model used: ${img.model}`);
                        }
                        
                        showStatus('pending', `⏳ Step 3/3: Registering on blockchain...`);
                        
                        // Wait for blockchain registration and check for it
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        
                        // Check one more time for blockchain info
                        try {
                            const finalCheck = await fetch(`${API_BASE_URL}/images/${imageId}`);
                            const finalData = await finalCheck.json();
                            const finalImg = finalData.image || finalData;
                            
                            if (finalImg.blockchain_id && finalImg.blockchain_tx) {
                                // Construct Etherscan URL with 0x prefix
                                const txHash = finalImg.blockchain_tx.startsWith('0x') ? finalImg.blockchain_tx : `0x${finalImg.blockchain_tx}`;
                                const etherscanUrl = `https://sepolia.etherscan.io/tx/${txHash}`;
                                addLog('blockchain', 
                                    `⛓️ Image #${imageId} registered on blockchain! TX: <a href="${etherscanUrl}" target="_blank" class="console-link">${txHash.substring(0, 10)}...${txHash.substring(txHash.length - 8)}</a> | Chain ID: ${finalImg.blockchain_id}`
                                );
                            }
                        } catch (e) {
                            console.log('Could not fetch blockchain info:', e);
                        }
                        
                        showStatus('success', `✅ Complete! Image analyzed as ${result}${confidence}`);
                        break;
                    }
                    
                    // Update progress message
                    if (attempts % 3 === 0) {
                        showStatus('pending', `⏳ Step 2/3: AI analysis in progress... (${attempts}s)`);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    attempts++;
                }
                
                if (attempts >= maxAttempts) {
                    showStatus('warning', '⚠️ Upload successful but analysis is taking longer than expected. Check back soon!');
                }
            } else {
                showStatus('success', `✅ Image uploaded successfully! ${data.exists ? '(Already existed)' : ''}`);
            }
            
            // Reset form
            imageInput.value = '';
            fileName.textContent = 'Choose an image...';
            uploadBtn.disabled = true;

            // Reload images
            setTimeout(() => {
                loadImages();
            }, 1000);
        } else {
            showStatus('error', `❌ Upload failed: ${data.detail || 'Unknown error'}`);
        }
    } catch (error) {
        showStatus('error', `❌ Upload failed: ${error.message}`);
    } finally {
        document.querySelector('.btn-text').style.display = 'block';
        document.querySelector('.loader').style.display = 'none';
        uploadBtn.disabled = false;
    }
}

// Load Images
async function loadImages() {
    loadingSpinner.style.display = 'flex';
    imagesGrid.style.display = 'none';
    noImages.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE_URL}/images?limit=100&offset=0`);
        const data = await response.json();

        allImages = data.items || [];
        
        if (allImages.length === 0) {
            noImages.style.display = 'block';
        } else {
            renderImages();
        }

        updateStats();
    } catch (error) {
        console.error('Failed to load images:', error);
        showStatus('error', 'Failed to load images');
    } finally {
        loadingSpinner.style.display = 'none';
        imagesGrid.style.display = 'grid';
    }
}

// Filter Images
function filterImages() {
    switch (currentFilter) {
        case 'ai':
            return allImages.filter(img => img.analysis_is_ai === 1);
        case 'human':
            return allImages.filter(img => img.analysis_is_ai === 0);
        case 'unanalyzed':
            return allImages.filter(img => img.analysis_is_ai === null);
        default:
            return allImages;
    }
}

// Render Images
function renderImages() {
    const filteredImages = filterImages();
    imagesGrid.innerHTML = '';

    if (filteredImages.length === 0) {
        noImages.style.display = 'block';
        imagesGrid.style.display = 'none';
        return;
    }

    noImages.style.display = 'none';
    imagesGrid.style.display = 'grid';

    filteredImages.forEach(image => {
        const card = createImageCard(image);
        imagesGrid.appendChild(card);
    });
}

// Create Image Card
function createImageCard(image) {
    const card = document.createElement('div');
    card.className = 'image-card';
    card.onclick = () => openModal(image);

    const aiBadge = getAIBadge(image.analysis_is_ai, image.analysis_score);
    
    // Add score display if available
    let scoreDisplay = '';
    if (image.analysis_score !== null && image.analysis_score !== undefined) {
        const percentage = Math.round(image.analysis_score);
        const color = percentage >= 50 ? '#ef4444' : '#10b981';
        scoreDisplay = `
            <div style="margin-top: 0.5rem; font-size: 0.85rem; color: #6b7280;">
                AI Confidence: <strong style="color: ${color}">${percentage}%</strong>
            </div>
        `;
    }
    
    // Add retry button for unanalyzed images
    let retryButton = '';
    if (image.analysis_is_ai === null) {
        retryButton = `
            <button class="btn btn-sm" style="margin-top: 0.5rem; width: 100%;" 
                    onclick="event.stopPropagation(); retryAnalysis(${image.id}, event)">
                🔄 Analyze Now
            </button>
        `;
    }
    
    const truncatedComment = image.analysis_comment 
        ? (image.analysis_comment.substring(0, 150) + '...') 
        : 'No analysis available';

    card.innerHTML = `
        <img src="${API_BASE_URL}/images/${image.id}/data" 
             alt="Image ${image.id}" 
             class="image-card-img"
             loading="lazy">
        <div class="image-card-body">
            <div class="image-card-header">
                <span class="image-id">ID: ${image.id}</span>
                ${aiBadge}
            </div>
            ${scoreDisplay}
            ${retryButton}
            <div class="image-card-comment">
                ${truncatedComment}
            </div>
            <div class="image-card-footer">
                <div class="vote-count" id="votes-${image.id}">
                    <span>🤖 <strong>-</strong></span>
                    <span>👤 <strong>-</strong></span>
                </div>
                <span class="timestamp">${formatDate(image.created_at)}</span>
            </div>
        </div>
    `;

    // Load vote counts
    loadVoteCounts(image.id);

    return card;
}

// Get AI Badge with Score
function getAIBadge(isAI, score = null) {
    if (score !== null && score !== undefined) {
        const percentage = Math.round(score);
        let label, icon, className;
        
        if (percentage >= 75) {
            label = 'Very Likely AI';
            icon = '🤖';
            className = 'ai';
        } else if (percentage >= 50) {
            label = 'Possibly AI';
            icon = '🤔';
            className = 'ai';
        } else if (percentage >= 25) {
            label = 'Possibly Human';
            icon = '👤';
            className = 'human';
        } else {
            label = 'Very Likely Human';
            icon = '👤';
            className = 'human';
        }
        
        return `<span class="ai-badge ${className}" title="AI Score: ${percentage}/100">
                    ${icon} ${label} (${percentage}%)
                </span>`;
    } else if (isAI === 1) {
        return '<span class="ai-badge ai">🤖 AI Generated</span>';
    } else if (isAI === 0) {
        return '<span class="ai-badge human">👤 Human Made</span>';
    } else {
        return '<span class="ai-badge unknown">❓ Not Analyzed</span>';
    }
}

// Load Vote Counts
async function loadVoteCounts(imageId) {
    try {
        const response = await fetch(`${API_BASE_URL}/images/${imageId}`);
        const data = await response.json();
        
        if (data.image) {
            updateVoteDisplay(imageId, data.votes || { ai: 0, human: 0 });
        }
    } catch (error) {
        console.error('Failed to load votes:', error);
    }
}

// Update Vote Display
function updateVoteDisplay(imageId, votes) {
    const voteElement = document.getElementById(`votes-${imageId}`);
    if (voteElement) {
        voteElement.innerHTML = `
            <span>🤖 <strong>${votes.ai || 0}</strong></span>
            <span>👤 <strong>${votes.human || 0}</strong></span>
        `;
    }
}

// Update Statistics
function updateStats() {
    const total = allImages.length;
    const ai = allImages.filter(img => img.analysis_is_ai === 1).length;
    const human = allImages.filter(img => img.analysis_is_ai === 0).length;

    document.getElementById('totalCount').textContent = total;
    document.getElementById('aiCount').textContent = ai;
    document.getElementById('humanCount').textContent = human;
}

// View Existing Image (for duplicate uploads)
async function viewExistingImage(imageId) {
    try {
        // Fetch the image data
        const response = await fetch(`${API_BASE_URL}/images/${imageId}`);
        if (!response.ok) {
            showStatus('error', '❌ Failed to load image');
            return;
        }
        
        const data = await response.json();
        if (data.image) {
            // Open the modal with the existing image
            await openModal(data.image);
            
            // Scroll to top to ensure modal is visible
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (error) {
        console.error('Failed to view existing image:', error);
        showStatus('error', '❌ Failed to load image');
    }
}

// Make viewExistingImage globally accessible for inline onclick handlers
window.viewExistingImage = viewExistingImage;

// Open Modal
async function openModal(image) {
    currentImageData = image; // Store for blockchain operations
    modal.classList.add('show');
    modalImage.src = `${API_BASE_URL}/images/${image.id}/data`;

    // Load full image details
    try {
        const response = await fetch(`${API_BASE_URL}/images/${image.id}`);
        const data = await response.json();
        
        if (data.image) {
            displayModalInfo(data.image, data.votes || { ai: 0, human: 0 });
            
            // Load blockchain info if wallet is connected
            if (window.web3Manager && window.web3Manager.account) {
                await loadImageBlockchainInfo(image.id);
            }
        }
    } catch (error) {
        console.error('Failed to load image details:', error);
    }
}

// Display Modal Info
function displayModalInfo(image, votes) {
    const aiBadge = getAIBadge(image.analysis_is_ai, image.analysis_score);
    
    // Create score progress bar if score exists
    let scoreBar = '';
    if (image.analysis_score !== null && image.analysis_score !== undefined) {
        const percentage = Math.round(image.analysis_score);
        const color = percentage >= 50 ? '#ef4444' : '#10b981';
        scoreBar = `
        <div class="info-row" style="flex-direction: column; align-items: flex-start; gap: 0.5rem;">
            <span class="info-label">AI Detection Score:</span>
            <div style="width: 100%; background: #e5e7eb; border-radius: 8px; height: 24px; position: relative; overflow: hidden;">
                <div style="width: ${percentage}%; background: ${color}; height: 100%; transition: width 0.3s ease;"></div>
                <span style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font-weight: bold; font-size: 0.85rem; color: #000; z-index: 1;">
                    ${percentage}% AI
                </span>
            </div>
        </div>
        `;
    }
    
    modalInfo.innerHTML = `
        <div class="info-row">
            <span class="info-label">Image ID:</span>
            <span class="info-value">${image.id}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Status:</span>
            <span class="info-value">${aiBadge}</span>
        </div>
        ${scoreBar}
        <div class="info-row">
            <span class="info-label">SHA-256:</span>
            <span class="info-value" style="font-size: 0.8rem; word-break: break-all;">
                ${image.sha256}
            </span>
        </div>
        <div class="info-row">
            <span class="info-label">Model:</span>
            <span class="info-value">${image.model || 'N/A'}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Uploaded:</span>
            <span class="info-value">${formatDate(image.created_at)}</span>
        </div>
        ${image.analysis_comment ? `
        <div class="info-row" style="flex-direction: column; align-items: flex-start; gap: 0.5rem;">
            <span class="info-label">Analysis:</span>
            <span class="info-value" style="line-height: 1.6;">
                ${image.analysis_comment}
            </span>
        </div>
        ` : ''}
    `;

    // Update vote stats
    const voteStats = document.getElementById('voteStats');
    voteStats.innerHTML = `
        <span>🤖 AI Votes: <strong>${votes.ai || 0}</strong></span>
        <span>👤 Human Votes: <strong>${votes.human || 0}</strong></span>
    `;

    // Add voting method indicator
    const voteMethodIndicator = document.createElement('div');
    voteMethodIndicator.id = 'voteMethodIndicator';
    voteMethodIndicator.style.cssText = 'margin-top: 1rem; padding: 0.75rem; border-radius: 8px; font-size: 0.85rem; text-align: center;';
    
    if (window.web3Manager && window.web3Manager.account && image.blockchain_id) {
        const authenticated = isAuthenticated();
        const authIndicator = authenticated 
            ? '<span class="auth-dot"></span> Authenticated' 
            : '<span style="color: #fbbf24;">⚠️ Not Authenticated</span>';
        
        voteMethodIndicator.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)';
        voteMethodIndicator.style.color = 'white';
        voteMethodIndicator.innerHTML = `
            🦊 <strong>MetaMask Voting Available</strong><br>
            <span style="font-size: 0.85rem; opacity: 0.95;">${authIndicator} • ${window.web3Manager.formatAddress(window.web3Manager.account)}</span><br>
            <span style="font-size: 0.75rem; opacity: 0.8;">${authenticated ? 'You will sign the transaction and pay gas fees' : 'Please connect & authenticate to vote'}</span>
        `;
    } else {
        voteMethodIndicator.style.background = '#f3f4f6';
        voteMethodIndicator.style.color = '#374151';
        voteMethodIndicator.innerHTML = `
            🚀 <strong>Quick Vote Mode</strong><br>
            <span style="font-size: 0.75rem; opacity: 0.8;">Server signs transaction (no wallet needed)</span>
        `;
    }
    
    modalInfo.appendChild(voteMethodIndicator);

    // Setup vote buttons
    setupVoteButtons(image.id);
}

// Vote with MetaMask (user's wallet)
async function voteWithMetaMask(imageId, blockchainId, isAI, voteStatus, voteButtons) {
    try {
        // Check authentication
        if (!isAuthenticated()) {
            throw new Error('Please connect and authenticate your wallet first');
        }
        
        const userAddress = getAuthenticatedAddress();
        addLog('info', `🦊 Voting with authenticated wallet: ${formatAddress(userAddress)}`);
        
        // Check if user already voted
        const hasVoted = await window.web3Manager.hasVoted(blockchainId);
        if (hasVoted) {
            throw new Error('You have already voted on this image from your wallet');
        }
        
        voteStatus.innerHTML = '🦊 Waiting for MetaMask confirmation...';
        
        // Cast vote through MetaMask
        const tx = await window.web3Manager.voteOnImage(blockchainId, isAI);
        
        voteStatus.innerHTML = '⏳ Transaction submitted, waiting for confirmation...';
        addLog('blockchain', `📤 Transaction submitted: ${tx.hash}`);
        
        // Wait for transaction to be mined
        const receipt = await tx.wait();
        
        // Wait a bit for state to finalize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Get updated vote counts from blockchain
        const votes = await window.web3Manager.getVotes(blockchainId);
        
        const txHash = receipt.transactionHash;
        const etherscanUrl = `https://sepolia.etherscan.io/tx/${txHash}`;
        
        addLog('blockchain', 
            `⛓️ Vote confirmed! TX: <a href="${etherscanUrl}" target="_blank" class="console-link">${txHash.substring(0, 10)}...${txHash.substring(txHash.length - 8)}</a> | Block: #${receipt.blockNumber} | Gas: ${receipt.gasUsed.toString()}`
        );
        
        const successMessage = `
            <div style="line-height: 1.6;">
                <div style="margin-bottom: 8px;">
                    <strong>🦊 Vote confirmed via MetaMask!</strong>
                </div>
                <div style="font-size: 0.9em; margin-bottom: 6px;">
                    📊 Vote Counts - AI: ${votes.ai}, Human: ${votes.human}
                </div>
                <div style="font-size: 0.85em; opacity: 0.9;">
                    🔗 Transaction: 
                    <a href="${etherscanUrl}" 
                       target="_blank" 
                       style="color: #4CAF50; text-decoration: underline;">
                        ${txHash.substring(0, 10)}...${txHash.substring(txHash.length - 8)}
                    </a>
                </div>
                <div style="font-size: 0.85em; opacity: 0.9; margin-top: 4px;">
                    📦 Block: #${receipt.blockNumber} | ⛽ Gas: ${receipt.gasUsed.toString()}
                </div>
                <div style="font-size: 0.8em; opacity: 0.8; margin-top: 8px; color: #8b5cf6;">
                    ✓ Voted from authenticated wallet: ${formatAddress(userAddress)}
                </div>
            </div>
        `;
        
        voteStatus.className = 'vote-status success';
        voteStatus.innerHTML = successMessage;
        
        // Update stats display
        const voteStats = document.getElementById('voteStats');
        voteStats.innerHTML = `
            <span>🤖 AI Votes: <strong>${votes.ai}</strong></span>
            <span>👤 Human Votes: <strong>${votes.human}</strong></span>
        `;

        // Update card vote count if visible
        updateVoteDisplay(imageId, { ai: votes.ai, human: votes.human });
        
        // Keep buttons disabled after successful vote
        
    } catch (error) {
        console.error('MetaMask voting error:', error);
        addLog('error', `❌ MetaMask vote failed: ${error.message}`);
        
        voteStatus.className = 'vote-status error';
        
        // Special handling for authentication error
        if (!isAuthenticated()) {
            voteStatus.innerHTML = `
                <div class="auth-required">
                    <p>🔐 Wallet authentication required to vote</p>
                    <button class="vote-btn" onclick="connectWallet()" style="margin-top: 0.5rem;">
                        Connect & Authenticate Wallet
                    </button>
                </div>
            `;
        } else {
            voteStatus.textContent = `✗ MetaMask vote failed: ${error.message}`;
        }
        
        // Re-enable buttons on error
        voteButtons.forEach(b => b.disabled = false);
    }
}

// Setup Vote Buttons
function setupVoteButtons(imageId) {
    const voteButtons = document.querySelectorAll('.vote-btn');
    const voteStatus = document.getElementById('voteStatus');

    voteButtons.forEach(btn => {
        btn.onclick = async () => {
            const stance = btn.dataset.vote;
            const voterId = generateVoterId();

            // Show processing state
            voteStatus.className = 'vote-status processing';
            voteStatus.innerHTML = '⏳ Processing your vote...';
            
            // Log vote attempt
            addLog('info', `📊 Casting vote for Image #${imageId} as ${stance === 'ai' ? 'AI-Generated' : 'Human-Created'}...`);
            
            // Disable buttons during voting
            voteButtons.forEach(b => b.disabled = true);

            try {
                // Check if user has MetaMask connected - if so, use blockchain voting
                if (window.web3Manager && window.web3Manager.account && currentImageData && currentImageData.blockchain_id) {
                    await voteWithMetaMask(imageId, currentImageData.blockchain_id, stance === 'ai', voteStatus, voteButtons);
                    return;
                }

                // Otherwise, fall back to server-side voting
                const response = await fetch(`${API_BASE_URL}/images/${imageId}/vote`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        is_ai: stance === 'ai',
                        voter_id: voterId
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    // Log successful vote
                    if (data.blockchain && data.blockchain.tx_hash) {
                        const txHash = data.blockchain.tx_hash.startsWith('0x') ? data.blockchain.tx_hash : `0x${data.blockchain.tx_hash}`;
                        const etherscanUrl = data.blockchain.etherscan_url || `https://sepolia.etherscan.io/tx/${txHash}`;
                        addLog('blockchain', 
                            `⛓️ Vote registered on blockchain! TX: <a href="${etherscanUrl}" target="_blank" class="console-link">${txHash.substring(0, 10)}...${txHash.substring(txHash.length - 8)}</a> | Block: #${data.blockchain.block_number || 'pending'}`
                        );
                    } else {
                        addLog('success', `✅ Vote recorded in database - AI: ${data.counts.ai}, Human: ${data.counts.human}`);
                    }
                    
                    // Build success message
                    let successMessage = `✓ Vote recorded! AI: ${data.counts.ai}, Human: ${data.counts.human}`;
                    
                    // Add blockchain info if available
                    if (data.blockchain && data.blockchain.tx_hash) {
                        successMessage = `
                            <div style="line-height: 1.6;">
                                <div style="margin-bottom: 8px;">
                                    <strong>✓ Successfully registered on blockchain!</strong>
                                </div>
                                <div style="font-size: 0.9em; margin-bottom: 6px;">
                                    📊 Vote Counts - AI: ${data.counts.ai}, Human: ${data.counts.human}
                                </div>
                                <div style="font-size: 0.85em; opacity: 0.9;">
                                    🔗 Transaction: 
                                    <a href="${data.blockchain.etherscan_url}" 
                                       target="_blank" 
                                       style="color: #4CAF50; text-decoration: underline;">
                                        ${data.blockchain.tx_hash.substring(0, 10)}...${data.blockchain.tx_hash.substring(data.blockchain.tx_hash.length - 8)}
                                    </a>
                                </div>
                                ${data.blockchain.block_number ? `
                                <div style="font-size: 0.85em; opacity: 0.9; margin-top: 4px;">
                                    📦 Block: #${data.blockchain.block_number}
                                </div>
                                ` : ''}
                            </div>
                        `;
                    }
                    
                    voteStatus.className = 'vote-status success';
                    voteStatus.innerHTML = successMessage;
                    
                    // Update stats display
                    const voteStats = document.getElementById('voteStats');
                    voteStats.innerHTML = `
                        <span>🤖 AI Votes: <strong>${data.counts.ai}</strong></span>
                        <span>👤 Human Votes: <strong>${data.counts.human}</strong></span>
                    `;

                    // Update card vote count if visible
                    updateVoteDisplay(imageId, data.counts);
                } else {
                    // Log error
                    addLog('error', `❌ Vote failed for Image #${imageId}: ${data.detail || 'Unknown error'}`);
                    
                    voteStatus.className = 'vote-status error';
                    voteStatus.textContent = `✗ Failed to record vote: ${data.detail || 'Unknown error'}`;
                    // Re-enable buttons on error
                    voteButtons.forEach(b => b.disabled = false);
                }
            } catch (error) {
                // Log exception
                addLog('error', `❌ Vote request failed for Image #${imageId}: ${error.message}`);
                
                voteStatus.className = 'vote-status error';
                voteStatus.textContent = `✗ Failed to record vote: ${error.message}`;
                // Re-enable buttons on error
                voteButtons.forEach(b => b.disabled = false);
            }
        };
    });
}

// Blockchain Functions
async function loadImageBlockchainInfo(imageId) {
    try {
        // Fetch blockchain info from backend
        const response = await fetch(`${API_BASE_URL}/images/${imageId}/blockchain`);
        
        if (!response.ok) {
            console.log('No blockchain info available for this image');
            return;
        }
        
        const data = await response.json();
        
        if (data.blockchain_id) {
            // Show blockchain info section
            displayBlockchainInfo(data);
            
            // Check if user has voted
            if (window.web3Manager && window.web3Manager.account) {
                await checkUserVoted(data.blockchain_id);
            }
        }
    } catch (error) {
        console.error('Failed to load blockchain info:', error);
    }
}

function displayBlockchainInfo(blockchainData) {
    const blockchainInfoSection = document.getElementById('blockchainInfo');
    const blockchainVoteSection = document.getElementById('blockchainVoteSection');
    
    if (!blockchainInfoSection || !blockchainVoteSection) {
        return;
    }
    
    // Show blockchain ID and Etherscan link
    blockchainInfoSection.innerHTML = `
        <span class="blockchain-badge">
            ⛓️ Blockchain ID: <strong>${blockchainData.blockchain_id}</strong>
        </span>
        <a href="https://sepolia.etherscan.io/tx/${blockchainData.register_tx_hash}" 
           target="_blank" 
           class="etherscan-link">
            View on Etherscan ↗
        </a>
    `;
    
    blockchainInfoSection.style.display = 'flex';
    
    // Show blockchain voting section if wallet is connected
    if (window.web3Manager && window.web3Manager.account) {
        blockchainVoteSection.style.display = 'block';
        setupBlockchainVoteButtons(blockchainData.blockchain_id);
    }
}

async function checkUserVoted(blockchainId) {
    if (!window.web3Manager || !window.web3Manager.account) {
        return;
    }
    
    try {
        const hasVoted = await window.web3Manager.hasVoted(blockchainId, window.web3Manager.account);
        
        if (hasVoted) {
            // Disable vote buttons and show message
            const blockchainVoteButtons = document.querySelectorAll('.blockchain-vote-btn');
            blockchainVoteButtons.forEach(btn => {
                btn.disabled = true;
                btn.style.opacity = '0.5';
            });
            
            const txStatus = document.getElementById('txStatus');
            txStatus.className = 'tx-status info';
            txStatus.innerHTML = '✓ You have already voted on blockchain';
        }
    } catch (error) {
        console.error('Error checking vote status:', error);
    }
}

function setupBlockchainVoteButtons(blockchainId) {
    const blockchainVoteButtons = document.querySelectorAll('.blockchain-vote-btn');
    const txStatus = document.getElementById('txStatus');
    
    blockchainVoteButtons.forEach(btn => {
        btn.onclick = async () => {
            const stance = btn.dataset.vote;
            const isAI = stance === 'ai';
            
            // Clear previous status
            txStatus.className = 'tx-status';
            txStatus.innerHTML = '';
            
            try {
                // Disable buttons during transaction
                blockchainVoteButtons.forEach(b => b.disabled = true);
                
                // Show pending status
                txStatus.className = 'tx-status pending';
                txStatus.innerHTML = '⏳ Preparing transaction... Please confirm in MetaMask';
                
                // Get gas estimate
                const gasEstimate = await window.web3Manager.estimateVoteGas(blockchainId, isAI);
                const gasPrice = await window.web3Manager.provider.getGasPrice();
                const gasCost = ethers.utils.formatEther(gasEstimate.mul(gasPrice));
                
                // Update status with gas estimate
                txStatus.innerHTML = `
                    ⏳ Transaction pending...
                    <div class="gas-estimate">Est. Gas: ${gasCost.substring(0, 8)} ETH</div>
                `;
                
                // Send vote transaction
                const tx = await window.web3Manager.voteOnImage(blockchainId, isAI);
                
                // Update status - waiting for confirmation
                txStatus.className = 'tx-status pending';
                txStatus.innerHTML = `
                    ⏳ Transaction sent! Waiting for confirmation...
                    <a href="https://sepolia.etherscan.io/tx/${tx.hash}" 
                       target="_blank" 
                       class="etherscan-link">
                        View on Etherscan ↗
                    </a>
                `;
                
                // Wait for confirmation
                const receipt = await tx.wait();
                
                // Success!
                txStatus.className = 'tx-status success';
                txStatus.innerHTML = `
                    ✓ Vote recorded on blockchain!
                    <a href="https://sepolia.etherscan.io/tx/${receipt.transactionHash}" 
                       target="_blank" 
                       class="etherscan-link">
                        View on Etherscan ↗
                    </a>
                `;
                
                // Fetch updated vote counts from blockchain
                const votes = await window.web3Manager.getVotes(blockchainId);
                
                // Update blockchain vote display
                const blockchainVoteStats = document.getElementById('blockchainVoteStats');
                if (blockchainVoteStats) {
                    blockchainVoteStats.innerHTML = `
                        <span>⛓️ On-Chain Votes:</span>
                        <span>🤖 AI: <strong>${votes.aiVotes}</strong></span>
                        <span>👤 Human: <strong>${votes.humanVotes}</strong></span>
                    `;
                }
                
                // Keep buttons disabled (already voted)
                blockchainVoteButtons.forEach(b => {
                    b.disabled = true;
                    b.style.opacity = '0.5';
                });
                
            } catch (error) {
                console.error('Blockchain vote error:', error);
                
                // Re-enable buttons on error
                blockchainVoteButtons.forEach(b => b.disabled = false);
                
                // Show error message
                const errorMsg = window.web3Manager.parseError(error);
                txStatus.className = 'tx-status error';
                txStatus.innerHTML = `✗ ${errorMsg}`;
            }
        };
    });
}

// Utility Functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function generateVoterId() {
    // Generate a simple voter ID (could be improved with cookies/localStorage)
    let voterId = localStorage.getItem('voterId');
    if (!voterId) {
        voterId = 'voter_' + Math.random().toString(36).substring(7);
        localStorage.setItem('voterId', voterId);
    }
    return voterId;
}

function showStatus(type, message) {
    uploadStatus.className = `status-message ${type} show`;
    // Use innerHTML to support HTML content in messages
    uploadStatus.innerHTML = message;
}

function hideStatus() {
    uploadStatus.className = 'status-message';
}

// Retry Analysis for unanalyzed images
async function retryAnalysis(imageId, event) {
    try {
        console.log(`🔄 Retrying analysis for image ${imageId}`);
        
        // Get the button that was clicked
        const button = event ? event.target : document.querySelector(`button[onclick*="retryAnalysis(${imageId}"]`);
        if (!button) {
            console.error('Could not find button element');
            return;
        }
        
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '⏳ Analyzing...';
        
        // Trigger analysis
        const response = await fetch(`${API_BASE_URL}/images/${imageId}/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        
        if (!response.ok) {
            // Try to parse error message
            let errorMsg = 'Failed';
            try {
                const errorData = await response.json();
                errorMsg = errorData.detail || errorMsg;
            } catch (e) {
                errorMsg = await response.text();
            }
            console.error('Analysis failed:', errorMsg);
            button.innerHTML = '❌ Failed';
            button.disabled = false;
            setTimeout(() => {
                button.innerHTML = originalText;
            }, 3000);
            return;
        }
        
        const data = await response.json();
        console.log('✅ Analysis triggered:', data);
        
        // Poll for completion
        let attempts = 0;
        const maxAttempts = 30;
        
        while (attempts < maxAttempts) {
            const checkResponse = await fetch(`${API_BASE_URL}/images/${imageId}`);
            const imageData = await checkResponse.json();
            
            console.log(`🔍 Polling attempt ${attempts + 1}:`, imageData.image?.analysis_is_ai);
            
            if (imageData.image.analysis_is_ai !== null && imageData.image.analysis_is_ai !== undefined) {
                // Analysis complete!
                const result = imageData.image.analysis_is_ai === 1 ? 'AI-Generated' : 'Human-Created';
                button.innerHTML = `✅ ${result}`;
                
                // Reload images after 2 seconds
                setTimeout(() => {
                    loadImages();
                }, 2000);
                break;
            }
            
            // Update button with progress
            if (attempts % 3 === 0) {
                button.innerHTML = `⏳ Analyzing... ${attempts}s`;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
        
        if (attempts >= maxAttempts) {
            button.innerHTML = '⚠️ Taking too long';
            button.disabled = false;
            setTimeout(() => {
                button.innerHTML = originalText;
                loadImages(); // Refresh anyway
            }, 3000);
        }
    } catch (error) {
        console.error('❌ Retry analysis error:', error);
        // Try to find the button if event is not available
        const button = event?.target || document.querySelector(`button[onclick*="retryAnalysis(${imageId}"]`);
        if (button) {
            button.innerHTML = '❌ Error';
            button.disabled = false;
            setTimeout(() => {
                button.innerHTML = '🔄 Analyze Now';
            }, 3000);
        }
    }
}

// Make retryAnalysis globally accessible
window.retryAnalysis = retryAnalysis;

// ============================================
// Activity Console Functions
// ============================================

const consoleHeader = document.getElementById('consoleHeader');
const consoleToggle = document.getElementById('consoleToggle');
const consoleBody = document.getElementById('consoleBody');
const consoleLogs = document.getElementById('consoleLogs');
const logCount = document.getElementById('logCount');
const toggleIcon = document.getElementById('toggleIcon');
const toggleText = document.getElementById('toggleText');
const clearLogsBtn = document.getElementById('clearLogsBtn');
const copyLogsBtn = document.getElementById('copyLogsBtn');

let consoleIsOpen = false;
let logEntries = [];

// Toggle console visibility
function toggleConsole() {
    consoleIsOpen = !consoleIsOpen;
    
    if (consoleIsOpen) {
        consoleBody.style.display = 'flex';
        toggleIcon.textContent = '▼';
        toggleText.textContent = 'Hide';
        // Auto-scroll to bottom when opening
        setTimeout(() => {
            consoleLogs.scrollTop = consoleLogs.scrollHeight;
        }, 100);
    } else {
        consoleBody.style.display = 'none';
        toggleIcon.textContent = '▲';
        toggleText.textContent = 'Show';
    }
}

// Add log entry
function addLog(type, message, data = null) {
    const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
    
    const entry = {
        type,
        timestamp,
        message,
        data
    };
    
    logEntries.push(entry);
    
    // Update count badge
    logCount.textContent = logEntries.length;
    
    // Create log element
    const logElement = document.createElement('div');
    logElement.className = `console-entry console-${type}`;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'console-time';
    timeSpan.textContent = `[${timestamp}]`;
    
    const messageSpan = document.createElement('span');
    messageSpan.className = 'console-message';
    messageSpan.innerHTML = message; // Use innerHTML to support links
    
    logElement.appendChild(timeSpan);
    logElement.appendChild(messageSpan);
    
    consoleLogs.appendChild(logElement);
    
    // Auto-scroll to bottom if console is open
    if (consoleIsOpen) {
        consoleLogs.scrollTop = consoleLogs.scrollHeight;
    }
    
    // Show notification badge if console is closed
    if (!consoleIsOpen) {
        logCount.style.animation = 'pulse 0.5s ease-in-out 2';
    }
}

// Clear all logs
function clearLogs() {
    logEntries = [];
    consoleLogs.innerHTML = `
        <div class="console-entry console-info">
            <span class="console-time">[System]</span>
            <span class="console-message">Logs cleared.</span>
        </div>
    `;
    logCount.textContent = '0';
}

// Copy all logs to clipboard
function copyLogs() {
    const allLogs = logEntries.map(entry => 
        `[${entry.timestamp}] ${entry.message.replace(/<[^>]*>/g, '')}`
    ).join('\n');
    
    navigator.clipboard.writeText(allLogs).then(() => {
        addLog('success', '✅ Logs copied to clipboard');
    }).catch(err => {
        addLog('error', '❌ Failed to copy logs: ' + err.message);
    });
}

// Event listeners
consoleHeader.addEventListener('click', toggleConsole);
consoleToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleConsole();
});
clearLogsBtn.addEventListener('click', clearLogs);
copyLogsBtn.addEventListener('click', copyLogs);

// Make addLog globally accessible
window.addLog = addLog;

// Log initial message
addLog('info', '🚀 Application initialized successfully');
