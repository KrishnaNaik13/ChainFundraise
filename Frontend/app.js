// ChainFundraise JavaScript Application

class ChainFundraise {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.userAddress = null;
        
        // Contract configuration
        this.contractAddress = "0x385Fe3499Aa649fFD7c59aA5cb2EB1B9763Fb490";
        
        // Contract ABI - Replace with your actual contract ABI
        this.contractABI = [
            // Campaign creation
            "function createCampaign(string memory _title, uint256 _goal, uint256 _duration, uint256 _minContribution) public returns (uint256)",
            
            // Contribution functions
            "function contribute(uint256 _campaignId) public payable",
            "function getContribution(uint256 _campaignId, address _contributor) public view returns (uint256)",
            
            // Fund management
            "function withdrawFunds(uint256 _campaignId) public",
            "function claimRefund(uint256 _campaignId) public",
            
            // Campaign data
            "function getCampaign(uint256 _campaignId) public view returns (tuple(string title, address creator, uint256 goal, uint256 raised, uint256 deadline, uint256 minContribution, bool withdrawn, bool active))",
            "function getCampaignCount() public view returns (uint256)",
            
            // Events
            "event CampaignCreated(uint256 indexed campaignId, address indexed creator, string title, uint256 goal, uint256 deadline)",
            "event ContributionMade(uint256 indexed campaignId, address indexed contributor, uint256 amount)",
            "event FundsWithdrawn(uint256 indexed campaignId, address indexed creator, uint256 amount)",
            "event RefundClaimed(uint256 indexed campaignId, address indexed contributor, uint256 amount)"
        ];

        this.init();
    }

    async init() {
        await this.setupEventListeners();
        await this.checkWalletConnection();
        this.updateContractStatus('checking', 'Checking connection...');
    }

    setupEventListeners() {
        // Connect wallet button
        document.getElementById('connectWallet').addEventListener('click', () => this.connectWallet());
        
        // Create campaign form
        document.getElementById('createCampaignForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createCampaign();
        });
        
        // Contribute button
        document.getElementById('contributeBtn').addEventListener('click', () => this.contribute());
        
        // Withdraw funds button
        document.getElementById('withdrawBtn').addEventListener('click', () => this.withdrawFunds());
        
        // Claim refund button
        document.getElementById('refundBtn').addEventListener('click', () => this.claimRefund());
        
        // Search campaigns
        document.getElementById('campaignSearch').addEventListener('input', (e) => {
            this.filterCampaigns(e.target.value);
        });

        // Form validation
        this.setupFormValidation();
    }

    setupFormValidation() {
        // Real-time validation for number inputs
        const numberInputs = document.querySelectorAll('input[type="number"]');
        numberInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                if (e.target.value < 0) {
                    e.target.value = 0;
                }
            });
        });

        // Goal and contribution validation
        document.getElementById('fundingGoal').addEventListener('input', (e) => {
            if (parseFloat(e.target.value) < 0.001) {
                e.target.setCustomValidity('Minimum goal is 0.001 ETH');
            } else {
                e.target.setCustomValidity('');
            }
        });

        document.getElementById('minContribution').addEventListener('input', (e) => {
            if (parseFloat(e.target.value) < 0.001) {
                e.target.setCustomValidity('Minimum contribution must be at least 0.001 ETH');
            } else {
                e.target.setCustomValidity('');
            }
        });
    }

    async checkWalletConnection() {
        if (typeof window.ethereum !== 'undefined') {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    await this.connectWallet();
                } else {
                    this.updateContractStatus('error', 'Wallet not connected');
                }
            } catch (error) {
                console.error('Error checking wallet connection:', error);
                this.updateContractStatus('error', 'Error checking wallet');
            }
        } else {
            this.updateContractStatus('error', 'MetaMask not installed');
        }
    }

    async connectWallet() {
        try {
            if (typeof window.ethereum === 'undefined') {
                this.showError('Please install MetaMask to use this application');
                return;
            }

            this.updateContractStatus('checking', 'Connecting wallet...');

            // Request account access
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            
            // Initialize provider and signer
            this.provider = new ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();
            this.userAddress = await this.signer.getAddress();
            
            // Check network
            const network = await this.provider.getNetwork();
            console.log('Connected to network:', network.name, network.chainId);
            
            // Initialize contract
            this.contract = new ethers.Contract(this.contractAddress, this.contractABI, this.signer);
            
            // Test contract connection
            await this.testContractConnection();
            
            // Update UI
            await this.updateWalletUI();
            this.updateContractStatus('connected', 'Connected to contract');
            
            // Load campaigns
            await this.loadCampaigns();
            
            // Setup event listeners
            this.setupContractEventListeners();
            
            // Listen for account changes
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    this.disconnectWallet();
                } else {
                    window.location.reload(); // Reload to reset state
                }
            });
            
            // Listen for network changes
            window.ethereum.on('chainChanged', () => {
                window.location.reload();
            });
            
        } catch (error) {
            console.error('Error connecting wallet:', error);
            this.showError('Failed to connect wallet: ' + error.message);
            this.updateContractStatus('error', 'Connection failed');
        }
    }

    async testContractConnection() {
        try {
            // Test if contract exists and is accessible
            await this.contract.getCampaignCount();
        } catch (error) {
            console.warn('Contract connection test failed:', error);
            throw new Error('Unable to connect to contract. Please check the contract address and network.');
        }
    }

    setupContractEventListeners() {
        if (!this.contract) return;

        // Listen for campaign creation
        this.contract.on('CampaignCreated', (campaignId, creator, title, goal, deadline) => {
            if (creator.toLowerCase() === this.userAddress.toLowerCase()) {
                this.showSuccess(`Campaign "${title}" created successfully! ID: ${campaignId}`);
            }
            this.loadCampaigns();
        });

        // Listen for contributions
        this.contract.on('ContributionMade', (campaignId, contributor, amount) => {
            if (contributor.toLowerCase() === this.userAddress.toLowerCase()) {
                this.showSuccess(`Contribution of ${ethers.formatEther(amount)} ETH made to campaign ${campaignId}`);
            }
            this.loadCampaigns();
        });

        // Listen for withdrawals
        this.contract.on('FundsWithdrawn', (campaignId, creator, amount) => {
            if (creator.toLowerCase() === this.userAddress.toLowerCase()) {
                this.showSuccess(`Successfully withdrew ${ethers.formatEther(amount)} ETH from campaign ${campaignId}`);
            }
            this.loadCampaigns();
        });

        // Listen for refunds
        this.contract.on('RefundClaimed', (campaignId, contributor, amount) => {
            if (contributor.toLowerCase() === this.userAddress.toLowerCase()) {
                this.showSuccess(`Refund of ${ethers.formatEther(amount)} ETH claimed from campaign ${campaignId}`);
            }
            this.loadCampaigns();
        });
    }

    disconnectWallet() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.userAddress = null;
        
        document.getElementById('connectWallet').style.display = 'block';
        document.getElementById('walletInfo').style.display = 'none';
        document.getElementById('campaignsList').innerHTML = '<div class="loading">Connect wallet to view campaigns</div>';
        this.updateContractStatus('error', 'Wallet disconnected');
    }

    async updateWalletUI() {
        if (this.userAddress && this.provider) {
            try {
                const balance = await this.provider.getBalance(this.userAddress);
                const balanceInEth = ethers.formatEther(balance);
                
                document.getElementById('connectWallet').style.display = 'none';
                document.getElementById('walletInfo').style.display = 'block';
                document.getElementById('walletAddress').textContent = 
                    `Address: ${this.userAddress.substring(0, 6)}...${this.userAddress.substring(38)}`;
                document.getElementById('walletBalance').textContent = 
                    `Balance: ${parseFloat(balanceInEth).toFixed(4)} ETH`;
            } catch (error) {
                console.error('Error updating wallet UI:', error);
            }
        }
    }

    updateContractStatus(status, message) {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-text');
        
        statusDot.className = `status-dot ${status}`;
        statusText.textContent = message;
    }

    async createCampaign() {
        if (!this.contract) {
            this.showError('Please connect your wallet first');
            return;
        }

        try {
            const title = document.getElementById('campaignTitle').value.trim();
            const goal = document.getElementById('fundingGoal').value;
            const duration = document.getElementById('campaignDuration').value;
            const minContribution = document.getElementById('minContribution').value;

            // Validation
            if (!title || title.length < 3) {
                this.showError('Campaign title must be at least 3 characters long');
                return;
            }

            if (!goal || parseFloat(goal) <= 0) {
                this.showError('Please enter a valid funding goal');
                return;
            }

            if (!duration || parseInt(duration) <= 0) {
                this.showError('Please enter a valid duration');
                return;
            }

            if (!minContribution || parseFloat(minContribution) <= 0) {
                this.showError('Please enter a valid minimum contribution');
                return;
            }

            if (parseFloat(minContribution) > parseFloat(goal)) {
                this.showError('Minimum contribution cannot be greater than funding goal');
                return;
            }

            const goalWei = ethers.parseEther(goal);
            const minContributionWei = ethers.parseEther(minContribution);
            const durationSeconds = parseInt(duration) * 24 * 60 * 60; // Convert days to seconds

            this.showTransactionStatus('Creating campaign...');

            // Estimate gas
            const gasEstimate = await this.contract.createCampaign.estimateGas(
                title, goalWei, durationSeconds, minContributionWei
            );

            const tx = await this.contract.createCampaign(
                title,
                goalWei,
                durationSeconds,
                minContributionWei,
                { gasLimit: gasEstimate * 110n / 100n } // Add 10% buffer
            );

            this.updateTransactionStatus('Transaction submitted...', tx.hash);
            const receipt = await tx.wait();

            this.hideTransactionStatus();
            
            // Extract campaign ID from events
            const campaignCreatedEvent = receipt.logs.find(log => {
                try {
                    return this.contract.interface.parseLog(log).name === 'CampaignCreated';
                } catch {
                    return false;
                }
            });

            let campaignId = 'Unknown';
            if (campaignCreatedEvent) {
                const parsedEvent = this.contract.interface.parseLog(campaignCreatedEvent);
                campaignId = parsedEvent.args[0].toString();
            }

            this.showSuccess(`Campaign created successfully! Campaign ID: ${campaignId}`);
            
            // Reset form
            document.getElementById('createCampaignForm').reset();
            
            // Reload campaigns
            await this.loadCampaigns();

        } catch (error) {
            this.hideTransactionStatus();
            console.error('Error creating campaign:', error);
            this.showError('Failed to create campaign: ' + (error.reason || error.message));
        }
    }

    async contribute() {
        if (!this.contract) {
            this.showError('Please connect your wallet first');
            return;
        }

        try {
            const campaignId = document.getElementById('campaignId').value;
            const amount = document.getElementById('contributionAmount').value;

            if (!campaignId || campaignId < 0) {
                this.showError('Please enter a valid campaign ID');
                return;
            }

            if (!amount || parseFloat(amount) <= 0) {
                this.showError('Please enter a valid contribution amount');
                return;
            }

            // Check if campaign exists and is active
            const campaign = await this.contract.getCampaign(campaignId);
            if (!campaign.active) {
                this.showError('Campaign is not active');
                return;
            }

            const now = Math.floor(Date.now() / 1000);
            if (Number(campaign.deadline) < now) {
                this.showError('Campaign deadline has passed');
                return;
            }

            const amountWei = ethers.parseEther(amount);
            
            // Check minimum contribution
            if (amountWei < campaign.minContribution) {
                const minEth = ethers.formatEther(campaign.minContribution);
                this.showError(`Minimum contribution is ${minEth} ETH`);
                return;
            }

            this.showTransactionStatus('Processing contribution...');

            // Estimate gas
            const gasEstimate = await this.contract.contribute.estimateGas(campaignId, { value: amountWei });

            const tx = await this.contract.contribute(campaignId, { 
                value: amountWei,
                gasLimit: gasEstimate * 110n / 100n
            });
            
            this.updateTransactionStatus('Transaction submitted...', tx.hash);
            await tx.wait();

            this.hideTransactionStatus();
            this.showSuccess(`Contribution of ${amount} ETH successful!`);
            
            // Clear inputs
            document.getElementById('campaignId').value = '';
            document.getElementById('contributionAmount').value = '';
            
            // Update wallet balance and reload campaigns
            await this.updateWalletUI();
            await this.loadCampaigns();

        } catch (error) {
            this.hideTransactionStatus();
            console.error('Error contributing:', error);
            this.showError('Failed to contribute: ' + (error.reason || error.message));
        }
    }

    async withdrawFunds() {
        if (!this.contract) {
            this.showError('Please connect your wallet first');
            return;
        }

        try {
            const campaignId = document.getElementById('manageCampaignId').value;

            if (!campaignId || campaignId < 0) {
                this.showError('Please enter a valid campaign ID');
                return;
            }

            // Check campaign details
            const campaign = await this.contract.getCampaign(campaignId);
            
            if (campaign.creator.toLowerCase() !== this.userAddress.toLowerCase()) {
                this.showError('Only the campaign creator can withdraw funds');
                return;
            }

            if (campaign.withdrawn) {
                this.showError('Funds have already been withdrawn');
                return;
            }

            if (campaign.raised < campaign.goal) {
                this.showError('Campaign has not reached its funding goal');
                return;
            }

            this.showTransactionStatus('Processing withdrawal...');

            const gasEstimate = await this.contract.withdrawFunds.estimateGas(campaignId);
            const tx = await this.contract.withdrawFunds(campaignId, {
                gasLimit: gasEstimate * 110n / 100n
            });
            
            this.updateTransactionStatus('Transaction submitted...', tx.hash);
            await tx.wait();

            this.hideTransactionStatus();
            this.showSuccess('Funds withdrawn successfully!');
            
            // Update wallet balance and reload campaigns
            await this.updateWalletUI();
            await this.loadCampaigns();

        } catch (error) {
            this.hideTransactionStatus();
            console.error('Error withdrawing funds:', error);
            this.showError('Failed to withdraw funds: ' + (error.reason || error.message));
        }
    }

    async claimRefund() {
        if (!this.contract) {
            this.showError('Please connect your wallet first');
            return;
        }

        try {
            const campaignId = document.getElementById('manageCampaignId').value;

            if (!campaignId || campaignId < 0) {
                this.showError('Please enter a valid campaign ID');
                return;
            }

            // Check if user has contributed
            const contribution = await this.contract.getContribution(campaignId, this.userAddress);
            if (contribution === 0n) {
                this.showError('You have not contributed to this campaign');
                return;
            }

            // Check campaign status
            const campaign = await this.contract.getCampaign(campaignId);
            const now = Math.floor(Date.now() / 1000);
            
            if (campaign.raised >= campaign.goal && Number(campaign.deadline) > now) {
                this.showError('Campaign is still active and funded. Refunds not available.');
                return;
            }

            this.showTransactionStatus('Processing refund...');

            const gasEstimate = await this.contract.claimRefund.estimateGas(campaignId);
            const tx = await this.contract.claimRefund(campaignId, {
                gasLimit: gasEstimate * 110n / 100n
            });
            
            this.updateTransactionStatus('Transaction submitted...', tx.hash);
            await tx.wait();

            this.hideTransactionStatus();
            this.showSuccess('Refund claimed successfully!');
            
            // Update wallet balance and reload campaigns
            await this.updateWalletUI();
            await this.loadCampaigns();

        } catch (error) {
            this.hideTransactionStatus();
            console.error('Error claiming refund:', error);
            this.showError('Failed to claim refund: ' + (error.reason || error.message));
        }
    }

    async loadCampaigns() {
        if (!this.contract) {
            document.getElementById('campaignsList').innerHTML = 
                '<div class="loading">Connect wallet to view campaigns</div>';
            return;
        }

        try {
            document.getElementById('campaignsList').innerHTML = 
                '<div class="loading">Loading campaigns...</div>';

            const campaignCount = await this.contract.getCampaignCount();
            const campaigns = [];

            // Load campaigns in parallel for better performance
            const campaignPromises = [];
            for (let i = 0; i < campaignCount; i++) {
                campaignPromises.push(
                    this.contract.getCampaign(i)
                        .then(campaign => ({ id: i, ...campaign }))
                        .catch(error => {
                            console.warn(`Failed to load campaign ${i}:`, error);
                            return null;
                        })
                );
            }

            const results = await Promise.all(campaignPromises);
            campaigns.push(...results.filter(campaign => campaign !== null));

            // Sort campaigns by ID (newest first)
            campaigns.sort((a, b) => b.id - a.id);

            this.displayCampaigns(campaigns);

        } catch (error) {
            console.error('Error loading campaigns:', error);
            document.getElementById('campaignsList').innerHTML = 
                '<div class="error-message">Failed to load campaigns: ' + error.message + '</div>';
        }
    }

    displayCampaigns(campaigns) {
        const campaignsList = document.getElementById('campaignsList');

        if (campaigns.length === 0) {
            campaignsList.innerHTML = '<div class="loading">No campaigns found</div>';
            return;
        }

        let html = '';
        campaigns.forEach(campaign => {
            const progress = campaign.goal > 0 ? (Number(campaign.raised) * 100 / Number(campaign.goal)) : 0;
            const deadline = new Date(Number(campaign.deadline) * 1000);
            const now = new Date();
            const isExpired = deadline < now;
            const daysLeft = Math.max(0, Math.ceil((deadline - now) / (1000 * 60 * 60 * 24)));
            
            let statusText = 'Active';
            let statusClass = 'text-success';
            
            if (!campaign.active) {
                statusText = 'Inactive';
                statusClass = 'text-danger';
            } else if (isExpired) {
                statusText = campaign.raised >= campaign.goal ? 'Funded (Expired)' : 'Failed (Expired)';
                statusClass = campaign.raised >= campaign.goal ? 'text-warning' : 'text-danger';
            } else if (campaign.raised >= campaign.goal) {
                statusText = 'Funded';
                statusClass = 'text-success';
            }

            const goalEth = parseFloat(ethers.formatEther(campaign.goal));
            const raisedEth = parseFloat(ethers.formatEther(campaign.raised));
            const minContribEth = parseFloat(ethers.formatEther(campaign.minContribution));
            
            html += `
                <div class="campaign-item" data-campaign-id="${campaign.id}">
                    <h4>${campaign.title} <span style="color: #666; font-size: 0.9em;">(ID: ${campaign.id})</span></h4>
                    <p><strong>Creator:</strong> <span class="contract-address" style="font-size: 0.8em;">${campaign.creator}</span></p>
                    <p><strong>Goal:</strong> ${goalEth} ETH</p>
                    <p><strong>Raised:</strong> ${raisedEth.toFixed(4)} ETH</p>
                    <p><strong>Min Contribution:</strong> ${minContribEth} ETH</p>
                    <p><strong>Deadline:</strong> ${deadline.toLocaleDateString()} ${deadline.toLocaleTimeString()} ${!isExpired ? `(${daysLeft} days left)` : ''}</p>
                    <p><strong>Status:</strong> <span class="${statusClass}">${statusText}</span></p>
                    ${campaign.withdrawn ? '<p><strong>Funds:</strong> <span class="text-warning">Withdrawn</span></p>' : ''}
                    <div class="campaign-progress">
                        <div class="campaign-progress-bar" style="width: ${Math.min(progress, 100)}%"></div>
                    </div>
                    <p><small>${progress.toFixed(2)}% funded (${raisedEth.toFixed(4)} / ${goalEth} ETH)</small></p>
                </div>
            `;
        });

        campaignsList.innerHTML = html;

        // Add click handlers for quick-fill
        document.querySelectorAll('.campaign-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const campaignId = e.currentTarget.dataset.campaignId;
                
                // Fill campaign ID in contribution section
                document.getElementById('campaignId').value = campaignId;
                document.getElementById('manageCampaignId').value = campaignId;
                
                // Highlight the clicked campaign
                document.querySelectorAll('.campaign-item').forEach(c => c.style.borderLeft = '4px solid #667eea');
                e.currentTarget.style.borderLeft = '4px solid #28a745';
            });
        });
    }

    filterCampaigns(searchTerm) {
        const campaignItems = document.querySelectorAll('.campaign-item');
        const term = searchTerm.toLowerCase().trim();
        
        campaignItems.forEach(item => {
            const text = item.textContent.toLowerCase();
            const shouldShow = !term || text.includes(term);
            item.style.display = shouldShow ? 'block' : 'none';
        });

        // Show message if no results
        const visibleItems = Array.from(campaignItems).filter(item => item.style.display !== 'none');
        const campaignsList = document.getElementById('campaignsList');
        
        if (term && visibleItems.length === 0) {
            const noResultsDiv = document.createElement('div');
            noResultsDiv.className = 'loading';
            noResultsDiv.textContent = `No campaigns found matching "${searchTerm}"`;
            noResultsDiv.id = 'no-results-message';
            campaignsList.appendChild(noResultsDiv);
        } else {
            const existingMessage = document.getElementById('no-results-message');
            if (existingMessage) {
                existingMessage.remove();
            }
        }
    }

    showTransactionStatus(message) {
        document.getElementById('statusMessage').textContent = message;
        document.getElementById('etherscanLink').style.display = 'none';
        document.getElementById('transactionStatus').style.display = 'flex';
    }

    updateTransactionStatus(message, txHash) {
        document.getElementById('statusMessage').textContent = message;
        if (txHash) {
            const link = document.getElementById('etherscanLink');
            // Default to mainnet, you might want to detect the network
            link.href = `https://etherscan.io/tx/${txHash}`;
            link.style.display = 'block';
        }
    }

    hideTransactionStatus() {
        document.getElementById('transactionStatus').style.display = 'none';
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showMessage(message, type) {
        // Remove existing messages
        const existingMessages = document.querySelectorAll('.error-message, .success-message');
        existingMessages.forEach(msg => msg.remove());

        // Create message element
        const messageDiv = document.createElement('div');
        messageDiv.className = type === 'error' ? 'error-message' : 'success-message';
        messageDiv.textContent = message;
        
        // Insert at top of container
        const container = document.querySelector('.container');
        container.insertBefore(messageDiv, container.firstChild);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 5000);
        
        // Scroll to top to show message
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Utility function to format addresses
    formatAddress(address) {
        return `${address.substring(0, 6)}...${address.substring(38)}`;
    }

    // Utility function to format ETH amounts
    formatEther(wei, decimals = 4) {
        return parseFloat(ethers.formatEther(wei)).toFixed(decimals);
    }
}

// Global function to refresh campaigns
window.loadCampaigns = async function() {
    if (window.chainFundraise) {
        await window.chainFundraise.loadCampaigns();
    }
};

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', function() {
    window.chainFundraise = new ChainFundraise();
});

// Handle page visibility changes to refresh data
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && window.chainFundraise && window.chainFundraise.contract) {
        window.chainFundraise.loadCampaigns();
        window.chainFundraise.updateWalletUI();
    }
});

// Handle window focus to refresh data
window.addEventListener('focus', function() {
    if (window.chainFundraise && window.chainFundraise.contract) {
        window.chainFundraise.loadCampaigns();
        window.chainFundraise.updateWalletUI();
    }
});

// Error handling for unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    if (window.chainFundraise) {
        window.chainFundraise.showError('An unexpected error occurred. Please try again.');
    }
});

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChainFundraise;
}