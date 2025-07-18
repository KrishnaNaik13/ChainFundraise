// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract ChainFundraise is ReentrancyGuard {
    enum CampaignState { Active, Successful, Failed }

    struct Campaign {
        address creator;
        string title;
        uint256 goalAmount;
        uint256 deadline;
        uint256 totalRaised;
        uint256 minContribution;
        uint256 backersCount;
        CampaignState state;
    }

    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => mapping(address => uint256)) public contributions;
    uint256 public campaignCount;

    event CampaignCreated(uint256 indexed campaignId, address creator);
    event ContributionMade(uint256 indexed campaignId, address contributor, uint256 amount);
    event FundsClaimed(uint256 indexed campaignId, uint256 amount);
    event RefundIssued(uint256 indexed campaignId, address backer, uint256 amount);

    function createCampaign(
        string memory _title,
        uint256 _goalAmount,
        uint256 _duration,
        uint256 _minContribution
    ) external {
        uint256 campaignId = campaignCount++;
        campaigns[campaignId] = Campaign({
            creator: msg.sender,
            title: _title,
            goalAmount: _goalAmount,
            deadline: block.timestamp + _duration,
            totalRaised: 0,
            minContribution: _minContribution,
            backersCount: 0,
            state: CampaignState.Active
        });
        emit CampaignCreated(campaignId, msg.sender);
    }

    function contribute(uint256 campaignId) external payable nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        require(campaign.state == CampaignState.Active, "Campaign not active");
        require(block.timestamp < campaign.deadline, "Campaign ended");
        require(msg.value >= campaign.minContribution, "Below minimum contribution");

        if (contributions[campaignId][msg.sender] == 0) {
            campaign.backersCount++;
        }

        contributions[campaignId][msg.sender] += msg.value;
        campaign.totalRaised += msg.value;
        emit ContributionMade(campaignId, msg.sender, msg.value);
    }

    function claimFunds(uint256 campaignId) external nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        require(msg.sender == campaign.creator, "Not campaign creator");
        require(block.timestamp >= campaign.deadline, "Campaign not ended");
        require(campaign.totalRaised >= campaign.goalAmount, "Goal not reached");
        require(campaign.state == CampaignState.Active, "Funds already claimed");

        campaign.state = CampaignState.Successful;
        payable(campaign.creator).transfer(campaign.totalRaised);
        emit FundsClaimed(campaignId, campaign.totalRaised);
    }

    function getRefund(uint256 campaignId) external nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        require(block.timestamp >= campaign.deadline, "Campaign not ended");
        require(campaign.totalRaised < campaign.goalAmount, "Goal was reached");
        require(contributions[campaignId][msg.sender] > 0, "No contribution");

        uint256 contribution = contributions[campaignId][msg.sender];
        contributions[campaignId][msg.sender] = 0;
        
        if (campaign.state == CampaignState.Active) {
            campaign.state = CampaignState.Failed;
        }

        payable(msg.sender).transfer(contribution);
        emit RefundIssued(campaignId, msg.sender, contribution);
    }

    function extendDeadline(uint256 campaignId, uint256 additionalTime) external {
        Campaign storage campaign = campaigns[campaignId];
        require(msg.sender == campaign.creator, "Not campaign creator");
        require(block.timestamp < campaign.deadline, "Campaign already ended");
        campaign.deadline += additionalTime;
    }
}