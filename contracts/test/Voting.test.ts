import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";

describe("Voting", () => {
  async function deployFixture() {
    const [owner, voter1, voter2, voter3, voter4, voter5, stranger] =
      await hre.ethers.getSigners();
    const Voting = await hre.ethers.getContractFactory("Voting");
    const voting = await Voting.deploy();
    return { voting, owner, voter1, voter2, voter3, voter4, voter5, stranger };
  }

  async function deployWithTwoCandidatesFixture() {
    const base = await deployFixture();
    await base.voting.addCandidate(); // id=0
    await base.voting.addCandidate(); // id=1
    return base;
  }

  async function deployActiveFixture() {
    const base = await deployWithTwoCandidatesFixture();
    const endTime = (await time.latest()) + 3600; // 1시간 후
    await base.voting.startVoting(endTime);
    return { ...base, endTime };
  }

  // ──────────────────────────────────────────────────────────────────
  // 배포 및 초기 상태
  // ──────────────────────────────────────────────────────────────────
  describe("배포 및 초기 상태", () => {
    it("배포자가 owner로 설정됨", async () => {
      const { voting, owner } = await loadFixture(deployFixture);
      expect(await voting.owner()).to.equal(owner.address);
    });

    it("초기 상태는 IDLE(0)", async () => {
      const { voting } = await loadFixture(deployFixture);
      expect(await voting.getState()).to.equal(0);
    });

    it("초기 candidateCount는 0", async () => {
      const { voting } = await loadFixture(deployFixture);
      expect(await voting.candidateCount()).to.equal(0);
    });

    it("초기 nextCandidateId는 0", async () => {
      const { voting } = await loadFixture(deployFixture);
      expect(await voting.nextCandidateId()).to.equal(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // addCandidate
  // ──────────────────────────────────────────────────────────────────
  describe("addCandidate", () => {
    it("비관리자는 addCandidate 불가 [AC-01]", async () => {
      const { voting, stranger } = await loadFixture(deployFixture);
      await expect(voting.connect(stranger).addCandidate()).to.be.revertedWithCustomError(
        voting,
        "NotOwner"
      );
    });

    it("관리자는 후보자를 추가할 수 있음", async () => {
      const { voting } = await loadFixture(deployFixture);
      await voting.addCandidate();
      expect(await voting.candidateCount()).to.equal(1);
      expect(await voting.isActive(0)).to.equal(true);
      expect(await voting.nextCandidateId()).to.equal(1);
    });

    it("addCandidate 시 CandidateAdded(id) 이벤트 발생", async () => {
      const { voting } = await loadFixture(deployFixture);
      await expect(voting.addCandidate()).to.emit(voting, "CandidateAdded").withArgs(0);
      await expect(voting.addCandidate()).to.emit(voting, "CandidateAdded").withArgs(1);
    });

    it("ACTIVE 상태에서 addCandidate 불가", async () => {
      const { voting } = await loadFixture(deployActiveFixture);
      await expect(voting.addCandidate()).to.be.revertedWithCustomError(voting, "InvalidState");
    });

    it("ENDED 상태에서 addCandidate 불가", async () => {
      const { voting } = await loadFixture(deployActiveFixture);
      await voting.endVoting();
      await expect(voting.addCandidate()).to.be.revertedWithCustomError(voting, "InvalidState");
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // removeCandidate
  // ──────────────────────────────────────────────────────────────────
  describe("removeCandidate", () => {
    it("비관리자는 removeCandidate 불가", async () => {
      const { voting, stranger } = await loadFixture(deployWithTwoCandidatesFixture);
      await expect(
        voting.connect(stranger).removeCandidate(0)
      ).to.be.revertedWithCustomError(voting, "NotOwner");
    });

    it("removeCandidate 후 해당 ID는 getResults에서 제외", async () => {
      const { voting } = await loadFixture(deployWithTwoCandidatesFixture);
      await voting.removeCandidate(0);
      const [ids] = await voting.getResults();
      expect(ids.map(Number)).to.not.include(0);
    });

    it("removeCandidate 후 candidateCount 감소", async () => {
      const { voting } = await loadFixture(deployWithTwoCandidatesFixture);
      await voting.removeCandidate(0);
      expect(await voting.candidateCount()).to.equal(1);
    });

    it("removeCandidate 후 ID 재사용 없음 — nextCandidateId 유지", async () => {
      const { voting } = await loadFixture(deployWithTwoCandidatesFixture);
      await voting.removeCandidate(0);
      await voting.addCandidate(); // id=2, not 0
      const [ids] = await voting.getResults();
      expect(ids.map(Number)).to.not.include(0);
      expect(ids.map(Number)).to.include(2);
    });

    it("CandidateRemoved 이벤트 발생", async () => {
      const { voting } = await loadFixture(deployWithTwoCandidatesFixture);
      await expect(voting.removeCandidate(0)).to.emit(voting, "CandidateRemoved").withArgs(0);
    });

    it("존재하지 않는 ID removeCandidate 시 InvalidCandidate revert", async () => {
      const { voting } = await loadFixture(deployFixture);
      await expect(voting.removeCandidate(99)).to.be.revertedWithCustomError(
        voting,
        "InvalidCandidate"
      );
    });

    it("이미 삭제된 ID 재삭제 시 InvalidCandidate revert", async () => {
      const { voting } = await loadFixture(deployWithTwoCandidatesFixture);
      await voting.removeCandidate(0);
      await expect(voting.removeCandidate(0)).to.be.revertedWithCustomError(
        voting,
        "InvalidCandidate"
      );
    });

    it("ACTIVE 상태에서 removeCandidate 불가", async () => {
      const { voting } = await loadFixture(deployActiveFixture);
      await expect(voting.removeCandidate(0)).to.be.revertedWithCustomError(
        voting,
        "InvalidState"
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // startVoting
  // ──────────────────────────────────────────────────────────────────
  describe("startVoting", () => {
    it("비관리자는 startVoting 불가", async () => {
      const { voting, stranger } = await loadFixture(deployWithTwoCandidatesFixture);
      const futureTime = (await time.latest()) + 60;
      await expect(
        voting.connect(stranger).startVoting(futureTime)
      ).to.be.revertedWithCustomError(voting, "NotOwner");
    });

    it("후보자 0명으로 startVoting revert — NotEnoughCandidates [AC-02]", async () => {
      const { voting } = await loadFixture(deployFixture);
      const futureTime = (await time.latest()) + 60;
      await expect(voting.startVoting(futureTime)).to.be.revertedWithCustomError(
        voting,
        "NotEnoughCandidates"
      );
    });

    it("후보자 1명으로 startVoting revert — NotEnoughCandidates [AC-02]", async () => {
      const { voting } = await loadFixture(deployFixture);
      await voting.addCandidate();
      const futureTime = (await time.latest()) + 60;
      await expect(voting.startVoting(futureTime)).to.be.revertedWithCustomError(
        voting,
        "NotEnoughCandidates"
      );
    });

    it("startVoting endTime이 과거이면 EndTimeInPast revert", async () => {
      const { voting } = await loadFixture(deployWithTwoCandidatesFixture);
      const pastTime = (await time.latest()) - 1;
      await expect(voting.startVoting(pastTime)).to.be.revertedWithCustomError(
        voting,
        "EndTimeInPast"
      );
    });

    it("startVoting endTime이 현재와 동일하면 EndTimeInPast revert", async () => {
      const { voting } = await loadFixture(deployWithTwoCandidatesFixture);
      const now = await time.latest();
      await expect(voting.startVoting(now)).to.be.revertedWithCustomError(
        voting,
        "EndTimeInPast"
      );
    });

    it("startVoting 성공 시 ACTIVE(1) 상태 전환", async () => {
      const { voting } = await loadFixture(deployWithTwoCandidatesFixture);
      const futureTime = (await time.latest()) + 60;
      await voting.startVoting(futureTime);
      expect(await voting.getState()).to.equal(1); // ACTIVE
    });

    it("startVoting 시 VotingStarted 이벤트 발생", async () => {
      const { voting } = await loadFixture(deployWithTwoCandidatesFixture);
      const futureTime = (await time.latest()) + 60;
      await expect(voting.startVoting(futureTime))
        .to.emit(voting, "VotingStarted")
        .withArgs(futureTime);
    });

    it("ACTIVE 상태에서 startVoting 불가", async () => {
      const { voting } = await loadFixture(deployActiveFixture);
      const futureTime = (await time.latest()) + 3600;
      await expect(voting.startVoting(futureTime)).to.be.revertedWithCustomError(
        voting,
        "InvalidState"
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // vote
  // ──────────────────────────────────────────────────────────────────
  describe("vote", () => {
    it("IDLE 상태에서 vote 불가", async () => {
      const { voting } = await loadFixture(deployWithTwoCandidatesFixture);
      await expect(voting.vote(0)).to.be.revertedWithCustomError(voting, "InvalidState");
    });

    it("동일 지갑 2회 투표 revert — AlreadyVoted [AC-03]", async () => {
      const { voting, voter1 } = await loadFixture(deployActiveFixture);
      await voting.connect(voter1).vote(0);
      await expect(voting.connect(voter1).vote(1)).to.be.revertedWithCustomError(
        voting,
        "AlreadyVoted"
      );
    });

    it("종료 시각 이후 vote revert — VotingClosed [AC-04]", async () => {
      const { voting, voter1, endTime } = await loadFixture(deployActiveFixture);
      await time.increaseTo(endTime + 1);
      await expect(voting.connect(voter1).vote(0)).to.be.revertedWithCustomError(
        voting,
        "VotingClosed"
      );
    });

    it("유효하지 않은 후보 ID로 vote revert — InvalidCandidate", async () => {
      const { voting, voter1 } = await loadFixture(deployActiveFixture);
      await expect(voting.connect(voter1).vote(99)).to.be.revertedWithCustomError(
        voting,
        "InvalidCandidate"
      );
    });

    it("삭제된 후보에 vote revert — InvalidCandidate", async () => {
      const { voting } = await loadFixture(deployFixture);
      await voting.addCandidate(); // id=0
      await voting.addCandidate(); // id=1
      await voting.addCandidate(); // id=2
      await voting.removeCandidate(0);
      const futureTime = (await time.latest()) + 3600;
      await voting.startVoting(futureTime);
      const [, voter1] = await hre.ethers.getSigners();
      await expect(voting.connect(voter1).vote(0)).to.be.revertedWithCustomError(
        voting,
        "InvalidCandidate"
      );
    });

    it("vote 성공 시 Voted 이벤트 발생", async () => {
      const { voting, voter1 } = await loadFixture(deployActiveFixture);
      await expect(voting.connect(voter1).vote(0))
        .to.emit(voting, "Voted")
        .withArgs(voter1.address, 0, anyValue);
    });

    it("vote 성공 후 득표수 증가", async () => {
      const { voting, voter1 } = await loadFixture(deployActiveFixture);
      await voting.connect(voter1).vote(0);
      expect(await voting.votes(0)).to.equal(1);
    });

    it("5개 지갑 투표 후 getResults() 합계 일치 [AC-06]", async () => {
      const { voting, voter1, voter2, voter3, voter4, voter5 } =
        await loadFixture(deployActiveFixture);
      await voting.connect(voter1).vote(0);
      await voting.connect(voter2).vote(0);
      await voting.connect(voter3).vote(1);
      await voting.connect(voter4).vote(1);
      await voting.connect(voter5).vote(1);

      const [ids, voteCounts] = await voting.getResults();
      const totalVotes = voteCounts.reduce((sum: bigint, v: bigint) => sum + v, 0n);
      expect(totalVotes).to.equal(5n);

      const voteMap = Object.fromEntries(ids.map((id: bigint, i: number) => [Number(id), Number(voteCounts[i])]));
      expect(voteMap[0]).to.equal(2);
      expect(voteMap[1]).to.equal(3);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // endVoting
  // ──────────────────────────────────────────────────────────────────
  describe("endVoting", () => {
    it("비관리자는 endVoting 불가", async () => {
      const { voting, stranger } = await loadFixture(deployActiveFixture);
      await expect(voting.connect(stranger).endVoting()).to.be.revertedWithCustomError(
        voting,
        "NotOwner"
      );
    });

    it("IDLE 상태에서 endVoting 불가", async () => {
      const { voting } = await loadFixture(deployFixture);
      await expect(voting.endVoting()).to.be.revertedWithCustomError(voting, "InvalidState");
    });

    it("endVoting 성공 시 ENDED(2) 상태 전환", async () => {
      const { voting } = await loadFixture(deployActiveFixture);
      await voting.endVoting();
      expect(await voting.getState()).to.equal(2); // ENDED
    });

    it("endVoting reason=manual VotingEnded 이벤트 발생", async () => {
      const { voting } = await loadFixture(deployActiveFixture);
      await expect(voting.endVoting()).to.emit(voting, "VotingEnded").withArgs("manual");
    });

    it("ENDED 상태에서 vote 불가", async () => {
      const { voting, voter1 } = await loadFixture(deployActiveFixture);
      await voting.endVoting();
      await expect(voting.connect(voter1).vote(0)).to.be.revertedWithCustomError(
        voting,
        "InvalidState"
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // getState
  // ──────────────────────────────────────────────────────────────────
  describe("getState", () => {
    it("배포 직후 IDLE(0) 반환", async () => {
      const { voting } = await loadFixture(deployFixture);
      expect(await voting.getState()).to.equal(0);
    });

    it("startVoting 후 ACTIVE(1) 반환", async () => {
      const { voting } = await loadFixture(deployActiveFixture);
      expect(await voting.getState()).to.equal(1);
    });

    it("endTime 경과 시 ENDED(2) 반환 [AC-08]", async () => {
      const { voting } = await loadFixture(deployWithTwoCandidatesFixture);
      const endTime = (await time.latest()) + 60;
      await voting.startVoting(endTime);
      await time.increaseTo(endTime + 1);
      expect(await voting.getState()).to.equal(2); // ENDED
    });

    it("endVoting 후 ENDED(2) 반환", async () => {
      const { voting } = await loadFixture(deployActiveFixture);
      await voting.endVoting();
      expect(await voting.getState()).to.equal(2);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // getResults
  // ──────────────────────────────────────────────────────────────────
  describe("getResults", () => {
    it("후보자 없을 때 빈 배열 반환", async () => {
      const { voting } = await loadFixture(deployFixture);
      const [ids, voteCounts] = await voting.getResults();
      expect(ids.length).to.equal(0);
      expect(voteCounts.length).to.equal(0);
    });

    it("유효한 후보자만 반환", async () => {
      const { voting } = await loadFixture(deployWithTwoCandidatesFixture);
      const [ids] = await voting.getResults();
      expect(ids.map(Number)).to.deep.equal([0, 1]);
    });

    it("삭제된 후보자는 제외", async () => {
      const { voting } = await loadFixture(deployWithTwoCandidatesFixture);
      await voting.removeCandidate(0);
      const [ids] = await voting.getResults();
      expect(ids.map(Number)).to.deep.equal([1]);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // getMyVote
  // ──────────────────────────────────────────────────────────────────
  describe("getMyVote", () => {
    it("미투표 시 hasVoted=false, votedFor=0", async () => {
      const { voting, voter1 } = await loadFixture(deployActiveFixture);
      const [voted, candidateId] = await voting.connect(voter1).getMyVote();
      expect(voted).to.equal(false);
      expect(Number(candidateId)).to.equal(0);
    });

    it("투표 후 hasVoted=true, votedFor가 정확히 기록됨", async () => {
      const { voting, voter1 } = await loadFixture(deployActiveFixture);
      await voting.connect(voter1).vote(1);
      const [voted, candidateId] = await voting.connect(voter1).getMyVote();
      expect(voted).to.equal(true);
      expect(Number(candidateId)).to.equal(1);
    });
  });
});
