const Rosca = artifacts.require("./Rosca");

module.exports = function (deployer) {
  deployer.deploy(Rosca,"",0,0,0);
};
