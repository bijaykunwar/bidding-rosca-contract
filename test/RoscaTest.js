const truffleAssert = require('truffle-assertions');
let Rosca = artifacts.require('./Rosca.sol');
let TermMaturedRosca = artifacts.require('./TermMaturedRosca.sol');

var BN = web3.utils.BN;
contract('Rosca', (accounts) => {
    const ONE_ETH_TO_WEI = web3.utils.toWei("1", "ether");
    const MONTHLY_TERM = 2;
    const ENROLLING = 0;
    const INPROGRESS = 1;
    const managerAccount = accounts[0];
    const memberAccount1 = accounts[1];
    const memberAccount2 = accounts[2];
    const memberAccount3 = accounts[3];
    let rosca;
    beforeEach(async () => {
        rosca = await Rosca.new('My First Rosca Fund', MONTHLY_TERM, 3, web3.utils.toWei("3", "ether"), { from: managerAccount });
    });

    it('new rosca initiated', async () => {

        let senderAddress = await rosca.getManager();
        let term = await rosca.getTerm();
        let status = await rosca.getStatus();
        let name = await rosca.getName();
        let roscaAmount = await rosca.getRoscaAmount();
        let totalTerms = await rosca.getTotalTerms();
        expect(totalTerms.toNumber()).to.equal(3);
        expect(roscaAmount.toString()).to.equal(new BN(web3.utils.toWei("3", "ether")).toString());
        expect(term.toNumber()).to.equal(MONTHLY_TERM);
        expect(senderAddress).to.equal(managerAccount);
        expect(status.toNumber()).equal(ENROLLING);
        expect(name).to.equal('My First Rosca Fund');

        let totalMember = await rosca.getMemberCount();
        expect(totalMember.toNumber()).to.equal(1);
    });
    /************************ Join() **********************/
    it('join_1_joining rosca after enrollemnt is closed should not be allowed', async () => {
        await rosca.join({ from: memberAccount1 });
        await rosca.join({ from: memberAccount2 });
        await truffleAssert.reverts(rosca.join({ from: memberAccount3 }), "Sorry enrollment closed");

    });

    it('join_2_joining rosca by an already existing member should not be allowed', async () => {
        await rosca.join({ from: memberAccount1 });
        await truffleAssert.reverts(rosca.join({ from: memberAccount1 }), "Already joined");

    });

    it('join_3_joining rosca by a new member is allowed', async () => {
        await rosca.join({ from: memberAccount1 });
        let totalMember = await rosca.getMemberCount();
        expect(totalMember.toNumber()).to.equal(2);

    });

    it('join_4_rosca status should change to in-progress once member count equals to total number of terms', async () => {
        await rosca.join({ from: memberAccount1 });
        await rosca.join({ from: memberAccount2 });
        let status = await rosca.getStatus();
        expect(status.toNumber()).to.equal(INPROGRESS);
        //TODO check block timestamp of the last joined transcation equals to fund initialized timestamp

    });
    /********************** receive() *************************/
    it("receive_1_revert payment if fund status is enrolling or closed", async () => {
        await rosca.join({ from: memberAccount1 });
        await truffleAssert.reverts(rosca.depositCurrentTerm(web3.utils.toWei("2.9", "ether"), { value: ONE_ETH_TO_WEI, from: memberAccount3 }), "Can not accept the fund. Fund is not started yet or fund is closed.");
        //await truffleAssert.reverts(web3.eth.sendTransaction({ from: memberAccount3, to: rosca.address, value: ONE_ETH_TO_WEI }), "Can not accept the fund. Fund is not started yet or fund is closed.");
        let newBalance = await web3.eth.getBalance(rosca.address);
        expect(newBalance).to.equal("0");
    });

    it("receive_2_revert payment if fund received from non-rosca member", async () => {
        await rosca.join({ from: memberAccount1 });
        await rosca.join({ from: memberAccount2 });
        await truffleAssert.reverts(rosca.depositCurrentTerm(web3.utils.toWei("2.9", "ether"), { value: ONE_ETH_TO_WEI, from: memberAccount3 }), "Can not accept the fund. Not a member of fund.");
        let newBalance = await web3.eth.getBalance(rosca.address);
        expect(newBalance).to.equal("0");
    });

    it("receive_3_revert payment if duplicate fund received for a term", async () => {
        await rosca.join({ from: memberAccount1 });
        await rosca.join({ from: memberAccount2 });
        await rosca.depositCurrentTerm(web3.utils.toWei("2.9", "ether"), { value: ONE_ETH_TO_WEI, from: memberAccount1 });
        let newBalance = await web3.eth.getBalance(rosca.address);
        expect(newBalance).to.equal(ONE_ETH_TO_WEI.toString());
        await truffleAssert.reverts(rosca.depositCurrentTerm(web3.utils.toWei("2.9", "ether"), { value: ONE_ETH_TO_WEI, from: memberAccount1 }), "Can not accept the fund. Already paid for this term.");
        newBalance = await web3.eth.getBalance(rosca.address);
        expect(newBalance).to.equal(ONE_ETH_TO_WEI.toString());
    });

    it("receive_4_revert payment if amount doesn't match term amount", async () => {
        await rosca.join({ from: memberAccount1 });
        await rosca.join({ from: memberAccount2 });
        await truffleAssert.reverts(rosca.depositCurrentTerm(web3.utils.toWei("2.9", "ether"), { value: web3.utils.toWei("1.2", "ether"), from: memberAccount1 }), "Can not accept the fund. Payment doesn't match the term amount.");
        let newBalance = await web3.eth.getBalance(rosca.address);
        expect(newBalance).to.equal("0");
    });

    it("receive_5_revert payment if bid amount is greater than fund amount", async () => {
        await rosca.join({ from: memberAccount1 });
        await rosca.join({ from: memberAccount2 });
        await truffleAssert.reverts(rosca.depositCurrentTerm(web3.utils.toWei("4", "ether"), { value: web3.utils.toWei("1", "ether"), from: memberAccount1 }), "Can not accept the fund. Invalid bid amount.");
        let newBalance = await web3.eth.getBalance(rosca.address);
        expect(newBalance).to.equal("0");
    });

    it("receive_6_accept payment from a rosca member with valid bid amount", async () => {
        await rosca.join({ from: memberAccount1 });
        await rosca.join({ from: memberAccount2 });
        await rosca.depositCurrentTerm(web3.utils.toWei("2.9", "ether"), { value: ONE_ETH_TO_WEI, from: memberAccount1 });
        let newBalance = await web3.eth.getBalance(rosca.address);
        expect(newBalance).to.equal(ONE_ETH_TO_WEI.toString());
    });

    /***************************** withdrawCurrentTerm() ***************************/
    it("withdrawCurrentTerm_1_withdrawal is not allowed when fund status is enrolling or closed", async () => {
        await truffleAssert.reverts(rosca.withdrawCurrentTerm({ from: memberAccount1 }), "Sorry! status of the fund must be In-Progress");
    });

    it("withdrawCurrentTerm_2_request to withdrawal is only allowed from a member of the fund", async () => {
        await rosca.join({ from: memberAccount1 });
        await rosca.join({ from: memberAccount2 });
        await truffleAssert.reverts(rosca.withdrawCurrentTerm({ from: memberAccount3 }), "Not Authorized, must be a member of the fund");
    });

    it("withdrawCurrentTerm_3_withdrawal is not allowed if current term has not matured", async () => {
        //let termMaturedRosca = await TermMaturedRosca.new('My First Rosca Fund', MONTHLY_TERM, 3, web3.utils.toWei("3", "ether"), { from: managerAccount });
        await rosca.join({ from: memberAccount1 });
        await rosca.join({ from: memberAccount2 });
        await truffleAssert.reverts(rosca.withdrawCurrentTerm({ from: managerAccount }), "Current term has not matured for withdrawal");
    });

    //TODO check if everybody contributed for current term
    it("withdrawCurrentTerm_4_withdrawal is allowed only after all member contribute to the current term", async () => {
        let termMaturedRosca = await TermMaturedRosca.new('My First Rosca Fund', MONTHLY_TERM, 3, web3.utils.toWei("3", "ether"), { from: managerAccount });
        await termMaturedRosca.join({ from: memberAccount1 });
        await termMaturedRosca.join({ from: memberAccount2 });
        await truffleAssert.reverts(termMaturedRosca.withdrawCurrentTerm({ from: managerAccount }), "Current term has not received payment from all the members");
    });



    it("withdrawCurrentTerm_5_withdrawal is done to the lowest bidder once current term is matured", async () => {
        let termMaturedRosca = await TermMaturedRosca.new('My First Rosca Fund', MONTHLY_TERM, 3, web3.utils.toWei("3", "ether"), { from: managerAccount });
        await termMaturedRosca.join({ from: memberAccount1 });
        await termMaturedRosca.join({ from: memberAccount2 });
        await termMaturedRosca.depositCurrentTerm(web3.utils.toWei("2.9", "ether"), { value: ONE_ETH_TO_WEI, from: managerAccount });
        await termMaturedRosca.depositCurrentTerm(web3.utils.toWei("2.8", "ether"), { value: ONE_ETH_TO_WEI, from: memberAccount1 });
        await termMaturedRosca.depositCurrentTerm(web3.utils.toWei("2.95", "ether"), { value: ONE_ETH_TO_WEI, from: memberAccount2 });

        let oldBalance = await web3.eth.getBalance(memberAccount1);
        await termMaturedRosca.withdrawCurrentTerm({ from: managerAccount });
        //memberaccount1 must receive the fund
        let newBalance = await web3.eth.getBalance(memberAccount1);
        let serviceFee = new BN(web3.utils.toWei("2.8", "ether")).mul(new BN(5)).div(new BN(1000));
        expect(newBalance).to.equal((new BN(oldBalance).add(new BN(web3.utils.toWei("2.8", "ether")).sub(serviceFee))).toString());
    });

    //TODO add surplus amount to the withdrawal if any
    //TODO what if all biddings are equal for given term , who gets to keep the fund
    //TODO check if contract balance after withdrawal is proper
    //TODO check current term advanced to next term after withdrawal



    it("term expiration date calculation is correct", async () => {
        let initDateTime = new Date('2022-07-27T00:00:00').getTime();
        let expectedDateTime = new Date(initDateTime + 1 * 30 * 86400000).getTime(); // + 30 day in ms
        let expiryTimestamp = await rosca.getTermExpiryTimestamp(initDateTime, MONTHLY_TERM, 1);
        expect(expiryTimestamp.toNumber()).to.equal(expectedDateTime);

        expectedDateTime = new Date(initDateTime + 1 * 15 * 86400000).getTime(); // + 30 day in ms
        expiryTimestamp = await rosca.getTermExpiryTimestamp(initDateTime, 1, 1);// BIWEEKLY
        expect(expiryTimestamp.toNumber()).to.equal(expectedDateTime);


        expectedDateTime = new Date(initDateTime + 1 * 7 * 86400000).getTime(); // + 30 day in ms
        expiryTimestamp = await rosca.getTermExpiryTimestamp(initDateTime, 0, 1);// WEEKLY
        expect(expiryTimestamp.toNumber()).to.equal(expectedDateTime);

    });




});