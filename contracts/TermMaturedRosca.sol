// SPDX-License-Identifier: MIT
/**
Author: kunwarbijay@gmail.com
 */
pragma solidity >=0.4.22 <0.9.0;
import {Rosca} from "./Rosca.sol";

contract TermMaturedRosca is Rosca {
    constructor(
        string memory _name,
        uint8 _term,
        uint8 _totalTerms,
        uint256 _fundAmountWei
    ) Rosca(_name, _term, _totalTerms, _fundAmountWei) {}

    function hasCurrentTermMatuared()
        internal
        view
        virtual
        override
        returns (bool)
    {
        return true;
    }
}
