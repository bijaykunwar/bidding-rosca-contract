// SPDX-License-Identifier: MIT
/**
Author: kunwarbijay@gmail.com
 */
pragma solidity >=0.4.22 <0.9.0;
import {SafeMath} from "./SafeMath.sol";

contract Rosca {
    using SafeMath for uint256;
    uint256 private constant WEI_IN_EITHER = 1e18;

    enum FundingTerm {
        WEEKLY,
        BIWEEKLY,
        MONTHLY
    }
    enum FundStatus {
        ENROLLING,
        INPROGRESS,
        CLOSED
    }
    /*************************************************************/
    string private name;
    address private manager;
    FundingTerm private term;
    FundStatus private status;
    uint256 private fundAmount;
    uint8 private totalTerms;
    uint8 private currentTerm;
    address[] private members;
    uint256 private fundInitTimestamp;
    mapping(address => uint8) public termPaymentsByMember;
    mapping(address => bool) public fundReceivedByMember;
    mapping(uint8 => mapping(address => uint256)) public termBidByMember;
    uint256 private previousTermSurplusAmount;

    /**************************************************************/

    constructor(
        string memory _name,
        uint8 _term,
        uint8 _totalTerms,
        uint256 _fundAmountWei
    ) {
        name = _name;
        status = FundStatus.ENROLLING;
        manager = msg.sender;
        term = convertTerm(_term);
        totalTerms = _totalTerms;
        fundAmount = _fundAmountWei;
        join();
    }

    function join() public {
        //join_1_fund status must be enrolling
        require(status == FundStatus.ENROLLING, "Sorry enrollment closed");
        //join_2_a member can only join fund once
        require(false == doesMemberExists(msg.sender), "Already joined");
        //join_3_new member successfully joined the fund
        members.push(msg.sender);
        if (members.length == totalTerms) {
            //join_4_once total number of joined members make quorum then fund status is changed to inprogress.
            status = FundStatus.INPROGRESS;
            fundInitTimestamp = block.timestamp;
            currentTerm = 1;
        }
    }

    function depositCurrentTerm(uint256 bid) external payable {
        //receive_1_fund not started, can not pay
        require(
            status == FundStatus.INPROGRESS,
            "Can not accept the fund. Fund is not started yet or fund is closed."
        );

        //receive_2_not a member, can not pay
        require(
            doesMemberExists(msg.sender),
            "Can not accept the fund. Not a member of fund."
        );

        // receive_3_current term already paid by the member
        require(
            termPaymentsByMember[msg.sender] == 0 ||
                termPaymentsByMember[msg.sender] != currentTerm,
            "Can not accept the fund. Already paid for this term."
        );

        //receive_4_incoming payment doesn't match the term amount
        require(
            msg.value == getCurrentTermAmount(msg.sender),
            "Can not accept the fund. Payment doesn't match the term amount."
        );
        //receive_4_invalid bid amount
        require(
            bid <= fundAmount,
            "Can not accept the fund. Invalid bid amount."
        );
        //receive_5_mark current term as paid
        termPaymentsByMember[msg.sender] = currentTerm;
        //receive_6_set current term bid
        if (!isFundReceivedByMember(msg.sender)) {
            termBidByMember[currentTerm][msg.sender] = bid;
        }
    }

    function getCurrentTermBidByMember(address member)
        private
        view
        returns (uint256)
    {
        return termBidByMember[currentTerm][member];
    }

    function isFundReceivedByMember(address member) public view returns (bool) {
        return fundReceivedByMember[member];
    }

    function getCurrentTermAmount(address member)
        public
        view
        returns (uint256)
    {
        if (fundReceivedByMember[member]) {
            return (fundAmount / totalTerms); // Original term
        }
        return
            fundAmount.sub(previousTermSurplusAmount).div(
                totalTerms - (currentTerm - 1)
            );
    }

    function withdrawCurrentTerm() public {
        //withdrawCurrentTerm_1_fund status must be inprogress
        require(
            status == FundStatus.INPROGRESS,
            "Sorry! status of the fund must be In-Progress"
        );

        //withdrawCurrentTerm_2_only member can request withdrawl of the current term
        require(
            doesMemberExists(msg.sender),
            "Not Authorized, must be a member of the fund"
        );

        //withdrawCurrentTerm_3_check if current term is eligible to withdraw
        require(
            hasCurrentTermMatuared(),
            "Current term has not matured for withdrawal"
        );

        //withdrawCurrentTerm_4_Check if everyone contributed their share for this term
        require(
            isCurrentTermPaidByAllMembers(),
            "Current term has not received payment from all the members"
        );

        //withdrawCurrentTerm_5_Withdrawal is allowed
        //transfer fund to the lowest bidder
        address lowestBidder = getCurrentLowestBidder();
        uint256 lowestBid = getCurrentTermBidByMember(lowestBidder);
        //make sure there is enough balance left for gas fee
        uint256 payableAmount = calculateNetPay(lowestBid);
        payable(lowestBidder).transfer(payableAmount);
        previousTermSurplusAmount = fundAmount.sub(payableAmount);
        //advance current term
        currentTerm++;
    }

    function calculateNetPay(uint256 grossPay) private pure returns (uint256) {
        //Deduct 0.5% service fee
        uint256 netPay = grossPay.sub(grossPay.mul(5).div(1000));
        return netPay;
    }

    function getCurrentLowestBidder() private view returns (address) {
        uint256 i;
        uint256 lowest = 0;
        address lowestBidder;
        for (i = 0; i < members.length; i++) {
            if (isFundReceivedByMember(members[i])) continue;
            if (lowest == 0) {
                lowest = getCurrentTermBidByMember(members[i]);
                lowestBidder = members[i];
            } else {
                uint256 bid = getCurrentTermBidByMember(members[i]);
                if (lowest > bid) {
                    lowest = bid;
                    lowestBidder = members[i];
                }
            }
        }
        return lowestBidder;
    }

    function isCurrentTermPaidByAllMembers() public view returns (bool) {
        uint256 i;
        for (i = 0; i < members.length; i++) {
            if (!isCurrentTermPaidByMember(members[i])) {
                return false;
            }
        }
        return true;
    }

    function isCurrentTermPaidByMember(address member)
        public
        view
        returns (bool)
    {
        return termPaymentsByMember[member] == currentTerm;
    }

    function hasCurrentTermMatuared() internal view virtual returns (bool) {
        return
            block.timestamp >=
            getTermExpiryTimestamp(fundInitTimestamp, term, currentTerm);
    }

    /************************* Utility Functions **************************/

    function getTermExpiryTimestamp(
        uint256 _initTimestamp,
        FundingTerm _term,
        uint8 _currentTerm
    ) public pure returns (uint256) {
        return
            _initTimestamp +
            uint256(_currentTerm * getDaysInTerm(_term) * 1000);
    }

    function getDaysInTerm(FundingTerm _term) private pure returns (uint256) {
        if (_term == FundingTerm.MONTHLY) {
            return 30 days;
        }
        if (_term == FundingTerm.BIWEEKLY) {
            return 15 days;
        }
        if (_term == FundingTerm.WEEKLY) {
            return 7 days;
        }
        return 0;
    }

    function convertTerm(uint8 _term) private pure returns (FundingTerm) {
        if (_term == 0) return FundingTerm.WEEKLY;
        if (_term == 1) return FundingTerm.BIWEEKLY;
        if (_term == 2) return FundingTerm.MONTHLY;
        revert();
    }

    function doesMemberExists(address member)
        private
        view
        returns (bool _result)
    {
        for (uint256 i = 0; i < members.length; i++) {
            if (members[i] == member) {
                _result = true;
                break;
            }
            _result = false;
        }
    }

    /********************* Getters ********************/
    function getManager() public view returns (address) {
        return manager;
    }

    function getName() public view returns (string memory) {
        return name;
    }

    function getTerm() public view returns (FundingTerm) {
        return term;
    }

    function getStatus() public view returns (FundStatus) {
        return status;
    }

    function getRoscaAmount() public view returns (uint256) {
        return fundAmount;
    }

    function getTotalTerms() public view returns (uint8) {
        return totalTerms;
    }

    function getCurrentTerm() public view returns (uint8) {
        return currentTerm;
    }

    function getFundInitTimestamp() public view returns (uint256) {
        return fundInitTimestamp;
    }

    function getMembers() public view returns (address[] memory) {
        return members;
    }

    function getMemberCount() public view returns (uint256) {
        return members.length;
    }
}
