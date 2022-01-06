const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { expect } = require('chai');
const { prepare } = require('../fixture');

let scannerSubjectId;
let agentArgs;
let stakeHookSignature; 

const prepareCommit = (...args)  => ethers.utils.solidityKeccak256([ 'bytes32', 'address', 'string', 'uint256[]' ], args);
const gasUsed = async (tx) => await tx.wait().then({ gasUsed });

describe('Routing', function () {
    prepare({ minStake: '100' });
    beforeEach(async function() {
        // Prepare Scanner
        this.accounts.getAccount('scanner');
        this.accounts.getAccount('slasher');
        await expect(this.access.connect(this.accounts.admin).grantRole(this.roles.SLASHER, this.accounts.slasher.address)).to.be.not.reverted;
        await expect(this.access.connect(this.accounts.admin).grantRole(this.roles.ROUTER_ADMIN, this.accounts.admin.address)).to.be.not.reverted;

        await this.scanners.connect(this.accounts.scanner).register(this.accounts.scanner.address, 1);
        scannerSubjectId = BigNumber.from(this.accounts.scanner.address);
        await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.SCANNER_SUBJECT_TYPE, scannerSubjectId, '100');
        await expect(this.scanners.connect(this.accounts.scanner).enableScanner(this.accounts.scanner.address, 1))
        .to.emit(this.scanners, 'ScannerEnabled').withArgs(this.accounts.scanner.address, true, 1, true);
    
        //Prepare Agents and link
        agentArgs = Array.from({length: 75}, (e, i)=> i).fill(1).map(x => [
            ethers.utils.hexlify(ethers.utils.randomBytes(32)),
            this.accounts[`user${x}`].address,
            `Metadata${x}`,
            [1,2,3,4,5]
        ])

        for(const args of agentArgs) {
            console.log(1)
            await expect(this.agents.prepareAgent(prepareCommit(...args))).to.be.not.reverted;
            console.log(2)

            await network.provider.send('evm_increaseTime', [ 300 ]);
            console.log(3)

            await expect(this.agents.createAgent(...args)).to.be.not.reverted;
            console.log(4)

            await this.staking.connect(this.accounts.staker).deposit(this.stakingSubjects.AGENT_SUBJECT_TYPE, args[0], '100');
            console.log(5)
            await expect(this.agents.connect(this.accounts.manager).enableAgent(args[0], 0))
            .to.emit(this.agents, 'AgentEnabled').withArgs(args[0], true, 0, true);
            console.log(6)
            await expect(this.dispatch.connect(this.accounts.manager).link(args[0], scannerSubjectId))
            .to.emit(this.dispatch, 'Link').withArgs(args[0], scannerSubjectId, true);
        }
        
        stakeHookSignature = ethers.utils.id("hook_afterStakeChanged(uint8,uint256)").slice(0,10);
        await this.router.connect(this.accounts.admin).setRoutingTable(stakeHookSignature, this.scanners.address, true, true);
        await this.router.connect(this.accounts.admin).setRoutingTable(stakeHookSignature, this.agents.address, true, true);
        await this.router.connect(this.accounts.admin).setRoutingTable(stakeHookSignature, this.dispatch.address, true, true);
    })
    

    it('slash scanner stake -> disable scanner & unlinks', async function () {
    
        expect(await this.scanners.isEnabled(scannerSubjectId)).to.be.equal(true);
        var index = 0;
        expect(await this.dispatch.agentsFor(scannerSubjectId)).to.be.equal(75);

        for(const args of agentArgs) {
            console.log(index)
            expect(await this.dispatch.scannersFor(args[0])).to.be.equal(1);
            expect(await this.dispatch.scannersAt(args[0], index)).to.be.equal(scannerSubjectId);
            expect(await this.dispatch.agentsAt(scannerSubjectId, index)).to.be.equal(args[0]);

            index += 1;
        }


        const tx = await this.staking.connect(this.accounts.slasher).slash(this.stakingSubjects.SCANNER_SUBJECT_TYPE, scannerSubjectId, '30')
        const receipt = await tx.wait()
        //.to.emit(this.scanners, 'ScannerEnabled').withArgs(scannerSubjectId, false, 4, false)
        

        console.log(receipt)
        expect(await this.scanners.isEnabled(scannerSubjectId)).to.be.equal(false);
    
    });

    it.skip('slash scanner stake -> nothing', async function () {
        await this.router.connect(this.accounts.admin).setRoutingTable(stakeHookSignature, this.scanners.address, false, false);
        await this.router.connect(this.accounts.admin).setRoutingTable(stakeHookSignature, this.agents.address, false, false);
        await this.router.connect(this.accounts.admin).setRoutingTable(stakeHookSignature, this.dispatch.address, false, false);
        expect(await this.scanners.isEnabled(scannerSubjectId)).to.be.equal(true);
        const gas = gasUsed(await this.staking.connect(this.accounts.slasher).slash(this.stakingSubjects.SCANNER_SUBJECT_TYPE, scannerSubjectId, '30'))

        console.log(gas.toString())
        expect(await this.scanners.isEnabled(scannerSubjectId)).to.be.equal(false);
    });

    
    

    it.skip('slash agent stake -> agent scanner & unlinks', async function () {
        //TODO

    });
    
    
    
});
