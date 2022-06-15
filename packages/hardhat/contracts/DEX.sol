// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "hardhat/console.sol";

/**
 * @title DEX Template
 * @author stevepham.eth and m00npapi.eth
 * @notice Empty DEX.sol that just outlines what features could be part of the challenge (up to you!)
 * @dev We want to create an automatic market where our contract will hold reserves of both ETH and 🎈 Balloons. These reserves will provide liquidity that allows anyone to swap between the assets.
 * NOTE: functions outlined here are what work with the front end of this branch/repo. Also return variable names that may need to be specified exactly may be referenced (if you are confused, see solutions folder in this repo and/or cross reference with front-end code).
 */
contract DEX {
    /* ========== GLOBAL VARIABLES ========== */
    uint256 public totalLiquidity;
    mapping(address => uint256) liquidity;

    using SafeMath for uint256; //outlines use of SafeMath for uint256 variables
    IERC20 token; //instantiates the imported contract

    /* ========== EVENTS ========== */

    /**
     * @notice Emitted when ethToToken() swap transacted
     */
    event EthToTokenSwap(
        address sender,
        uint256 ethInput,
        uint256 liquidity,
        uint256 totalLiquidity,
        uint256 tokenOutput
    );

    /**
     * @notice Emitted when tokenToEth() swap transacted
     */
    event TokenToEthSwap(address sender, uint256 tokenInput, uint256 ethOutput);

    /**
     * @notice Emitted when liquidity provided to DEX and mints LPTs.
     */
    event LiquidityProvided(
        address sender,
        uint256 liquidityAdded,
        uint256 liquidity,
        uint256 totalLiquidity
    );

    /**
     * @notice Emitted when liquidity removed from DEX and decreases LPT count within DEX.
     */
    event LiquidityRemoved(
        address sender,
        uint256 liquidityRemoved,
        uint256 liquidity,
        uint256 totalLiquidity
    );

    /* ========== CONSTRUCTOR ========== */

    constructor(address token_addr) public {
        token = IERC20(token_addr); //specifies the token address that will hook into the interface and be used through the variable 'token'
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice initializes amount of tokens that will be transferred to the DEX itself from the erc20 contract mintee (and only them based on how Balloons.sol is written). Loads contract up with both ETH and Balloons.
     * @param tokens amount to be transferred to DEX
     * @return totalLiquidity is the number of LPTs minting as a result of deposits made to DEX contract
     * NOTE: since ratio is 1:1, this is fine to initialize the totalLiquidity (wrt to balloons) as equal to eth balance of contract.
     */
    function init(uint256 tokens) public payable returns (uint256) {
        // require(tokens != 0, "token supplied must be greater than zero");
        // require(msg.value != 0, "eth supplied must be greater than zero");
        require(totalLiquidity == 0, "DEX: init - already has liquidity");

        liquidity[msg.sender] = address(this).balance;
        totalLiquidity = address(this).balance;

        require(
            token.transferFrom(msg.sender, address(this), tokens),
            "Revert: token transfer failed"
        );

        return tokens;
    }

    /**
     * @notice returns yOutput, or yDelta for xInput (or xDelta)
     * @dev Follow along with the [original tutorial](https://medium.com/@austin_48503/%EF%B8%8F-minimum-viable-exchange-d84f30bd0c90) Price section for an understanding of the DEX's pricing model and for a price function to add to your contract. You may need to update the Solidity syntax (e.g. use + instead of .add, * instead of .mul, etc). Deploy when you are done.
     */
    function price(
        uint256 xInput,
        uint256 xReserves,
        uint256 yReserves
    ) public pure returns (uint256 yOutput) {
        uint256 xInputwithFee = xInput.mul(997);
        uint256 numerator = xInputwithFee.mul(yReserves);
        uint256 denominator = (xReserves.mul(1000)).add(xInputwithFee);
        return numerator / denominator;
    }

    /**
     * @notice returns liquidity for a user. Note this is not needed typically due to the `liquidity()` mapping variable being public and having a getter as a result. This is left though as it is used within the front end code (App.jsx).
     */
    function getLiquidity(address lp) public view returns (uint256) {
        return liquidity[lp];
    }

    /**
     * @notice sends Ether to DEX in exchange for $BAL
     */
    function ethToToken() public payable returns (uint256 tokenOutput) {
        require(msg.value > 0, "Eth must be greater than zero");
        uint256 ethReserves = address(this).balance.sub(msg.value);
        uint256 tokenReserve = tokenReserves();
        uint256 tokenAmount = price(msg.value, ethReserves, tokenReserve);

        totalLiquidity = totalLiquidity.add(msg.value);
        liquidity[msg.sender] = liquidity[msg.sender].add(msg.value);
        require(token.transfer(msg.sender, tokenAmount));

        emit EthToTokenSwap(
            msg.sender,
            msg.value,
            liquidity[msg.sender],
            totalLiquidity,
            tokenAmount
        );

        return tokenAmount;
    }

    /**
     * @notice sends $BAL tokens to DEX in exchange for Ether
     */
    function tokenToEth(uint256 tokenInput) public returns (uint256 ethOutput) {
        require(tokenInput > 0, "token input must be greater than 0");
        uint256 xTokenReserve = tokenReserves();
        uint256 yEthReserve = address(this).balance;
        uint256 ethAmount = price(tokenInput, xTokenReserve, yEthReserve);

        require(
            token.transferFrom(msg.sender, address(this), tokenInput),
            "token transfer failed"
        );
        (bool sent, ) = msg.sender.call{value: ethAmount}("");
        require(sent, "eth transfer failed");

        emit TokenToEthSwap(msg.sender, tokenInput, ethAmount);
        return ethAmount;
    }

    /**
     * @notice allows deposits of $BAL and $ETH to liquidity pool
     * NOTE: parameter is the msg.value sent with this function call. That amount is used to determine the amount of $BAL needed as well and taken from the depositor.
     * NOTE: user has to make sure to give DEX approval to spend their tokens on their behalf by calling approve function prior to this function call.
     * NOTE: Equal parts of both assets will be removed from the user's wallet with respect to the price outlined by the AMM.
     */
    function deposit() public payable returns (uint256 tokensDeposited) {
        require(msg.value != 0, "deposit requires funds");
        require(totalLiquidity > 0, "0 liquidity");
        uint256 ethReserve = address(this).balance.sub(msg.value);
        uint256 tokenReserve = tokenReserves();
        uint256 tokenAmount = (msg.value.mul(tokenReserve) / ethReserve);

        liquidity[msg.sender] = liquidity[msg.sender].add(msg.value);
        totalLiquidity = totalLiquidity.add(msg.value);

        console.log("token amount", tokenAmount);

        require(
            token.transferFrom(msg.sender, address(this), tokenAmount),
            "revert: token transfer failed"
        );
        emit LiquidityProvided(
            msg.sender,
            msg.value,
            liquidity[msg.sender],
            totalLiquidity
        );
    }

    /**
     * @notice allows withdrawal of $BAL and $ETH from liquidity pool
     * NOTE: with this current code, the msg caller could end up getting very little back if the liquidity is super low in the pool. I guess they could see that with the UI.
     */
    function withdraw(uint256 amount)
        public
        returns (uint256 eth_amount, uint256 token_amount)
    {
        require(amount > 0, "withdrawl amount must be greater than zero");
        require(
            liquidity[msg.sender] >= amount,
            "sender doesnt have enough liquidity"
        );
        uint256 ethReserve = address(this).balance;

        uint256 tokenWithdrawAmount = amount.mul(tokenReserves()) /
            totalLiquidity;
        uint256 ethWithdrawAmount = amount.mul(ethReserve) / totalLiquidity;

        totalLiquidity = totalLiquidity.sub(amount);
        liquidity[msg.sender] = liquidity[msg.sender].sub(amount);

        require(
            token.transfer(msg.sender, tokenWithdrawAmount),
            "token transfer failed"
        );
        (bool sent, ) = msg.sender.call{value: ethWithdrawAmount}("");
        require(sent, "eth transfer failed");

        emit LiquidityRemoved(
            msg.sender,
            amount,
            liquidity[msg.sender],
            totalLiquidity
        );
        return (ethWithdrawAmount, tokenWithdrawAmount);
    }

    function tokenReserves() public view returns (uint256) {
        return token.balanceOf(address(this));
    }
}
