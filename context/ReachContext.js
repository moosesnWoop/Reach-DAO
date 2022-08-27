import React, { useState } from "react";
import {
    loadStdlib,
    ALGO_WalletConnect as WalletConnect
} from "@reach-sh/stdlib";
import * as backend from "../build/index.main.mjs";
import { fmtClasses } from "../hooks/fmtClasses";
import styles from "../styles/MainWrapper.module.css";

const reach = loadStdlib(process.env);

reach.setWalletFallback(
    reach.walletFallback({
        providerEnv: "TestNet",
        WalletConnect,
    })
);

const { standardUnit } = reach;
const defaultDeadline = { ETH: 1000, ALGO: 10000, CFX: 100000 }[reach.connector];

export const ReachContext = React.createContext();

const ReachContextProvider = ({ children }) => {
    const [defaults] = useState({
        standardUnit,
    });
    const [views, setViews] = useState({
        view: "ConnectAccount",
        wrapper: "AppWrapper",
    });

    const [user, setUser] = useState({
        account: "",
        balance: "",
    });

    const [contract, setContract] = useState(null);
    const [contractInstance, setContractInstance] = useState(null);
    const [deadline, setDeadline] = useState(defaultDeadline);
    const [proposals, setProposals] = useState([]);

    /**
     * Sorts an array of objects by a property present one level deep, in any object in the array. If successful, returns the sorted array of objects, else the original array is returned.
     * @param {Array<Object>} arrayOfObjects The array of objects to be sorted
     * @param {String} property The name of the property to be sorted by.
     * @returns {Array<Object>} A sorted array of objects, if sorting was successful, otherwise returns the original array.
     */
    const sortArrayOfObjects = (arrayOfObjects, property) => {
        if (!arrayOfObjects) return arrayOfObjects;
        if (!Array.isArray(arrayOfObjects)) return arrayOfObjects;
        if (arrayOfObjects.length <= 1) return arrayOfObjects;
        let isInt = false;
        return arrayOfObjects.map((el, index) => {
            isInt = !isNaN(el?.[property]);
            return !isInt ?
                `${el?.[property]?.[0]?.toUpperCase()?.concat(el?.[property]?.slice(1))}^-.-^${index}` :
                `${el?.[property]}^-.-^${index}`;
        })?.sort(isInt ? (a, b) => Number(a?.split('^-.-^')?.[0]) - Number(b?.split('^-.-^')?.[0]) : undefined)?.map(el => arrayOfObjects[el?.split('^-.-^')?.[1]]);
    };

    /**
     * It should return the bare string value without null characters
     * @param {String} byte A string padded with null values
     * @returns {String} A bare string without null characters
     */
    const noneNull = (byte) => {
        let string = '', i = 0;
        for (i; i < byte.length; i++) {
            if (String(byte[i]) !== String("\u0000")) {
                string += byte[i];
            }
        }
        return string;
    };

    const connectAccount = async () => {
        const account = await reach.getDefaultAccount();
        const balAtomic = await reach.balanceOf(account);
        const balance = reach.formatCurrency(balAtomic, 4);
        setUser({
            account,
            balance
        });
        setViews({ view: "DeployerOrAttacher", wrapper: "AppWrapper" });
    };

    const selectAttacher = () => {
        setViews({ view: "Attach", wrapper: "AttacherWrapper" });
    };

    const selectDeployer = () => {
        setViews({ view: "Deploy", wrapper: "DeployerWrapper" });
    };

    const attach = async (ctcInfoStr) => {
        try {
            setViews({ view: "Attaching", wrapper: "AttacherWrapper" });
            const ctc = user.account.contract(backend, JSON.parse(ctcInfoStr));
            setContractInstance(ctc);
            setContract({ ctcInfoStr });
            ctc.events.create.monitor(createProposal);
            ctc.events.that.monitor(acknowledge);
            setViews({ view: "Proposals", wrapper: "ProposalWrapper" });
        } catch (error) {
            console.log({ error });
        }
    };

    // TODO implement the logic to send a contribution, positive or negative
    const connectAndUpvote = async (id, ctcInfoStr) => {
        try {
            const ctc = user.account.contract(backend, JSON.parse(ctcInfoStr));
            const upvotes = await ctc.apis.Voters.upvote();
            await contractInstance.apis.Voters.upvoted(id, parseInt(upvotes));
        } catch (error) {
            console.log({ error });
        }
    };

    const connectAndDownvote = async (id, ctcInfoStr) => {
        try {
            const ctc = user.account.contract(backend, JSON.parse(ctcInfoStr));
            const downvotes = await ctc.apis.Voters.downvote();
            await contractInstance.apis.Voters.downvoted(id, parseInt(downvotes));
        } catch (error) {
            console.log({ error });
        }
    };

    // TODO figure out the use of this later
    const makeContribution = async (amount, id, ctcInfoStr) => {
        try {
            const ctc = user.account.contract(backend, JSON.parse(ctcInfoStr));
            const contribs = await ctc.apis.Voters.contribute(reach.parseCurrency(amount));
            await contractInstance.apis.Voters.contributed(id, parseInt(contribs));
        } catch (error) {
            console.log({ error });
        }
    };

    const connectAndClaimRefund = async (ctcInfoStr) => {
        try {
            const ctc = user.account.contract(backend, JSON.parse(ctcInfoStr));
            const didRefund = await ctc.apis.Voters.claimRefund();
            if (didRefund) {
                alert('Refund Success');
            } else {
                alert("It seems you don't have funds to claim, did you contribute to this proposal?");
            }
        } catch (error) {
            console.log({ error });
        }
    };

    const confirmContribution = async () => {
        setViews({ views: 'Confirmed', wrapper: 'ProposalWrapper' });
    };

    const DeployerInteract = {
        getProposal: {
            id: 1,
            title: 'AroTable',
            link: 'https://github.com/Aro1914/AroTable/blob/main/README.md',
            description: `A self-sorting number data structure`,
            owner: user.account,
            deadline,
            numMembers: 5,
            isProposal: false,
        },
    };

    // TODO create a function to add to the Map of proposals stored in our contract;
    const updateProposals = async ({ when, what }) => {
        await contractInstance.apis.Voters.created({
            id: parseInt(what[0]),
            title: noneNull(what[1]),
            link: noneNull(what[2]),
            description: noneNull(what[3]),
            owner: noneNull(what[4]),
            contractInfo: what[5],
        });
        console.log(what[5]);
    };

    const createProposal = ({ when, what }) => {
        const currentProposals = proposals;
        currentProposals.push({
            id: parseInt(what[0]),
            title: noneNull(what[1]),
            link: noneNull(what[2]),
            description: noneNull(what[3]),
            owner: noneNull(what[4]),
            contract: JSON.stringify(what[5]),
            upvotes: 0,
            downvotes: 0,
            contribs: 0,
            timedOut: false,
            didPass: false,
        });
        setProposals(proposals => ([...currentProposals]));
        console.log(what[5]);
    };

    const acknowledge = ({ when, what }) => {
        const ifState = x => x.padEnd(20, '\u0000');
        switch (what[0]) {
            case ifState('upvoted'):
                const upProposals = proposals.map(el => {
                    if (Number(el.id) === Number(parseInt(what[1]))) {
                        el['upvotes'] = parseInt(what[2]);
                    }
                    return el;
                });
                setProposals(proposals => ([...upProposals]));
                break;
            case ifState('downvoted'):
                const downProposals = proposals.map(el => {
                    if (Number(el.id) === Number(parseInt(what[1]))) {
                        el['downvotes'] = parseInt(what[2]);
                    }
                    return el;
                });
                setProposals(proposals => ([...downProposals]));
                break;
            case ifState('contributed'):
                const conProposals = proposals.map(el => {
                    if (Number(el.id) === Number(parseInt(what[1]))) {
                        el['contribs'] = parseInt(what[2]);
                    }
                    return el;
                });
                setProposals(proposals => ([...conProposals]));
                break;
            case ifState('timedOut'):
                if (parseInt(what[2])) {
                    const pProposals = proposals.map(el => {
                        if (Number(el.id) === Number(parseInt(what[1]))) {
                            el['timedOut'] = true;
                            el['didPass'] = true;
                        }
                        return el;
                    });
                    setProposals(proposals => ([...pProposals]));
                } else {
                    const fProposals = proposals.map(el => {
                        if (Number(el.id) === Number(parseInt(what[1]))) {
                            el['timedOut'] = true;
                            el['didPass'] = false;
                        }
                        return el;
                    });
                    setProposals(proposals => ([...fProposals]));
                }
                break;
            default:
                alert('Unhandled error..');
                break;
        }
    };

    const timeoutProposal = async ({ when, what }) => {
        const ifState = x => x.padEnd(20, "\u0000");
        switch (what[0]) {
            case ifState('passed'):
                await contractInstance.apis.Voters.timedOut(parseInt(what[1]), 1);
                break;
            case ifState('failed'):
                await contractInstance.apis.Voters.timedOut(parseInt(what[1]), 0);
                break;
            default:
                alert('Unhandled error..');
                break;
        }
    };

    const deploy = async () => {
        setViews({ view: "Deploying", wrapper: "DeployerWrapper" });
        const ctc = user.account.contract(backend);
        setContractInstance(ctc);
        console.log('Got here');
        const interact = {
            ...DeployerInteract,
        };
        ctc.p.Deployer(interact);
        const ctcInfoStr = JSON.stringify(await ctc.getInfo(), null, 2);
        ctc.events.create.monitor(createProposal);
        ctc.events.that.monitor(acknowledge);
        setContract({ ctcInfoStr });
        console.log(ctcInfoStr);
        setViews({ view: "Deployed", wrapper: "DeployerWrapper" });
    };

    const makeProposal = async (proposal) => {
        const proposalSetup = async () => {
            // TODO implement the interact functionality
            const deadline = { ETH: 1000, ALGO: 10000, CFX: 100000 }[reach.connector];
            const ctc = user.account.contract(backend);
            ctc.p.Deployer({
                getProposal: {
                    ...proposal,
                    deadline: deadline,
                    numMembers: 5,
                    isProposal: true,
                }
            });
            ctc.events.log.monitor(timeoutProposal);
            ctc.events.created.monitor(updateProposals);
        };
        await proposalSetup();
    };

    const ReachContextValues = {
        ...defaults,

        // Views
        views,
        setViews,

        // Misc
        contract,
        deadline,
        sortArrayOfObjects,

        // Accounts
        user,
        connectAccount,
        deploy,

        // Participants
        selectDeployer,
        selectAttacher,

        // Deployer

        // timeoutProposal

        // Attacher  
        attach,
        makeProposal,

        // API
        // connectAndContribute,
        setContract,
        makeContribution,
        connectAndUpvote,
        connectAndDownvote,
        connectAndClaimRefund,
        confirmContribution,

        // Proposals
        proposals,
        setProposals,
    };

    return (
        <ReachContext.Provider value={ ReachContextValues }>
            <div className={ fmtClasses(styles.header, !contract?.ctcInfoStr ? styles.itemsCenter : '') }>
                <div className={ fmtClasses(styles.brandContainer) }>
                    <h1>Reach DAO</h1>
                </div>
                <div className={ fmtClasses(styles.navContainer) }>
                    { contract?.ctcInfoStr &&
                        <ul className={ fmtClasses(styles.navList, styles.flat) }>
                            <li className={ fmtClasses(views.view === 'InfoCenter' ? styles.navItemActive : styles.navItem) }>Info Center</li>
                            <li className={ fmtClasses(views.view === 'Proposals' ? styles.navItemActive : styles.navItem) } onClick={ () => setViews({ view: 'Proposals', wrapper: 'ProposalWrapper' }) }>Proposals</li>
                            <li className={ fmtClasses(views.view === 'Bounties' ? styles.navItemActive : styles.navItem) }>Bounties</li>
                        </ul> }
                </div>
            </div>
            <div className={ fmtClasses(styles.childrenContainer) } id="root">{ children }</div>
        </ReachContext.Provider>
    );
};

export default ReachContextProvider;

// Still in progress....