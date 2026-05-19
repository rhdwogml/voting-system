// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Voting {
    enum State {
        IDLE,
        ACTIVE,
        ENDED
    }

    address public owner;
    State private _state;
    uint256 public endTime;
    uint256 public candidateCount;
    uint256 public nextCandidateId;

    mapping(uint256 => uint256) public votes;
    mapping(uint256 => bool) public isActive;
    mapping(address => bool) public hasVoted;
    mapping(address => uint256) public votedFor;

    event CandidateAdded(uint256 indexed id);
    event CandidateRemoved(uint256 indexed id);
    event VotingStarted(uint256 endTime);
    event VotingEnded(string reason);
    event Voted(address indexed voter, uint256 indexed candidateId, uint256 timestamp);

    error NotOwner();
    error InvalidState();
    error NotEnoughCandidates();
    error EndTimeInPast();
    error AlreadyVoted();
    error InvalidCandidate();
    error VotingClosed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
        _state = State.IDLE;
    }

    function addCandidate() external onlyOwner {
        if (_state != State.IDLE) revert InvalidState();
        uint256 id = nextCandidateId;
        nextCandidateId++;
        isActive[id] = true;
        candidateCount++;
        emit CandidateAdded(id);
    }

    function removeCandidate(uint256 id) external onlyOwner {
        if (_state != State.IDLE) revert InvalidState();
        if (!isActive[id]) revert InvalidCandidate();
        isActive[id] = false;
        candidateCount--;
        emit CandidateRemoved(id);
    }

    function startVoting(uint256 _endTime) external onlyOwner {
        if (_state != State.IDLE) revert InvalidState();
        if (candidateCount < 2) revert NotEnoughCandidates();
        if (_endTime <= block.timestamp) revert EndTimeInPast();
        _state = State.ACTIVE;
        endTime = _endTime;
        emit VotingStarted(_endTime);
    }

    function vote(uint256 id) external {
        if (_state != State.ACTIVE) revert InvalidState();
        if (block.timestamp >= endTime) revert VotingClosed();
        if (hasVoted[msg.sender]) revert AlreadyVoted();
        if (!isActive[id]) revert InvalidCandidate();
        hasVoted[msg.sender] = true;
        votedFor[msg.sender] = id;
        votes[id]++;
        emit Voted(msg.sender, id, block.timestamp);
    }

    function endVoting() external onlyOwner {
        if (_state != State.ACTIVE) revert InvalidState();
        _state = State.ENDED;
        emit VotingEnded("manual");
    }

    function getResults()
        external
        view
        returns (uint256[] memory ids, uint256[] memory voteCounts)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < nextCandidateId; i++) {
            if (isActive[i]) count++;
        }
        ids = new uint256[](count);
        voteCounts = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < nextCandidateId; i++) {
            if (isActive[i]) {
                ids[idx] = i;
                voteCounts[idx] = votes[i];
                idx++;
            }
        }
    }

    // ACTIVE 상태라도 endTime이 지났으면 ENDED로 반환
    function getState() public view returns (State) {
        if (_state == State.ACTIVE && block.timestamp >= endTime) {
            return State.ENDED;
        }
        return _state;
    }

    function getMyVote() external view returns (bool voted, uint256 candidateId) {
        return (hasVoted[msg.sender], votedFor[msg.sender]);
    }
}
