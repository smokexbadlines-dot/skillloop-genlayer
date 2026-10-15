import json
from datetime import datetime, timezone

CONTRACT = "contracts/SkillLoop.py"
START = "2026-10-14T12:00:00+00:00"
EXPIRY = 1793193600  # 2026-10-28 UTC


def mock_verdict(vm, verdict):
    vm.mock_llm(r"You classify two proposed|You assess whether one", json.dumps({"verdict": verdict}))


def warp(vm, when):
    vm.warp(when)
    # gltest on Windows refreshes sender but not cached message_raw datetime.
    from genlayer import gl
    gl.message_raw["datetime"] = when


def register(vm, contract, owner, title, gives, wants):
    vm.sender = owner
    mock_verdict(vm, "CLEAR")
    result = contract.create_offer(title, gives, wants, EXPIRY)
    vm.clear_mocks()
    return result


def three_offers(vm, contract, alice, bob, charlie):
    warp(vm, START)
    a = register(vm, contract, alice, "API tests", "Write pytest tests for a Python REST API", "Write API reference docs for a Python REST API")
    b = register(vm, contract, bob, "API docs", "Write API reference docs for a Python REST API", "Audit the keyboard navigation of a React dashboard")
    c = register(vm, contract, charlie, "UI audit", "Audit the keyboard navigation of a React dashboard", "Write pytest tests for a Python REST API")
    return a, b, c


def review(vm, contract, giver, receiver, verdict):
    mock_verdict(vm, verdict)
    result = contract.review_match(giver, receiver)
    vm.clear_mocks()
    return result


def test_cycle_clears_and_completes(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    direct_vm.check_pickling = True
    contract = direct_deploy(CONTRACT)
    a, b, c = three_offers(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    assert review(direct_vm, contract, a, b, "FIT") == "FIT"
    assert review(direct_vm, contract, b, c, "FIT") == "FIT"
    assert review(direct_vm, contract, c, a, "FIT") == "FIT"
    cycle_id = contract.clear_next_cycle()
    cycle = json.loads(contract.get_cycle(cycle_id))
    assert cycle["offers"] == [1, 2, 3]
    assert cycle["status"] == "PROPOSED"
    with direct_vm.expect_revert("No reviewed"):
        contract.clear_next_cycle()
    for owner in (direct_alice, direct_bob, direct_charlie):
        direct_vm.sender = owner
        contract.accept_cycle(cycle_id)
    assert json.loads(contract.get_cycle(cycle_id))["status"] == "ACTIVE"
    for owner in (direct_alice, direct_bob, direct_charlie):
        direct_vm.sender = owner
        contract.submit_delivery(cycle_id, "https://raw.githubusercontent.com/example/repo/0123456789012345678901234567890123456789/README.md")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Only receiving"):
        contract.confirm_delivery(cycle_id, a)
    for receiver, giver in ((direct_bob, a), (direct_charlie, b), (direct_alice, c)):
        direct_vm.sender = receiver
        contract.confirm_delivery(cycle_id, giver)
    assert json.loads(contract.get_cycle(cycle_id))["status"] == "COMPLETED"
    with direct_vm.expect_revert("Confirmation window"):
        contract.confirm_delivery(cycle_id, c)


def test_delivery_url_and_deadline_guards(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy(CONTRACT)
    a, b, c = three_offers(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    for giver, receiver in ((a, b), (b, c), (c, a)):
        review(direct_vm, contract, giver, receiver, "FIT")
    cycle_id = contract.clear_next_cycle()
    for owner in (direct_alice, direct_bob, direct_charlie):
        direct_vm.sender = owner
        contract.accept_cycle(cycle_id)

    direct_vm.sender = direct_alice
    for url in ("http://example.com/work", "https://user@example.com/work", "https://example.com/work#draft", "https://example.com/" + "x" * 400):
        with direct_vm.expect_revert("Delivery needs an HTTPS URL"):
            contract.submit_delivery(cycle_id, url)
    with direct_vm.expect_revert("Delivery missing"):
        direct_vm.sender = direct_bob
        contract.confirm_delivery(cycle_id, a)

    direct_vm.sender = direct_alice
    contract.submit_delivery(cycle_id, "https://example.com/finished-work")
    with direct_vm.expect_revert("Delivery already submitted"):
        contract.submit_delivery(cycle_id, "https://example.com/other-work")

    deadline = json.loads(contract.get_cycle(cycle_id))["deliver_by"]
    warp(direct_vm, datetime.fromtimestamp(deadline, timezone.utc).isoformat())
    with direct_vm.expect_revert("Delivery window is closed"):
        contract.submit_delivery(cycle_id, "https://example.com/late-work")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Confirmation window is closed"):
        contract.confirm_delivery(cycle_id, a)


def test_negative_match_blocks_clear_and_replay(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy(CONTRACT)
    a, b, c = three_offers(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    review(direct_vm, contract, a, b, "FIT")
    review(direct_vm, contract, b, c, "NO_FIT")
    review(direct_vm, contract, c, a, "FIT")
    with direct_vm.expect_revert("Pair already reviewed"):
        review(direct_vm, contract, a, b, "FIT")
    with direct_vm.expect_revert("No reviewed"):
        contract.clear_next_cycle()


def test_validator_rejects_forged_judgment(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy(CONTRACT)
    a, b, _ = three_offers(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    mock_verdict(direct_vm, "FIT")
    contract.review_match(a, b)
    direct_vm.clear_mocks()
    mock_verdict(direct_vm, "NO_FIT")
    assert direct_vm.run_validator() is False


def test_reverse_cycle_and_board_snapshot(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy(CONTRACT)
    a, b, c = three_offers(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    for giver, receiver in ((a, c), (c, b), (b, a)):
        review(direct_vm, contract, giver, receiver, "FIT")
    cycle_id = contract.clear_next_cycle()
    board = json.loads(contract.get_board())
    assert board["offer_count"] == 3
    assert board["cycle_count"] == 1
    assert board["cycles"][0]["offers"] == [1, 3, 2]
    assert len(board["edges"]) == 3
    assert all(item["status"] == "RESERVED" for item in board["offers"])
    direct_vm.sender = direct_alice
    contract.accept_cycle(cycle_id)
    assert json.loads(contract.get_cycle(cycle_id))["accepted_offers"] == [1]


def test_owner_and_self_match_guards(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy(CONTRACT)
    a, b, c = three_offers(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    with direct_vm.expect_revert("Offers must differ"):
        contract.review_match(a, a)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only owner"):
        contract.cancel_offer(a)
    direct_vm.sender = direct_alice
    contract.cancel_offer(a)
    with direct_vm.expect_revert("Both offers must be open"):
        contract.review_match(a, b)
    with direct_vm.expect_revert("Only owner"):
        contract.cancel_offer(a)


def test_authorization_and_decline_release(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy(CONTRACT)
    a, b, c = three_offers(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    for giver, receiver in ((a, b), (b, c), (c, a)):
        review(direct_vm, contract, giver, receiver, "FIT")
    cycle_id = contract.clear_next_cycle()
    direct_vm.sender = direct_bob
    contract.decline_cycle(cycle_id)
    assert json.loads(contract.get_offer(b))["status"] == "CANCELLED"
    assert json.loads(contract.get_offer(a))["status"] == "OPEN"
    assert json.loads(contract.get_offer(c))["status"] == "OPEN"
    with direct_vm.expect_revert("Only a proposed"):
        contract.decline_cycle(cycle_id)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only owner"):
        contract.cancel_offer(a)


def test_expiry_and_vague_input(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy(CONTRACT)
    warp(direct_vm, START)
    direct_vm.sender = direct_alice
    mock_verdict(direct_vm, "VAGUE")
    with direct_vm.expect_revert("checkable deliverables"):
        contract.create_offer("Help", "Make it great", "Some support", EXPIRY)
    direct_vm.clear_mocks()
    a, b, c = three_offers(direct_vm, contract, direct_alice, direct_bob, direct_charlie)
    for giver, receiver in ((a, b), (b, c), (c, a)):
        review(direct_vm, contract, giver, receiver, "FIT")
    cycle_id = contract.clear_next_cycle()
    direct_vm.sender = direct_alice
    contract.accept_cycle(cycle_id)
    warp(direct_vm, "2026-10-17T12:00:00+00:00")
    contract.expire_cycle(cycle_id)
    assert json.loads(contract.get_cycle(cycle_id))["status"] == "EXPIRED"
    assert json.loads(contract.get_offer(a))["status"] == "OPEN"
    assert json.loads(contract.get_offer(b))["status"] == "CANCELLED"
    assert json.loads(contract.get_offer(c))["status"] == "CANCELLED"
