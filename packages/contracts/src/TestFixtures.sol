// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev TEST ASSET ONLY. Never represent this as Circle-issued USDC.
contract TestUSD is ERC20 {
    constructor(address recipient) ERC20("Test USD", "tUSD") {
        _mint(recipient, 1000000 * 1e6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

/// @dev Small role fixture; NOT the official ENSv2 implementation.
contract TestResolver {
    address public immutable TREASURY;
    address public immutable PUBLISHER;
    mapping(bytes32 => address) public addr;
    mapping(bytes32 => string) public invoiceEndpoint;

    error UnauthorizedRecord();

    constructor(address treasury_, address publisher_) {
        TREASURY = treasury_;
        PUBLISHER = publisher_;
    }

    function setAddr(bytes32 node, address beneficiary) external {
        if (msg.sender != TREASURY) revert UnauthorizedRecord();
        addr[node] = beneficiary;
    }

    function setInvoiceEndpoint(bytes32 node, string calldata endpoint) external {
        if (msg.sender != PUBLISHER && msg.sender != TREASURY) revert UnauthorizedRecord();
        invoiceEndpoint[node] = endpoint;
    }
}
