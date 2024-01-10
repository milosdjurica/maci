import { expect } from "chai";
import { hash5, NOTHING_UP_MY_SLEEVE, IncrementalQuinTree, AccQueue } from "maci-crypto";
import { PCommand, Keypair, StateLeaf, blankStateLeafHash } from "maci-domainobjs";

import { MaciState } from "../MaciState";
import { Poll } from "../Poll";
import { STATE_TREE_DEPTH, STATE_TREE_ARITY, STATE_TREE_SUBDEPTH } from "../utils/constants";
import { packProcessMessageSmallVals, unpackProcessMessageSmallVals } from "../utils/utils";

import { coordinatorKeypair, duration, maxValues, messageBatchSize, treeDepths, voiceCreditBalance } from "./constants";
import { calculateTotal } from "./utils";

describe("MaciState e2e", function test() {
  this.timeout(300000);

  describe("key changes", () => {
    const user1Keypair = new Keypair();
    const user2Keypair = new Keypair();
    const user1SecondKeypair = new Keypair();
    const user2SecondKeypair = new Keypair();
    let pollId: number;
    let user1StateIndex: number;
    let user2StateIndex: number;
    const user1VoteOptionIndex = BigInt(0);
    const user2VoteOptionIndex = BigInt(1);
    const user1VoteWeight = BigInt(9);
    const user2VoteWeight = BigInt(3);
    const user1NewVoteWeight = BigInt(5);
    const user2NewVoteWeight = BigInt(7);

    describe("only user 1 changes key", () => {
      const maciState: MaciState = new MaciState(STATE_TREE_DEPTH);

      before(() => {
        // Sign up
        user1StateIndex = maciState.signUp(
          user1Keypair.pubKey,
          voiceCreditBalance,
          BigInt(Math.floor(Date.now() / 1000)),
        );
        user2StateIndex = maciState.signUp(
          user2Keypair.pubKey,
          voiceCreditBalance,
          BigInt(Math.floor(Date.now() / 1000)),
        );

        // deploy a poll
        pollId = maciState.deployPoll(
          BigInt(Math.floor(Date.now() / 1000) + duration),
          maxValues,
          treeDepths,
          messageBatchSize,
          coordinatorKeypair,
        );
      });
      it("should submit a vote for each user", () => {
        const poll = maciState.polls[pollId];
        const command1 = new PCommand(
          BigInt(user1StateIndex),
          user1Keypair.pubKey,
          user1VoteOptionIndex,
          user1VoteWeight,
          BigInt(1),
          BigInt(pollId),
        );

        const signature1 = command1.sign(user1Keypair.privKey);

        const ecdhKeypair1 = new Keypair();
        const sharedKey1 = Keypair.genEcdhSharedKey(ecdhKeypair1.privKey, coordinatorKeypair.pubKey);

        const message1 = command1.encrypt(signature1, sharedKey1);
        poll.publishMessage(message1, ecdhKeypair1.pubKey);

        const command2 = new PCommand(
          BigInt(user2StateIndex),
          user2Keypair.pubKey,
          user2VoteOptionIndex,
          user2VoteWeight,
          BigInt(1),
          BigInt(pollId),
        );

        const signature2 = command2.sign(user2Keypair.privKey);

        const ecdhKeypair2 = new Keypair();
        const sharedKey2 = Keypair.genEcdhSharedKey(ecdhKeypair2.privKey, coordinatorKeypair.pubKey);

        const message2 = command2.encrypt(signature2, sharedKey2);
        poll.publishMessage(message2, ecdhKeypair2.pubKey);
      });

      it("user1 sends a keychange message with a new vote", () => {
        const poll = maciState.polls[pollId];
        const command = new PCommand(
          BigInt(user1StateIndex),
          user1SecondKeypair.pubKey,
          user1VoteOptionIndex,
          user1NewVoteWeight,
          BigInt(1),
          BigInt(pollId),
        );

        const signature = command.sign(user1Keypair.privKey);

        const ecdhKeypair = new Keypair();
        const sharedKey = Keypair.genEcdhSharedKey(ecdhKeypair.privKey, coordinatorKeypair.pubKey);

        const message = command.encrypt(signature, sharedKey);
        poll.publishMessage(message, ecdhKeypair.pubKey);
      });

      it("should perform the processing and tallying correctly", () => {
        const poll = maciState.polls[pollId];
        poll.processMessages(pollId);
        poll.tallyVotes();
        expect(poll.perVOSpentVoiceCredits[0].toString()).to.eq((user1NewVoteWeight * user1NewVoteWeight).toString());
        expect(poll.perVOSpentVoiceCredits[1].toString()).to.eq((user2VoteWeight * user2VoteWeight).toString());
      });

      it("should confirm that the user key pair was changed (user's 2 one has not)", () => {
        const poll = maciState.polls[pollId];
        const stateLeaf1 = poll.stateLeaves[user1StateIndex];
        const stateLeaf2 = poll.stateLeaves[user2StateIndex];
        expect(stateLeaf1.pubKey.equals(user1SecondKeypair.pubKey)).to.eq(true);
        expect(stateLeaf2.pubKey.equals(user2Keypair.pubKey)).to.eq(true);
      });
    });

    describe("both users change key", () => {
      const maciState: MaciState = new MaciState(STATE_TREE_DEPTH);

      before(() => {
        // Sign up
        user1StateIndex = maciState.signUp(
          user1Keypair.pubKey,
          voiceCreditBalance,
          BigInt(Math.floor(Date.now() / 1000)),
        );
        user2StateIndex = maciState.signUp(
          user2Keypair.pubKey,
          voiceCreditBalance,
          BigInt(Math.floor(Date.now() / 1000)),
        );

        // deploy a poll
        pollId = maciState.deployPoll(
          BigInt(Math.floor(Date.now() / 1000) + duration),
          maxValues,
          treeDepths,
          messageBatchSize,
          coordinatorKeypair,
        );
      });
      it("should submit a vote for each user", () => {
        const poll = maciState.polls[pollId];
        const command1 = new PCommand(
          BigInt(user1StateIndex),
          user1Keypair.pubKey,
          user1VoteOptionIndex,
          user1VoteWeight,
          BigInt(1),
          BigInt(pollId),
        );

        const signature1 = command1.sign(user1Keypair.privKey);

        const ecdhKeypair1 = new Keypair();
        const sharedKey1 = Keypair.genEcdhSharedKey(ecdhKeypair1.privKey, coordinatorKeypair.pubKey);

        const message1 = command1.encrypt(signature1, sharedKey1);
        poll.publishMessage(message1, ecdhKeypair1.pubKey);

        const command2 = new PCommand(
          BigInt(user2StateIndex),
          user2Keypair.pubKey,
          user2VoteOptionIndex,
          user2VoteWeight,
          BigInt(1),
          BigInt(pollId),
        );

        const signature2 = command2.sign(user2Keypair.privKey);

        const ecdhKeypair2 = new Keypair();
        const sharedKey2 = Keypair.genEcdhSharedKey(ecdhKeypair2.privKey, coordinatorKeypair.pubKey);

        const message2 = command2.encrypt(signature2, sharedKey2);
        poll.publishMessage(message2, ecdhKeypair2.pubKey);
      });

      it("user1 sends a keychange message with a new vote", () => {
        const poll = maciState.polls[pollId];
        const command = new PCommand(
          BigInt(user1StateIndex),
          user1SecondKeypair.pubKey,
          user1VoteOptionIndex,
          user1NewVoteWeight,
          BigInt(1),
          BigInt(pollId),
        );

        const signature = command.sign(user1Keypair.privKey);

        const ecdhKeypair = new Keypair();
        const sharedKey = Keypair.genEcdhSharedKey(ecdhKeypair.privKey, coordinatorKeypair.pubKey);

        const message = command.encrypt(signature, sharedKey);
        poll.publishMessage(message, ecdhKeypair.pubKey);
      });

      it("user2 sends a keychange message with a new vote", () => {
        const poll = maciState.polls[pollId];
        const command = new PCommand(
          BigInt(user2StateIndex),
          user2SecondKeypair.pubKey,
          user2VoteOptionIndex,
          user2NewVoteWeight,
          BigInt(1),
          BigInt(pollId),
        );

        const signature = command.sign(user2Keypair.privKey);

        const ecdhKeypair = new Keypair();
        const sharedKey = Keypair.genEcdhSharedKey(ecdhKeypair.privKey, coordinatorKeypair.pubKey);

        const message = command.encrypt(signature, sharedKey);
        poll.publishMessage(message, ecdhKeypair.pubKey);
      });

      it("should perform the processing and tallying correctly", () => {
        const poll = maciState.polls[pollId];
        poll.processMessages(pollId);
        poll.tallyVotes();
        expect(poll.perVOSpentVoiceCredits[0].toString()).to.eq((user1NewVoteWeight * user1NewVoteWeight).toString());
        expect(poll.perVOSpentVoiceCredits[1].toString()).to.eq((user2NewVoteWeight * user2NewVoteWeight).toString());
      });

      it("should confirm that the users key pairs were changed", () => {
        const poll = maciState.polls[pollId];
        const stateLeaf1 = poll.stateLeaves[user1StateIndex];
        const stateLeaf2 = poll.stateLeaves[user2StateIndex];
        expect(stateLeaf1.pubKey.equals(user1SecondKeypair.pubKey)).to.eq(true);
        expect(stateLeaf2.pubKey.equals(user2SecondKeypair.pubKey)).to.eq(true);
      });
    });

    describe("user1 changes key, but messages are in different batches", () => {
      const maciState = new MaciState(STATE_TREE_DEPTH);

      before(() => {
        // Sign up
        user1StateIndex = maciState.signUp(
          user1Keypair.pubKey,
          voiceCreditBalance,
          BigInt(Math.floor(Date.now() / 1000)),
        );

        // deploy a poll
        pollId = maciState.deployPoll(
          BigInt(Math.floor(Date.now() / 1000) + duration),
          maxValues,
          treeDepths,
          messageBatchSize,
          coordinatorKeypair,
        );
      });

      it("should submit a vote for one user in one batch", () => {
        const poll = maciState.polls[pollId];
        const command1 = new PCommand(
          BigInt(user1StateIndex),
          user1Keypair.pubKey,
          user1VoteOptionIndex,
          user1VoteWeight,
          BigInt(1),
          BigInt(pollId),
        );

        const signature1 = command1.sign(user1Keypair.privKey);

        const ecdhKeypair1 = new Keypair();
        const sharedKey1 = Keypair.genEcdhSharedKey(ecdhKeypair1.privKey, coordinatorKeypair.pubKey);

        const message1 = command1.encrypt(signature1, sharedKey1);
        poll.publishMessage(message1, ecdhKeypair1.pubKey);
      });

      it("should fill the batch with random messages", () => {
        const poll = maciState.polls[pollId];
        for (let i = 0; i < messageBatchSize - 1; i += 1) {
          const command = new PCommand(
            BigInt(1),
            user1Keypair.pubKey,
            user1VoteOptionIndex,
            user1VoteWeight,
            BigInt(2),
            BigInt(pollId),
          );

          const signature = command.sign(user1Keypair.privKey);

          const ecdhKeypair = new Keypair();
          const sharedKey = Keypair.genEcdhSharedKey(ecdhKeypair.privKey, coordinatorKeypair.pubKey);

          const message = command.encrypt(signature, sharedKey);
          poll.publishMessage(message, ecdhKeypair.pubKey);
        }
      });

      it("should submit a new message in a new batch", () => {
        const poll = maciState.polls[pollId];
        const command1 = new PCommand(
          BigInt(user1StateIndex),
          user1SecondKeypair.pubKey,
          user1VoteOptionIndex,
          user1NewVoteWeight,
          BigInt(1),
          BigInt(pollId),
        );

        const signature1 = command1.sign(user1Keypair.privKey);

        const ecdhKeypair1 = new Keypair();
        const sharedKey1 = Keypair.genEcdhSharedKey(ecdhKeypair1.privKey, coordinatorKeypair.pubKey);

        const message1 = command1.encrypt(signature1, sharedKey1);
        poll.publishMessage(message1, ecdhKeypair1.pubKey);
      });

      it("should perform the processing and tallying correctly", () => {
        const poll = maciState.polls[pollId];
        poll.processAllMessages();
        poll.tallyVotes();
        expect(poll.perVOSpentVoiceCredits[0].toString()).to.eq((user1NewVoteWeight * user1NewVoteWeight).toString());
      });

      it("should confirm that the user key pair was changed", () => {
        const poll = maciState.polls[pollId];
        const stateLeaf1 = poll.stateLeaves[user1StateIndex];
        expect(stateLeaf1.pubKey.equals(user1SecondKeypair.pubKey)).to.eq(true);
      });
    });
  });

  describe("Process and tally 1 message from 1 user", () => {
    let maciState: MaciState;
    let pollId: number;
    let poll: Poll;
    let msgTree: IncrementalQuinTree;
    const voteWeight = BigInt(9);
    const voteOptionIndex = BigInt(0);
    let stateIndex: number;
    const userKeypair = new Keypair();

    before(() => {
      maciState = new MaciState(STATE_TREE_DEPTH);
      msgTree = new IncrementalQuinTree(treeDepths.messageTreeDepth, NOTHING_UP_MY_SLEEVE, 5, hash5);
    });

    // The end result should be that option 0 gets 3 votes
    // because the user spends 9 voice credits on it
    it("the state root should be correct", () => {
      const accumulatorQueue: AccQueue = new AccQueue(STATE_TREE_SUBDEPTH, STATE_TREE_ARITY, blankStateLeafHash);
      const timestamp = BigInt(Math.floor(Date.now() / 1000));
      const stateLeaf = new StateLeaf(userKeypair.pubKey, voiceCreditBalance, timestamp);

      accumulatorQueue.enqueue(blankStateLeafHash);
      accumulatorQueue.enqueue(stateLeaf.hash());
      accumulatorQueue.mergeSubRoots(0);
      accumulatorQueue.merge(STATE_TREE_DEPTH);

      stateIndex = maciState.signUp(userKeypair.pubKey, voiceCreditBalance, timestamp);
      expect(stateIndex.toString()).to.eq("1");

      expect(accumulatorQueue.getRoot(STATE_TREE_DEPTH)?.toString()).to.eq(maciState.stateTree.root.toString());
    });

    it("the message root should be correct", () => {
      pollId = maciState.deployPoll(
        BigInt(Math.floor(Date.now() / 1000) + duration),
        maxValues,
        treeDepths,
        messageBatchSize,
        coordinatorKeypair,
      );

      poll = maciState.polls[pollId];

      const command = new PCommand(
        BigInt(stateIndex),
        userKeypair.pubKey,
        voteOptionIndex,
        voteWeight,
        BigInt(1),
        BigInt(pollId),
      );

      const signature = command.sign(userKeypair.privKey);

      const ecdhKeypair = new Keypair();
      const sharedKey = Keypair.genEcdhSharedKey(ecdhKeypair.privKey, coordinatorKeypair.pubKey);
      const message = command.encrypt(signature, sharedKey);

      poll.publishMessage(message, ecdhKeypair.pubKey);
      msgTree.insert(message.hash(ecdhKeypair.pubKey));

      // Use the accumulator queue to compare the root of the message tree
      const accumulatorQueue: AccQueue = new AccQueue(
        treeDepths.messageTreeSubDepth,
        STATE_TREE_ARITY,
        NOTHING_UP_MY_SLEEVE,
      );
      accumulatorQueue.enqueue(message.hash(ecdhKeypair.pubKey));
      accumulatorQueue.mergeSubRoots(0);
      accumulatorQueue.merge(treeDepths.messageTreeDepth);

      expect(accumulatorQueue.getRoot(treeDepths.messageTreeDepth)?.toString()).to.eq(msgTree.root.toString());
    });

    it("packProcessMessageSmallVals and unpackProcessMessageSmallVals", () => {
      const maxVoteOptions = BigInt(1);
      const numUsers = BigInt(2);
      const batchStartIndex = 5;
      const batchEndIndex = 10;
      const packedVals = packProcessMessageSmallVals(maxVoteOptions, numUsers, batchStartIndex, batchEndIndex);

      const unpacked = unpackProcessMessageSmallVals(packedVals);
      expect(unpacked.maxVoteOptions.toString()).to.eq(maxVoteOptions.toString());
      expect(unpacked.numUsers.toString()).to.eq(numUsers.toString());
      expect(unpacked.batchStartIndex.toString()).to.eq(batchStartIndex.toString());
      expect(unpacked.batchEndIndex.toString()).to.eq(batchEndIndex.toString());
    });

    it("Process a batch of messages (though only 1 message is in the batch)", () => {
      poll.processMessages(pollId);

      // Check the ballot
      expect(poll.ballots[1].votes[Number(voteOptionIndex)].toString()).to.eq(voteWeight.toString());
      // Check the state leaf in the poll
      expect(poll.stateLeaves[1].voiceCreditBalance.toString()).to.eq(
        (voiceCreditBalance - voteWeight * voteWeight).toString(),
      );
    });

    it("Tally ballots", () => {
      const initialTotal = calculateTotal(maciState.polls[pollId].tallyResult);
      expect(initialTotal.toString()).to.eq("0");

      expect(poll.hasUntalliedBallots()).to.eq(true);

      poll.tallyVotes();

      const finalTotal = calculateTotal(maciState.polls[pollId].tallyResult);
      expect(finalTotal.toString()).to.eq(voteWeight.toString());
    });
  });

  describe(`Process and tally ${messageBatchSize * 2} messages from ${messageBatchSize} users`, () => {
    let maciState: MaciState;
    let pollId: number;
    let poll: Poll;
    const voteWeight = BigInt(9);

    const users: Keypair[] = [];

    before(() => {
      maciState = new MaciState(STATE_TREE_DEPTH);
      // Sign up and vote
      for (let i = 0; i < messageBatchSize - 1; i += 1) {
        const userKeypair = new Keypair();
        users.push(userKeypair);

        maciState.signUp(userKeypair.pubKey, voiceCreditBalance, BigInt(Math.floor(Date.now() / 1000)));
      }

      pollId = maciState.deployPoll(
        BigInt(Math.floor(Date.now() / 1000) + duration),
        maxValues,
        treeDepths,
        messageBatchSize,
        coordinatorKeypair,
      );
      poll = maciState.polls[pollId];
    });

    it("should process votes correctly", () => {
      // 24 valid votes
      for (let i = 0; i < messageBatchSize - 1; i += 1) {
        const userKeypair = users[i];

        const command = new PCommand(
          BigInt(i + 1),
          userKeypair.pubKey,
          BigInt(i), // vote option index
          voteWeight,
          BigInt(1),
          BigInt(pollId),
        );

        const signature = command.sign(userKeypair.privKey);

        const ecdhKeypair = new Keypair();
        const sharedKey = Keypair.genEcdhSharedKey(ecdhKeypair.privKey, coordinatorKeypair.pubKey);
        const message = command.encrypt(signature, sharedKey);
        poll.publishMessage(message, ecdhKeypair.pubKey);
      }

      expect(poll.messages.length).to.eq(messageBatchSize - 1);

      // 24 invalid votes
      for (let i = 0; i < messageBatchSize - 1; i += 1) {
        const userKeypair = users[i];
        const command = new PCommand(
          BigInt(i + 1),
          userKeypair.pubKey,
          BigInt(i), // vote option index
          voiceCreditBalance * BigInt(2), // invalid vote weight
          BigInt(1),
          BigInt(pollId),
        );

        const signature = command.sign(userKeypair.privKey);

        const ecdhKeypair = new Keypair();
        const sharedKey = Keypair.genEcdhSharedKey(ecdhKeypair.privKey, coordinatorKeypair.pubKey);
        const message = command.encrypt(signature, sharedKey);
        poll.publishMessage(message, ecdhKeypair.pubKey);
      }

      // 48 messages in total
      expect(poll.messages.length).to.eq(2 * (messageBatchSize - 1));

      expect(poll.currentMessageBatchIndex).to.eq(undefined);
      expect(poll.numBatchesProcessed).to.eq(0);

      // Process messages
      poll.processMessages(pollId);

      // currentMessageBatchIndex is 0 because the current batch starts
      // with index 0.
      expect(poll.currentMessageBatchIndex).to.eq(0);
      expect(poll.numBatchesProcessed).to.eq(1);

      // Process messages
      poll.processMessages(pollId);

      expect(poll.currentMessageBatchIndex).to.eq(0);
      expect(poll.numBatchesProcessed).to.eq(2);

      for (let i = 1; i < messageBatchSize; i += 1) {
        const leaf = poll.ballots[i].votes[i - 1];
        expect(leaf.toString()).to.eq(voteWeight.toString());
      }

      // Test processAllMessages
      const r = poll.processAllMessages();

      expect(r.stateLeaves.length).to.eq(poll.stateLeaves.length);

      expect(r.ballots.length).to.eq(poll.ballots.length);

      expect(r.ballots.length).to.eq(r.stateLeaves.length);

      for (let i = 0; i < r.stateLeaves.length; i += 1) {
        expect(r.stateLeaves[i].equals(poll.stateLeaves[i])).to.eq(true);

        expect(r.ballots[i].equals(poll.ballots[i])).to.eq(true);
      }
    });

    it("should tally ballots correctly", () => {
      // Start with tallyResult = [0...0]
      const total = calculateTotal(maciState.polls[pollId].tallyResult);
      expect(total.toString()).to.eq("0");

      // Check that there are untallied results
      expect(poll.hasUntalliedBallots()).to.eq(true);

      // First batch tally
      poll.tallyVotes();

      // Recall that each user `i` cast the same number of votes for
      // their option `i`
      for (let i = 0; i < maciState.polls[pollId].tallyResult.length - 1; i += 1) {
        expect(maciState.polls[pollId].tallyResult[i].toString()).to.eq(voteWeight.toString());
      }

      expect(poll.hasUntalliedBallots()).to.eq(false);

      expect(() => {
        poll.tallyVotes();
      }).to.throw();
    });
  });
});