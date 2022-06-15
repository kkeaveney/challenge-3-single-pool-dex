const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");

use(solidity);

/**
 * @notice auto-grading tests for simpleDEX challenge
 * Stages of testing are as follows: set up global test variables, test contract deployment, deploy contracts in beforeEach(), then actually test out each separate function.
 * @dev this is still a rough WIP. See TODO: scattered throughout.'
 * @dev additional TODO: Write edge cases; putting in zero as inputs, or whatever.
 * @dev Harshit will be producing auto-grading tests in one of the next PRs.
 */
describe("🚩 Challenge 3: ⚖️ 🪙 Simple DEX", function () {
  this.timeout(45000);

  let dexContract;
  let balloonsContract;
  let deployer;
  let user2;
  let user3;

  const toWei = (value) => ethers.utils.parseEther(value.toString());
  const fromWei = (value) =>
    ethers.utils.formatEther(
      typeof value === "string" ? value : value.toString()
    );

  const getBalance = ethers.provider.getBalance;

  // assign 'signer' addresses as object properties (Strings) to user array --> this is so we have signers ready to test this thing.
  before(async function () {
    const getAccounts = async function () {
      let accounts = [];
      let signers = [];
      signers = await hre.ethers.getSigners();
      for (const signer of signers) {
        accounts.push({ signer, address: await signer.getAddress() });
      } //populates the accounts array with addresses.
      return accounts;
    };

    // REFACTOR
    [deployer, user2, user3] = await getAccounts();
    // console.log("User1 after before(): ", user1);
  });

  // quick fix to let gas reporter fetch data from gas station & coinmarketcap
  before((done) => {
    setTimeout(done, 2000);
  });

  describe("DEX: Standard Path", function () {
    // 1st check if DEX contract already deployed, otherwise balloons needs to be deployed! TODO: have to figure out what account is the deployer if the challenger submits with a .env file!
    if (process.env.CONTRACT_ADDRESS) {
      it("Should connect to dex contract", async function () {
        dexContract = await ethers.getContractAt(
          "DEX",
          process.env.CONTRACT_ADDRESS
        );
        console.log("     🛰 Connected to DEX contract", dexContract.address);
      });
    } else {
      it("Should deploy Balloons contract", async function () {
        const BalloonsContract = await ethers.getContractFactory(
          "Balloons",
          deployer
        );
        balloonsContract = await BalloonsContract.deploy();
      });
      it("Should deploy DEX", async function () {
        const Dex = await ethers.getContractFactory("DEX", deployer);
        dexContract = await Dex.deploy(balloonsContract.address);
      });
    }

    // see if initial setup works, should have 1000 balloons in totalSupply, and 5 balloons + 5 ETH within DEX. This set up will be used continuously afterwards for nested function tests.
    // TODO: Also need to test that the other functions do not work if we try calling them without init() started.
    describe("init()", function () {
      it("Should set up DEX with 5 balloons at start", async function () {
        let tx1 = await balloonsContract
          .connect(deployer.signer)
          .approve(dexContract.address, ethers.utils.parseEther("100"));
        await expect(tx1)
          .emit(balloonsContract, "Approval")
          .withArgs(
            deployer.address,
            dexContract.address,
            ethers.utils.parseEther("100")
          );
        let tx2 = await dexContract
          .connect(deployer.signer)
          .init(ethers.utils.parseEther("5"), {
            value: ethers.utils.parseEther("5"),
          });
        await expect(tx2).emit(balloonsContract, "Transfer");

        // console.log(
        //   fromWei(await balloonsContract.balanceOf(dexContract.address))
        // );
        //console.log(await )

        //TODO: SYNTAX - get revert test to work
        await expect(
          dexContract
            .connect(deployer.signer)
            .init(ethers.utils.parseEther("5"), {
              value: ethers.utils.parseEther("5"),
            })
        ).revertedWith("DEX: init - already has liquidity");
      });

      describe("ethToToken()", function () {
        it("Should send 1 Ether to DEX in exchange for _ $BAL", async function () {
          let xReserve = await getBalance(dexContract.address);
          let yReserve = await balloonsContract.balanceOf(dexContract.address);

          let ethTokenPrice = await dexContract.price(
            toWei(1),
            xReserve,
            yReserve
          );

          let tx1 = await dexContract.connect(deployer.signer).ethToToken({
            value: toWei(1),
          });

          // TODO: SYNTAX - Figure out how to read eth balance of dex contract and to compare it against the eth sent in via this tx. Also figure out why/how to read the event that should be emitted with this too.
          let rc = await tx1.wait();
          let event = rc.events.find(
            (event) => event.event === "EthToTokenSwap"
          );
          const [sender, ethValue, liquidity, totalLiquidity, tokenAmount] =
            event.args;

          expect(sender).to.eq(deployer.address);
          expect(ethValue).to.eq(toWei(1));
          expect(liquidity).to.eq(toWei(6));
          expect(totalLiquidity).to.eq(toWei(6));
          expect(fromWei(tokenAmount)).to.eq(fromWei(ethTokenPrice));

          expect(await getBalance(dexContract.address)).to.equal(toWei(6));

          await expect(tx1)
            .emit(dexContract, "EthToTokenSwap")
            .withArgs(
              deployer.address,
              toWei(1),
              toWei(6),
              toWei(6),
              ethTokenPrice
            );
        });

        it("Should send less tokens after the first trade (ethToToken called)", async function () {
          let tx1 = await dexContract.connect(deployer.signer).ethToToken({
            value: toWei(1),
          });
          let tx2 = await dexContract.connect(deployer.signer).ethToToken({
            value: toWei(1),
          });

          let rc = await tx1.wait();
          let event = rc.events.find(
            (event) => event.event === "EthToTokenSwap"
          );
          const [sender, ethValue, liquidity, totalLiquidity, tokenAmount] =
            event.args;

          rc = await tx2.wait();
          event = rc.events.find((event) => event.event === "EthToTokenSwap");
          const [
            tx2sender,
            tx2ethValue,
            tx2liquidity,
            tx2totalLiquidity,
            tx2tokenAmount,
          ] = event.args;

          expect(tokenAmount).to.be.gt(tx2tokenAmount);
        });
        // could insert more tests to show the declining price, and what happens when the pool becomes very imbalanced.
      });
      describe("tokenToEth", async () => {
        it("withdraws", async function () {
          await dexContract.withdraw(toWei(8));
          await dexContract.init(toWei(5), {
            value: toWei(5),
          });
        });

        it("Should send 1 $BAL to DEX in exchange for _ $ETH", async function () {
          let amount = toWei(1);

          let ethReserve = await getBalance(dexContract.address);
          let tokenReserve = await balloonsContract.balanceOf(
            dexContract.address
          );
          let ethReturned = await dexContract.price(
            amount,
            tokenReserve,
            ethReserve
          );

          let tx1 = await dexContract
            .connect(deployer.signer)
            .tokenToEth(amount);

          //TODO: SYNTAX -  write an expect that takes into account the emitted event from tokenToETH.
          let rc = await tx1.wait();
          let event = rc.events.find(
            (event) => event.event === "TokenToEthSwap"
          );
          const [sender, tokenInput, ethOutput] = event.args;

          await expect(tx1)
            .emit(dexContract, "TokenToEthSwap")
            .withArgs(deployer.address, toWei(1), ethReturned);
        });

        it("Should send less tokens after the first trade (tokenToEach() called)", async function () {
          let tx1 = await dexContract
            .connect(deployer.signer)
            .tokenToEth(ethers.utils.parseEther("1"));
          let tx2 = await dexContract
            .connect(deployer.signer)
            .tokenToEth(ethers.utils.parseEther("1"));

          let rc = await tx1.wait();
          let event = rc.events.find(
            (event) => event.event === "TokenToEthSwap"
          );
          const [sender, tokenInput, ethOutput] = event.args;

          rc = await tx2.wait();
          event = rc.events.find((event) => event.event === "TokenToEthSwap");
          const [tx2sender, tx2tokenInput, tx2ethOutput] = event.args;

          expect(tx2ethOutput).to.be.lt(ethOutput);
        });
      });

      describe("deposit", async () => {
        it("Should deposit 1 ETH and 1 $BAL when pool at 1:1 ratio", async function () {
          let totalLiquidity = await dexContract.totalLiquidity();
          let tx1 = await dexContract.connect(deployer.signer).deposit(
            (ethers.utils.parseEther("5"),
            {
              value: ethers.utils.parseEther("5"),
            })
          );
          let rc = await tx1.wait();
          let event = rc.events.find(
            (event) => event.event === "LiquidityProvided"
          );
          const [sender, liquidityAdded, liquidity, totalLiquidityAmount] =
            event.args;

          const [tx2sender, tx2tokenInput, tx2ethOutput] = event.args;
          expect(totalLiquidity).to.be.lt(totalLiquidityAmount);
          expect(liquidity).to.eq(toWei(10));
          expect(totalLiquidityAmount).to.eq(toWei(10));
        });
      });

      // // pool should have 5:5 ETH:$BAL ratio
      describe("withdraw", async () => {
        it("Should withdraw 1 ETH and 1 $BAL when pool at 1:1 ratio", async function () {
          let totalLiquidity = await dexContract.totalLiquidity();
          let tx1 = await dexContract
            .connect(deployer.signer)
            .withdraw(ethers.utils.parseEther("1"));

          let rc = await tx1.wait();
          let event = rc.events.find(
            (event) => event.event === "LiquidityRemoved"
          );
          const [sender, liquidityRemoved, liquidity, totalLiquidityAmount] =
            event.args;

          let totalLiquidityAfterWithdraw = await dexContract.totalLiquidity();

          expect(totalLiquidity).to.be.gt(totalLiquidityAfterWithdraw);
          expect(liquidity).to.eq(toWei(9));
          expect(totalLiquidityAmount).to.eq(toWei(9));
        });
      });
      describe("liquidity balances", async () => {
        it("Should deposit 1 ETH and 1 $BAL when pool at 1:1 ratio", async function () {
          await dexContract.withdraw(toWei(9));
          await dexContract.init(toWei(10), {
            value: toWei(10),
          });

          expect(await dexContract.totalLiquidity()).to.eq(toWei(10));
          expect(await balloonsContract.balanceOf(dexContract.address)).to.eq(
            toWei(10)
          );
          expect(await getBalance(dexContract.address)).to.eq(toWei(10));
          // Add liquidity through deposit function
          await dexContract.deposit({ value: toWei(10) });

          expect(await getBalance(dexContract.address)).to.eq(toWei(20));
          // withdraw liquidity
          await dexContract.withdraw(toWei(20));
          expect(await getBalance(dexContract.address)).to.eq(toWei(0));
          expect(await balloonsContract.balanceOf(dexContract.address)).to.eq(
            0
          );
        });
      });
    });
  });
});
