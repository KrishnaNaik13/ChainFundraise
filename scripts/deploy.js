const hre = require("hardhat");

async function main() {
  const ChainFundraise = await hre.ethers.getContractFactory("ChainFundraise");
  const chainFundraise = await ChainFundraise.deploy();

  await chainFundraise.deployed();

  console.log(
    `ChainFundraise deployed to Core Blockchain at address: ${chainFundraise.address}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
